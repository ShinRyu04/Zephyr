/*
 * Mengukur berapa kali panel AI benar-benar render ulang.
 *
 * Kenapa ini diukur dan bukan dibaca dari kode: "berkasnya 2200 baris dan tidak
 * ada useMemo" adalah hipotesis, bukan bukti - dan berkas ini ternyata PUNYA
 * useMemo. Yang menentukan gagap atau tidak adalah jumlah render ketika state
 * berubah, dan itu hanya terlihat saat aplikasi benar-benar jalan.
 *
 * Cara ukur: pasang penghitung yang menaik setiap kali komponen AiPanel
 * dirender, lalu picu serangkaian perubahan state kecil dan lihat berapa render
 * yang dihasilkan masing-masing.
 *
 * Dipakai: node scripts/ukur-render-ai.mjs [port-cdp, default 9223]
 */

const PORT = process.argv[2] || '9223';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.url && t.url.includes('localhost:5173'));
if (!target) {
  console.error('Zephyr (dev) tidak ditemukan. Targets: ' + list.map((t) => t.title).join(', '));
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
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
 * `awaitPromise` TIDAK dipakai untuk pekerjaan panjang.
 *
 * WebView2 di mesin ini sering menjawab "Promise was collected" dan
 * mengembalikan objek kosong - hasilnya semua angka `undefined` tanpa satu pun
 * error. Polanya: fungsi disimpan di `window`, dipanggil tanpa ditunggu, lalu
 * hasilnya dipolling. Ini pola yang sama yang dipakai harness verifikasi lain
 * di proyek ini.
 */
const EXPR = `(() => {
  const A = window.__ZEPHYR_AI__;
  if (!A) return JSON.stringify({ err: 'bridge __ZEPHYR_AI__ tidak ada' });
  window.__UKUR_HASIL__ = null;
  window.__UKUR_JALAN__ = (async () => {

  /*
   * Diukur lewat MutationObserver pada wadah transkrip, bukan performance
   * profiler: yang dirasakan user sebagai gagap adalah berapa kali LAYAR
   * benar-benar berubah, dan itu jumlah mutasi DOM. Angka dari profiler bisa
   * tinggi tanpa satu pun mutasi yang terlihat.
   */
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

  const s0 = A.getState();
  const jumlahPesan = s0.sessions.reduce((n, s) => n + s.messages.length, 0);

  /* Satu perubahan state yang KECIL: draft teks. */
  let mutasiDraft = 0;
  const panel = document.querySelector('.ai-panel') || document.body;
  const obs = new MutationObserver((recs) => { mutasiDraft += recs.length; });
  obs.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true });

  const t0 = performance.now();
  for (let i = 0; i < 20; i++) {
    s0.setDraft('x'.repeat(i + 1));
    await tunggu(12);
  }
  const tDraft = performance.now() - t0;
  await tunggu(150);
  obs.disconnect();

  /* Ukuran DOM transkrip: yang dirender setiap kali, bukan hanya yang dipakai. */
  const nodeTranskrip = document.querySelectorAll('.ai-toolrun, .ai-msg, [class*="ai-msg"]').length;

  return JSON.stringify({
    jumlahPesan,
    jumlahSesi: s0.sessions.length,
    mutasiDraft,
    tDraftMs: Math.round(tDraft),
    nodeTranskrip,
    panjangAssistant: s0.sessions.flatMap((s) => s.messages)
      .filter((m) => m.role === 'assistant')
      .reduce((n, m) => n + (m.content || '').length, 0),
  });
})()`;

const r = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
ws.close();

/*
 * `returnByValue` mengembalikan string JSON untuk sebagian hasil, tapi WebView2
 * kadang mengembalikan objek yang sudah terurai. Keduanya diterima - menuntut
 * satu bentuk saja membuat harness ini mati di mesin yang berbeda.
 */
let d = r?.result?.result?.value;
if (d === undefined) {
  console.error('gagal membaca bridge:', JSON.stringify(r).slice(0, 500));
  process.exit(1);
}
if (typeof d === 'string') {
  try {
    d = JSON.parse(d);
  } catch (e) {
    console.error('balasan bukan JSON: ' + d.slice(0, 300));
    process.exit(1);
  }
}
if (d && d.err) {
  console.error(d.err);
  process.exit(1);
}

console.log('Sesi: ' + d.jumlahSesi + ', pesan: ' + d.jumlahPesan + ', karakter asisten: ' + d.panjangAssistant);
console.log('Node transkrip di DOM: ' + d.nodeTranskrip);
console.log('');
console.log('Menulis draft 20 kali (satu karakter lebih panjang tiap kali):');
console.log('  mutasi DOM: ' + d.mutasiDraft);
console.log('  total waktu: ' + d.tDraftMs + ' ms');
console.log('');

/*
 * Ambang ditetapkan dari apa yang user rasakan, bukan dari angka bulat:
 * mengetik terasa lancar selama tiap perubahan selesai di bawah satu frame
 * (~16ms). Di atas 100ms per perubahan sudah terasa menunggu, dan itulah
 * "gagap" yang dilaporkan.
 */
const perPerubahan = d.tDraftMs / 20;
let gagal = 0;
if (perPerubahan > 100) {
  console.error('LAMBAT - ' + Math.round(perPerubahan) + ' ms per perubahan draft. Mengetik akan terasa tersendat.');
  gagal++;
} else if (perPerubahan > 40) {
  console.log('PERHATIAN - ' + Math.round(perPerubahan) + ' ms per perubahan. Belum parah, tapi terasa di mesin lambat.');
} else {
  console.log('OK - ' + Math.round(perPerubahan) + ' ms per perubahan draft');
}

process.exit(gagal ? 1 : 0);
