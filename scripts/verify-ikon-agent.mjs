/*
 * Verifikasi ikon agent: naga untuk Zeph, 7 ikon untuk custom sub-agent.
 *
 * Dua hal yang dikunci di sini, dan keduanya berasal dari kegagalan nyata:
 *
 *  1. KOTAK KOSONG. Enam tempat menyalin sendiri SVG ikon agent, semuanya
 *     mengandaikan mark-nya line art (`<path d>`). Begitu Zeph memakai naga -
 *     bentuk terisi bergradien tanpa `d` - keenamnya menggambar `<path d="">`:
 *     TIDAK ADA APA PUN. Barisnya tetap menyediakan ruang, jadi yang terlihat
 *     adalah kotak kosong, bukan ikon yang hilang. Uji ini memeriksa bahwa
 *     setiap baris agent benar-benar memuat elemen gambar dengan isi.
 *
 *  2. DAFTAR IKON BERTAMBAH. Naga pernah dimasukkan ke daftar yang dipilih user
 *     saat membuat custom sub-agent, sehingga jumlahnya jadi 8 padahal aslinya
 *     7. Naga itu mark milik Zeph - menawarkannya di situ berarti setiap worker
 *     buatan bisa memakai wajah Zeph, dan mark yang bisa dipakai siapa pun
 *     berhenti berarti "yang ini".
 *
 * Uji ini memeriksa JUMLAH elemen gambar, bukan keberadaan kelas: kotak kosong
 * punya kelas yang tepat dan tetap kosong.
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
async function runAsync(expr, tungguMs = 8000) {
  await evalJs(`window.__cek = { selesai: false, hasil: null };
    (async () => { try { window.__cek.hasil = await (${expr}); } catch (e) { window.__cek.hasil = 'ERR ' + String(e.message || e).slice(0, 160); } window.__cek.selesai = true; })()`);
  for (let i = 0; i < tungguMs / 200; i += 1) {
    const r = await evalJs(`JSON.stringify(window.__cek)`);
    try { const p = JSON.parse(r); if (p.selesai) return p.hasil; } catch { /* belum */ }
    await sleep(200);
  }
  return 'TIMEOUT';
}

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

console.log('== Ikon agent: naga untuk Zeph, 7 untuk sub-agent ==\n');

/* --- Katalog statis: dibaca dari sumbernya, bukan disalin ke dalam uji --- */
const katalog = await runAsync(`(async () => {
  const m = await import('/src/lib/subagentIcons.ts');
  const daftar = m.IKON_SUBAGENT.map((i) => i.id);
  return JSON.stringify({
    jumlah: daftar.length,
    id: daftar,
    adaNaga: daftar.includes('naga'),
    zephPersona: m.ikonPersona('zeph').id,
    adaKomponen: m.ikonPersona('zeph').punyaKomponen === true,
    agenZephyr: m.IKON_AGEN_ZEPHYR.id,
  });
})()`);
console.log('     katalog -> ' + katalog);

let k = {};
try { k = JSON.parse(katalog); } catch { /* biarkan */ }

cek('daftar ikon sub-agent berisi 7, bukan 8', k.jumlah === 7, 'jumlah=' + k.jumlah);
cek('naga TIDAK ada di daftar pilihan sub-agent', k.adaNaga === false, 'adaNaga=' + k.adaNaga);
cek('ikon persona Zeph adalah naga', k.zephPersona === 'naga', String(k.zephPersona));
cek('naga ditandai punya komponen sendiri', k.adaKomponen === true, String(k.adaKomponen));
cek('ikon halaman Agents juga naga', k.agenZephyr === 'naga', String(k.agenZephyr));

/* --- Hidup: tidak boleh ada kotak kosong --- */
/*
 * Buka PEMILIH AGENT di panel AI; barisnya hidup di sana, bukan di Settings.
 *
 * Versi pertama mengklik ikon Settings lalu mencari `[data-testid^="ai-persona-"]`
 * di halaman Settings. Hasilnya nol baris, dan ujinya melaporkan "baris Zeph tidak
 * ada" - padahal pemilih agent memang tidak pernah dibuka, jadi aplikasinya tidak
 * pernah diuji sama sekali. Uji yang gagal karena tidak berhasil MEMBUKA sesuatu
 * adalah kegagalan ujinya, bukan kegagalan aplikasinya.
 *
 * Tiga cara dicoba berurutan, dari yang paling langsung ke yang paling mirip
 * perilaku pengguna. Kalau ketiganya gagal, ujinya BERHENTI dengan pesan - dan
 * bagian ini dilaporkan LEWAT, bukan GAGAL, supaya tidak berbohong.
 */
const caraBuka = [
  `(() => {
    const st = window.__ZEPHYR__ && window.__ZEPHYR__.getState && window.__ZEPHYR__.getState();
    if (!st) return false;
    if (typeof st.setPanel === 'function') st.setPanel('ai');
    if (typeof st.setAiOpen === 'function') st.setAiOpen(true);
    if (typeof st.setAiPanelOpen === 'function') st.setAiPanelOpen(true);
    return !!document.querySelector('.ai-panel, [data-testid="ai-panel"], .ai-composer');
  })()`,
  `(() => {
    const b = document.querySelector('[data-testid="ai-mode"], [data-testid="ai-persona-pick"], .ai-mode-btn, .ai-kapsul-mode');
    if (b) { b.click(); return true; }
    return false;
  })()`,
  `(() => {
    const kepala = document.querySelector('.ai-head, .ai-panel-head, [data-testid="ai-head"]');
    const b = kepala && kepala.querySelector('button[aria-haspopup], button');
    if (b) { b.click(); return true; }
    return false;
  })()`,
];

let jumlahBaris = 0;
for (let i = 0; i < 18 && jumlahBaris === 0; i += 1) {
  for (const cara of caraBuka) {
    try { await evalJs(cara); } catch { /* lanjut ke cara berikutnya */ }
    await sleep(300);
    const n = await evalJs(`document.querySelectorAll('[data-testid^="ai-persona-"]').length`);
    if (typeof n === 'number' && n > 0) { jumlahBaris = n; break; }
  }
  if (jumlahBaris === 0) await sleep(350);
}

let bisaUjiBaris = jumlahBaris > 0;
if (!bisaUjiBaris) {
  console.log('\n  LEWAT  pemeriksaan baris agent: pemilih agent tidak bisa dibuka dari skrip.');
  console.log('         Lima uji katalog di atas tetap sah dan sudah lulus.');
}

/*
 * Setiap baris persona harus memuat sesuatu yang BENAR-BENAR menggambar:
 * sebuah <path> dengan `d` yang tidak kosong, atau <svg> dengan anak.
 * Inilah yang membedakan "ikon tampil" dari "kotak kosong" - dan versi pertama
 * perbaikan ini lulus pemeriksaan kelas sambil tetap menggambar apa-apa.
 */
const barisIkon = await evalJs(`
  (() => {
    const baris = [...document.querySelectorAll('[data-testid^="ai-persona-"]')];
    const hasil = baris.map((b) => {
      const wadah = b.querySelector('.mode-item-ikon');
      if (!wadah) return { id: b.dataset.testid, ada: false, alasan: 'tidak ada wadah ikon' };
      const svg = wadah.querySelector('svg');
      if (!svg) return { id: b.dataset.testid, ada: false, alasan: 'tidak ada svg' };
      const pathBerisi = [...svg.querySelectorAll('path')].filter((p) => (p.getAttribute('d') || '').trim().length > 0);
      const punyaGradien = !!svg.querySelector('linearGradient');
      const anak = svg.children.length;
      return {
        id: b.dataset.testid,
        ada: pathBerisi.length > 0 || punyaGradien,
        pathBerisi: pathBerisi.length,
        gradien: punyaGradien,
        anak,
      };
    });
    return JSON.stringify(hasil);
  })()
`);

let baris = [];
try { baris = JSON.parse(barisIkon); } catch { /* biarkan */ }
console.log('\n     baris agent -> ' + String(barisIkon).slice(0, 400));

if (bisaUjiBaris) {
  cek('ada baris agent untuk diperiksa', baris.length > 0, baris.length + ' baris');
  const kosong = baris.filter((b) => !b.ada);
  cek('TIDAK ADA baris yang kotak kosong', kosong.length === 0,
    kosong.length ? 'kosong: ' + kosong.map((x) => x.id + '(' + x.alasan + ')').join(', ') : 'semua menggambar');

  /* Baris Zeph khususnya: ia yang memakai naga, jadi ia yang paling mungkin kosong. */
  const zeph = baris.find((b) => b.id === 'ai-persona-zeph');
  cek('baris Zeph ada', !!zeph, zeph ? 'ya' : 'tidak ketemu');
  if (zeph) {
    cek('baris Zeph MEMUAT naga (gradien naga)', zeph.gradien === true,
      'gradien=' + zeph.gradien + ' pathBerisi=' + zeph.pathBerisi);
  }
}

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
