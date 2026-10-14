/*
 * Verifikasi aturan narasi per langkah ada di blok prompt ID dan EN.
 *
 * Jebakan yang membuat versi lama tidak berguna:
 *
 * 1. Blok prompt dipilih `bahasaPrompt()` yang membaca `settings.general.uiLang`,
 *    BUKAN argumen `answerLang` milik systemPromptFor. Jadi memanggil
 *    systemPromptFor('id', ...) tidak menghasilkan blok ID - ia tetap memakai
 *    blok sesuai uiLang. Harness lama mengukur argumen yang salah dan melaporkan
 *    "aturan ID hilang" padahal aturannya ada.
 * 2. Harness lama tidak punya assert sama sekali: ia mencetak hasil lalu keluar
 *    0 apa pun yang terjadi. Harness yang tidak bisa gagal bukan harness.
 *
 * Jadi harness ini mengubah uiLang ke id lalu ke en, membangun prompt dari
 * tiap bahasa, memeriksa aturannya, dan mengembalikan uiLang seperti semula.
 */
const PORT = process.argv[2] || '9223';
let list;
try {
  list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch (e) {
  console.log(`TIDAK BERLAKU: app tidak hidup di port ${PORT} (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
if (!page) {
  console.log(`TIDAK BERLAKU: tidak ada halaman app di port ${PORT}.`);
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

/*
 * Each rule is checked by a SHORT distinctive phrase, not by the whole
 * sentence. Rewording the prompt must not be able to silently flip this test:
 * the phrasing was already rewritten twice, and a harness that matched the
 * old full sentence reported a healthy prompt as broken both times.
 */
const expr = `(async () => {
  const m = await import('/src/lib/systemPrompt.ts');
  const store = window.__ZEPHYR__.getState();
  const asli = store.settings.general.uiLang;
  const Aturan = {
    id: [
      /* Teks nyata di src/lib/systemPrompt.ts: :323 narasi, :325 kalau tool
         gagal, :304 hemat tool, dan 'beberapa baris pendek' juga di :323.
         Tiga jarum lama ('Setiap langkah kerja disertai', 'Kalau sebuah tool
         gagal', 'Pakai tool hanya kalau memberi informasi baru') tidak ada lagi
         di src/ sama sekali - 0 kemunculan. */
      ['narasi', 'Katakan apa yang sedang kamu kerjakan'],
      ['gagalSebarangBaris', 'Kalau tool gagal, bilang gagal'],
      ['giliranBanyakBaris', 'beberapa baris pendek'],
      ['hematTool', 'Pakai tool hanya kalau memberi info baru'],
    ],
    en: [
      ['narasi', 'Say what you are doing'],
      ['gagalSebarangBaris', 'If a tool failed, say it failed'],
      ['giliranBanyakBaris', 'several short lines'],
      ['hematTool', 'Spend a tool call only when it brings something new'],
    ],
  };
  const hasil = { asli, id: {}, en: {} };
  for (const lang of ['id', 'en']) {
    await window.__ZEPHYR__.getState().applySettings({
      general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: lang },
    });
    const p = m.systemPromptFor(lang, '', '', '', '', 'santai');
    for (const [nama, jarum] of Aturan[lang]) hasil[lang][nama] = p.includes(jarum);
  }
  await window.__ZEPHYR__.getState().applySettings({
    general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: hasil.asli },
  });
  hasil.uiLangDipulihkan = window.__ZEPHYR__.getState().settings.general.uiLang;
  window.__CEK_NARASI__ = hasil;
  return 'ok';
})()`;

let r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log('import:', r.result?.result?.value ?? JSON.stringify(r.result).slice(0, 200));
/*
 * PRASYARAT PENGUKURAN. Versi lama meneruskan apa pun ke `JSON.parse(... ?? '{}')`,
 * jadi evaluasi yang gagal menghasilkan h={} dan DELAPAN aturan dicetak GAGAL
 * padahal tidak satu pun pernah diukur - laporan 1/9 yang menyesatkan.
 */
const impor = r.result?.result?.value;
if (impor !== 'ok') {
  console.log('TIDAK BERLAKU: pengukuran pertama tidak menghasilkan apa pun (h akan jadi {} dan 8 aturan dicetak GAGAL padahal tak pernah diukur).');
  console.log(`  import -> ${JSON.stringify(impor)}  exceptionDetails -> ${JSON.stringify(r.result?.exceptionDetails?.text ?? null)}`);
  ws.close();
  process.exit(2);
}
r = await send('Runtime.evaluate', {
  expression: 'JSON.stringify(window.__CEK_NARASI__)',
  returnByValue: true,
});
ws.close();

const keluaran = r.result?.result?.value;
if (typeof keluaran !== 'string') {
  console.log('TIDAK BERLAKU: hasil pengukuran (window.__CEK_NARASI__) tidak bisa dibaca.');
  process.exit(2);
}
let h;
try {
  h = JSON.parse(keluaran);
} catch (e) {
  console.log(`TIDAK BERLAKU: hasil pengukuran tidak terbaca sebagai JSON (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
if (!h || typeof h !== 'object' || !h.id || !h.en || typeof h.asli !== 'string') {
  console.log('TIDAK BERLAKU: hasil pengukuran tidak lengkap, jadi tidak ada yang bisa dinilai.');
  console.log(`  h -> ${JSON.stringify(h).slice(0, 200)}`);
  process.exit(2);
}
let lulus = 0;
const total = 8;
for (const lang of ['id', 'en']) {
  for (const [nama, ok] of Object.entries(h[lang] ?? {})) {
    console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${lang}.${nama}`);
    if (ok) lulus++;
  }
}
/* `undefined === undefined` dulu LULUS PALSU; dua-duanya harus string dan sama. */
const pulih = typeof h.uiLangDipulihkan === 'string' && h.uiLangDipulihkan === h.asli;
console.log(`  ${pulih ? 'OK  ' : 'GAGAL'}  uiLang dipulihkan (${h.asli})`);
if (pulih) lulus++;
console.log(`\n== ${lulus}/${total + 1} lulus ==`);
process.exit(lulus === total + 1 ? 0 : 1);