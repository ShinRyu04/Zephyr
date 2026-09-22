// uji-blank.mjs — bukti bug "layar blank" (Settings → Model AI) sudah mati.
//
// Reproduksi asli: patch settings `{ models: { answerLang } }` di-merge DANGKAL
// oleh applySettings → `models.providers` hilang → ModelsSection crash
// (`reading 'gemini'`) → React melepas seluruh tree → jendela kosong.
//
// Tes ini memaksa kondisi itu lewat store, lalu memeriksa:
//   A. setelah patch parsial, `models.providers` MASIH ada  (fix mergeDalam)
//   B. halaman Settings → Model AI tetap render (tidak blank)
//   C. root masih punya anak (app hidup), bukan layar kosong
import WebSocket from 'ws';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));

let id = 0;
const pending = new Map();
const ex = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id) {
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); p(m); }
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    ex.push((d.exception?.description ?? d.text).split('\n')[0]);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 7000));

const ev = async (expr, awaitP = false) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: awaitP,
  });
  return r.result?.result?.value;
};

const hasil = [];
const cek = (nama, lulus, info = '') => {
  hasil.push({ nama, lulus, info });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  → ' + info : ''}`);
};

// ---------------------------------------------------------------- A
// Simulasi bug: patch parsial models (persis yang dikirim dropdown UI).
const sebelum = await ev(
  `JSON.stringify(Object.keys(window.__ZEPHYR__.getState().settings.models.providers || {}))`,
);
const patchOk = await ev(
  `(async () => {
     await window.__ZEPHYR__.getState().applySettings({ models: { answerLang: 'id' } });
     const m = window.__ZEPHYR__.getState().settings.models;
     return JSON.stringify({ keys: Object.keys(m.providers || {}), lang: m.answerLang });
   })()`,
  true,
);
console.log(`providers sebelum : ${sebelum}`);
console.log(`providers sesudah : ${patchOk}`);
const setelah = JSON.parse(patchOk ?? '{}');
cek(
  'A. patch parsial tidak menghapus models.providers',
  setelah.keys && setelah.keys.length > 0,
  `${setelah.keys?.length ?? 0} provider tersisa`,
);

// ---------------------------------------------------------------- B
// Buka Settings → Model AI, pastikan render penuh.
await ev(
  `(() => {
     const S = window.__ZEPHYR__;
     S.getState().setSettingsOpen(true);
     S.getState().setActivity('settings');
     window.__ZEPHYR_SET__.ui.getState().setSection('models');
     return 'ok';
   })()`,
);
await new Promise((r) => setTimeout(r, 2500));

const dom = await ev(
  `JSON.stringify({
     provRows: document.querySelectorAll('[data-testid^="prov-model-"]').length,
     provList: document.querySelectorAll('.prov-list').length,
     errCard: document.querySelectorAll('.err-boundary').length,
     rootKids: document.getElementById('root').children.length,
     bodyLen: document.body.innerText.length,
   })`,
);
const d = JSON.parse(dom ?? '{}');
console.log(`DOM               : ${dom}`);
cek('B. ModelsSection render (daftar provider tampil)', (d.provRows ?? 0) > 0, `${d.provRows} baris`);
cek('B2. tidak ada kartu error', (d.errCard ?? 0) === 0, `${d.errCard} kartu`);
cek('C. app hidup (root ada isi)', (d.rootKids ?? 0) > 0 && (d.bodyLen ?? 0) > 200, `${d.bodyLen} char`);

const nyata = ex.filter((t) => /gemini|providers|ModelsSection/.test(t));
cek('D. tidak ada exception ModelsSection', nyata.length === 0, nyata[0] ?? 'bersih');

// Tutup settings lagi (harness fase 02/03 mengharapkan empty-state editor).
await ev(`window.__ZEPHYR__.getState().setSettingsOpen(false)`);
await new Promise((r) => setTimeout(r, 800));

const lulus = hasil.filter((h) => h.lulus).length;
console.log('');
console.log(`== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
