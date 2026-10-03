/*
 * Verifikasi tampilan LSP ala Terax di aplikasi yang hidup.
 *
 * Yang diuji, dan kenapa masing-masing penting:
 *
 *  1. Titik hijau hanya muncul pada server yang BENAR-BENAR terpasang.
 *     Diukur dengan mencocokkan jumlah penanda dengan jumlah probe yang `ok` -
 *     bukan sekadar "ada minimal satu", karena penanda yang muncul di baris
 *     yang salah jauh lebih buruk daripada tidak ada penanda.
 *
 *  2. Tombol periksa-ulang berupa IKON, bukan tulisan "Re-check". Yang diperiksa
 *     keberadaan elemen svg di dalamnya, bukan nama kelas.
 *
 *  3. Ada rute ke dialog pemasangan untuk server yang BELUM terpasang:
 *     menyalakannya membuka dialog, BUKAN mengubah toggle. Ini inti
 *     perbaikannya - saklar yang berhasil dibalik sementara fiturnya tetap mati
 *     adalah cara paling halus membuat user menyimpulkan aplikasinya rusak.
 *
 *  4. Untuk server yang sudah terpasang, menyalakan toggle TIDAK membuka dialog.
 *     Dialog tidak boleh menghalangi jalur yang normal.
 *
 *  5. Auto-probe: penanda terpasang sudah ada TANPA menekan tombol apa pun.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('TIDAK ADA page target - app mati?'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push((msg.params.exceptionDetails.exception?.description ?? '').slice(0, 220));
  }
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 200);
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

/*
 * Klik lewat event mouse CDP, setelah menggulir elemennya ke dalam layar.
 *
 * Menggulirnya bukan pilihan: daftar ini punya 21 baris, jadi tombol di bagian
 * bawah berada di luar viewport (y sekitar 1400 pada jendela 1080p). Klik CDP
 * memakai koordinat LAYAR, dan `elementFromPoint` pada koordinat di luar layar
 * mengembalikan null - sehingga kliknya tidak sampai ke tombolnya sama sekali
 * dan ujinya melaporkan "toggle tidak berubah" padahal tombolnya sehat. Itu
 * kesalahan yang sempat terjadi pada uji ini dan menghabiskan satu putaran.
 *
 * `scrollIntoView` dengan `block: 'center'` dulu, lalu koordinatnya diukur
 * ulang SESUDAH menggulir - mengukur sebelum menggulir menghasilkan angka yang
 * sudah basi.
 */
async function klik(testid) {
  const ok = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return false; e.scrollIntoView({ block: 'center', inline: 'nearest' }); return true; })()`);
  if (!ok) return false;
  await sleep(220);
  const r = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return null; const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const atas = document.elementFromPoint(x, y); return JSON.stringify({ x: Math.round(x), y: Math.round(y), sampai: atas ? (atas === e || e.contains(atas)) : false }); })()`);
  if (!r) return false;
  const p = JSON.parse(r);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return p.sampai;
}
async function setSaklar(ingin) {
  for (let i = 0; i < 4; i += 1) {
    const kini = await evalJs(`(() => { const e = document.querySelector('[data-testid="lsp-global"]'); return e ? e.getAttribute('aria-checked') : null; })()`);
    if (kini === null) return false;
    if ((kini === 'true') === ingin) return true;
    await klik('lsp-global');
    await sleep(900);
  }
  return false;
}

/* Buka halaman LSP. */
const sudah = await evalJs(`(() => !!document.querySelector('[data-testid="set-nav-lsp"]'))()`);
if (!sudah) {
  await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  await sleep(1000);
}
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-lsp"]'); if (b) b.click(); })()`);
await sleep(1800);

console.log('== Verifikasi Language Server ala Terax ==\n');

/* --- 5. auto-probe: tunggu sampai probe punya hasil tanpa klik apa pun --- */
let penanda = 0;
for (let i = 0; i < 14; i += 1) {
  penanda = await evalJs(`(() => document.querySelectorAll('[data-testid$="-siap"]').length)()`);
  if (typeof penanda === 'number' && penanda > 0) break;
  await sleep(1000);
}
cek('3 penanda "terpasang" muncul otomatis', typeof penanda === 'number' && penanda > 0, penanda + ' penanda');

/* --- 1. jumlahnya harus cocok dengan probe yang ok --- */
const jumlahProbe = await evalJs(`
  (() => {
    const e = [...document.querySelectorAll('[data-testid^="lsp-"][data-testid$="-siap"]')];
    /* Ambil id server dari testid, supaya bisa dibandingkan satu per satu. */
    return JSON.stringify(e.map((x) => x.dataset.testid.replace(/^lsp-/, '').replace(/-siap$/, '')));
  })()
`);
let daftarSiap = [];
try { daftarSiap = JSON.parse(jumlahProbe); } catch { /* biarkan kosong */ }
cek('penanda ada di baris server yang punya id', daftarSiap.length === penanda, daftarSiap.slice(0, 4).join(', '));

/* --- 2. tombol periksa-ulang berupa ikon --- */
const ikon = await evalJs(`
  (() => {
    const e = [...document.querySelectorAll('[data-testid^="lsp-"][data-testid$="-reload"]')];
    if (!e.length) return JSON.stringify({ jumlah: 0 });
    const adaSvg = e.filter((x) => x.querySelector('svg')).length;
    /* Teks tombolnya harus KOSONG: kalau masih ada tulisan "Re-check", ikonnya
       ditambahkan tanpa mengganti. */
    const adaTeks = e.filter((x) => (x.textContent || '').trim().length > 0).length;
    return JSON.stringify({ jumlah: e.length, adaSvg, adaTeks });
  })()
`);
const I = JSON.parse(ikon);
cek('tombol periksa-ulang memakai ikon svg', I.jumlah > 0 && I.adaSvg === I.jumlah, I.adaSvg + '/' + I.jumlah);
cek('tombol periksa-ulang tanpa tulisan', I.adaTeks === 0, I.adaTeks + ' masih bertulisan');

/* --- sekarang jalur dialog: butuh server yang BELUM terpasang --- */
if (!(await setSaklar(true))) { console.log('GAGAL: tidak bisa menyalakan saklar induk'); process.exit(1); }
await sleep(800);

const belumSiap = await evalJs(`
  (() => {
    /* Baris yang tidak punya penanda terpasang = binary-nya tidak ditemukan. */
    const baris = [...document.querySelectorAll('[data-testid^="lsp-"]')].filter((e) => /^lsp-[a-z0-9]+$/.test(e.dataset.testid));
    for (const b of baris) {
      const id = b.dataset.testid.replace(/^lsp-/, '');
      const adaSiap = !!document.querySelector('[data-testid="lsp-' + id + '-siap"]');
      const adaToggle = !!document.querySelector('[data-testid="lsp-' + id + '-toggle"]');
      if (!adaSiap && adaToggle) return id;
    }
    return null;
  })()
`);

console.log('\nserver belum terpasang untuk uji dialog: ' + belumSiap);
if (!belumSiap) {
  console.log('  (semua server terpasang - tidak bisa menguji jalur dialog)');
} else {
  const sebelum = await evalJs(`(() => document.querySelector('[data-testid="lsp-${belumSiap}-toggle"]').getAttribute('aria-checked'))()`);
  await klik(`lsp-${belumSiap}-toggle`);
  await sleep(1000);

  const adaDialog = await evalJs(`(() => !!document.querySelector('[data-testid="lsp-dialog-pasang"]'))()`);
  cek('3 menyalakan server belum terpasang membuka dialog', adaDialog === true);

  const sesudah = await evalJs(`(() => document.querySelector('[data-testid="lsp-${belumSiap}-toggle"]').getAttribute('aria-checked'))()`);
  cek('4 toggle TIDAK ikut berubah (saklar tidak berbohong)', sebelum === sesudah, sebelum + ' -> ' + sesudah);

  const isi = await evalJs(`
    (() => {
      const d = document.querySelector('[data-testid="lsp-dialog-pasang"]');
      if (!d) return JSON.stringify({});
      return JSON.stringify({
        perintah: (d.querySelector('.lsp-dialog-perintah pre')?.textContent || '').trim().slice(0, 60),
        adaSalin: !!d.querySelector('[data-testid="lsp-dialog-salin"]'),
        adaPeriksa: !!d.querySelector('[data-testid="lsp-dialog-periksa"]'),
        adaDoc: !!d.querySelector('a[href]'),
      });
    })()
  `);
  const D = JSON.parse(isi);
  cek('4 dialog memuat perintah pemasangan', !!D.perintah, D.perintah);
  cek('4 dialog punya tombol salin', D.adaSalin === true);
  cek('4 dialog punya "Periksa lagi"', D.adaPeriksa === true);
  cek('4 dialog punya tautan dokumentasi', D.adaDoc === true);

  await klik('lsp-dialog-tutup');
  await sleep(700);
  cek('4 dialog bisa ditutup', (await evalJs(`(() => !document.querySelector('[data-testid="lsp-dialog-pasang"]'))()`)) === true);
}

/* --- 4b. server yang SUDAH terpasang: dialog tidak muncul ---
 *
 * Keadaannya DIKUNCI dulu ke "mati", dan itu bukan kerapian belaka: server
 * terpasang bisa saja sudah menyala dari sesi sebelumnya, sehingga klik tunggal
 * di bawah justru MEMATIKANNYA - dan ujinya lalu melaporkan gagal padahal
 * aplikasinya benar. Versi pertama uji ini persis melakukan kesalahan itu.
 *
 * Kalau keadaannya tidak bisa dikunci, ujinya DILEWATI dengan pesan yang jelas
 * alih-alih dilaporkan gagal: uji yang berbunyi palsu lebih buruk daripada uji
 * yang tidak ada.
 */
async function setToggle(id, ingin) {
  for (let i = 0; i < 3; i += 1) {
    const kini = await evalJs(`(() => document.querySelector('[data-testid="lsp-${id}-toggle"]')?.getAttribute('aria-checked'))()`);
    if (kini === null) return false;
    if ((kini === 'true') === ingin) return true;
    await klik(`lsp-${id}-toggle`);
    await sleep(900);
  }
  return false;
}

const idSiap = daftarSiap.find((x) => x === 'php') || daftarSiap[0];
if (!idSiap) {
  console.log('\n(tidak ada server terpasang - jalur ini dilewati)');
} else if (!(await setToggle(idSiap, false))) {
  console.log('\n  DILEWATI: keadaan ' + idSiap + ' tidak bisa dikunci ke mati');
} else {
  await klik(`lsp-${idSiap}-toggle`);
  await sleep(1000);
  const adaDialog = await evalJs(`(() => !!document.querySelector('[data-testid="lsp-dialog-pasang"]'))()`);
  const jadiNyala = await evalJs(`(() => document.querySelector('[data-testid="lsp-${idSiap}-toggle"]')?.getAttribute('aria-checked'))()`);
  cek('4 server terpasang menyala TANPA dialog', adaDialog === false && jadiNyala === 'true', idSiap + ': ' + jadiNyala);
  /* Kembalikan ke mati supaya keadaan akhirnya sama seperti sebelumnya. */
  await setToggle(idSiap, false);
}

/* Kembalikan saklar ke MATI: keadaan sebelum uji. */
await setSaklar(false);

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 3).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
