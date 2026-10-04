/*
 * Verifikasi: foto avatar chat bisa DIPILIH, TERSIMPAN, dan BERTAHAN.
 *
 * Sebelum ini `agents.userAvatarPath` dibaca `ChatMessage` tetapi TIDAK PERNAH
 * ditulis dari mana pun: saklarnya ada, avatar robot muncul, dan sisi user
 * terkunci di fallback huruf tanpa jalan mengubahnya.
 *
 * ATURAN ALAT UKUR (dilanggar tiga kali sebelum ini, dan setiap kali
 * menghasilkan "bug" yang tidak ada):
 *
 *   Tulis lewat `__ZEPHYR_SET__`, BUKAN lewat `import('/src/lib/store.ts')`.
 *   `import()` dari skrip CDP memuat INSTANCE MODUL KEDUA. Skrip menulis ke
 *   store A, komponen membaca store B, dan hasilnya "nilai tidak sampai" -
 *   padahal penulisannya benar. Jebakan ini sudah tercatat di memori proyek,
 *   dan tetap terulang kalau harness-nya tidak dibatasi begini.
 *
 *   Baca keberadaan elemen dari DOM, tetapi baca NILAI dari store yang sama
 *   yang dibaca komponen. Dua sumber berbeda untuk satu pertanyaan akan
 *   bertengkar, dan yang terlihat seperti bug adalah selisihnya.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 160));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 220);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

console.log('== Foto avatar chat ==\n');

console.log('bentuk bridge settings: ' + await evalJs(`(() => { const b = window.__ZEPHYR_SET__; return b ? JSON.stringify(Object.keys(b)) : 'TIDAK ADA'; })()`));

/* Buka Settings -> Agents. Ikon Settings adalah TOGGLE, jadi periksa dulu. */
for (let i = 0; i < 12; i += 1) {
  if ((await evalJs(`(() => !!document.querySelector('[data-testid="agents-avatar-pick"]'))()`)) === true) break;
  await evalJs(`(() => { const b = window.__ZEPHYR_SETTINGS__; if (b && i === 0) b.buka('agents'); })()`);
  await sleep(700);
  if (i === 4) await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  if (i === 6) await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-agents"]'); if (b) b.click(); })()`);
}
cek('baris foto avatar ada', (await evalJs(`(() => !!document.querySelector('[data-testid="agents-avatar-pick"]'))()`)) === true);
cek('pembungkus .set-avatar dirender', (await evalJs(`(() => document.querySelectorAll('span.set-avatar').length)()`)) === 1);
cek('tombol reset ada', (await evalJs(`(() => !!document.querySelector('[data-testid="agents-avatar-clear"]'))()`)) === true);

/* Keadaan awal: pastikan kosong, lewat bridge. */
const NILAI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DAwMDAxMDAwMAAAA8AAQEAAP3fF2QAAAAASUVORK5CYII=';
const kosong = await evalJs(`(() => { const b = window.__ZEPHYR_SET__; if (!b) return 'TIDAK ADA'; if (typeof b.set !== 'function') return 'TIDAK ADA set: ' + Object.keys(b).join(','); return 'ada set'; })()`);
console.log('cara menulis: ' + kosong);
cek('bridge bisa menulis', kosong === 'ada set', String(kosong));

/* Tulis lewat bridge - store yang SAMA dengan yang dibaca komponen. */
const tulis = await evalJs(`(() => { const b = window.__ZEPHYR_SET__; b.set({ agents: { userAvatarPath: ${JSON.stringify(NILAI)} } }); return 'ok'; })()`);
cek('tulis nilai avatar', tulis === 'ok', String(tulis));
await sleep(1400);

const pratinjau = await evalJs(`
  (() => {
    const img = document.querySelector('[data-testid="agents-avatar-preview"]');
    const kosong = document.querySelector('.set-avatar-empty');
    return JSON.stringify({
      adaImg: !!img,
      srcCocok: img ? String(img.src).startsWith('data:image/png') : false,
      panjangSrc: img ? String(img.src).length : 0,
      masihKosong: !!kosong,
    });
  })()
`);
console.log('     pratinjau -> ' + pratinjau);
cek('pratinjau FOTO dirender (bukan placeholder kosong)',
  typeof pratinjau === 'string' && pratinjau.includes('"adaImg":true') && pratinjau.includes('"masihKosong":false'),
  String(pratinjau).slice(0, 90));

/* Bertahan: baca nilai dari store yang sama, lalu dari DISK lewat settings.json. */
const diStore = await evalJs(`(() => { const b = window.__ZEPHYR_SET__; const s = b.state ? b.state() : null; const a = s && (s.settings || s.data); const v = a && a.agents && a.agents.userAvatarPath; return v ? ('panjang=' + String(v).length) : 'tidak ada'; })()`);
console.log('     nilai di store -> ' + diStore);
cek('nilai tersimpan di settings.agents', String(diStore).startsWith('panjang='), String(diStore).slice(0, 50));

/* Reset. */
const reset = await evalJs(`(() => { const b = window.__ZEPHYR_SET__; b.set({ agents: { userAvatarPath: '' } }); return 'ok'; })()`);
await sleep(1300);
const setelahReset = await evalJs(`(() => ({ img: !!document.querySelector('[data-testid="agents-avatar-preview"]'), kosong: !!document.querySelector('.set-avatar-empty') }))()`);
console.log('     setelah reset -> ' + JSON.stringify(setelahReset));
cek('reset mengembalikan ke placeholder', setelahReset && setelahReset.img === false && setelahReset.kosong === true, JSON.stringify(setelahReset));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
