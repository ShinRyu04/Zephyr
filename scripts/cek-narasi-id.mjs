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
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
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
      ['narasi', 'Setiap langkah kerja disertai'],
      ['gagalSebarangBaris', 'Kalau sebuah tool gagal'],
      ['giliranBanyakBaris', 'beberapa baris pendek'],
      ['hematTool', 'Pakai tool hanya kalau memberi informasi baru'],
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
r = await send('Runtime.evaluate', {
  expression: 'JSON.stringify(window.__CEK_NARASI__)',
  returnByValue: true,
});
ws.close();

const h = JSON.parse(r.result?.result?.value ?? '{}');
let lulus = 0;
const total = 8;
for (const lang of ['id', 'en']) {
  for (const [nama, ok] of Object.entries(h[lang] ?? {})) {
    console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${lang}.${nama}`);
    if (ok) lulus++;
  }
}
const pulih = h.uiLangDipulihkan === h.asli;
console.log(`  ${pulih ? 'OK  ' : 'GAGAL'}  uiLang dipulihkan (${h.asli})`);
if (pulih) lulus++;
console.log(`\n== ${lulus}/${total + 1} lulus ==`);
process.exit(lulus === total + 1 ? 0 : 1);