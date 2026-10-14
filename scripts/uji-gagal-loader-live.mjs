/*
 * uji-gagal-loader-live.mjs - paket yang GAGAL dimuat: apakah alasannya kelihatan?
 *
 * Sisi paling berbahaya dari marketplace bukan paket yang jalan, tapi paket yang
 * tidak jalan tanpa suara: terpasang, muncul di daftar, dan tidak ada apa-apa
 * yang berubah. Panel ekstensi mengklaim menjawabnya lewat dua daftar (`gagal`
 * dan `tidakDidukung`) - di sini dua paket rusak yang sengaja dibuat dipasang
 * lewat jalur yang sama dengan pengguna, lalu yang dibaca adalah DOM panelnya,
 * bukan nilai balik fungsi:
 *
 *   A. package.json rusak (JSON tidak sah)  -> harus muncul dengan pesannya
 *   B. bahasa dengan legacyMode tak dikenal -> harus muncul sebagai "tidak
 *      didukung" beserta alasan yang menyebut legacyMode-nya
 *
 * Paket buatan ini hidup di dalam repo (`.uji-gagal-live/`) dan dicabut lagi di
 * akhir; status pemasangan diperiksa supaya disk pengguna ditinggal seperti semula.
 *
 * Pemakaian: node scripts/uji-gagal-loader-live.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const PORT = 9223;
const AKAR = 'D:/Zephyr/.uji-gagal-live';
const PAKET_A = `${AKAR}/paket-manifest-rusak`;
const PAKET_B = `${AKAR}/paket-bahasa-takdidukung`;
const PAKET_C = `${AKAR}/paket-snippet-hilang`;
const ID_A = 'paket-manifest-rusak';
const ID_B = 'paket-bahasa-takdidukung';
const ID_C = 'zephyr.uji-snippet-hilang';

/* A: JSON yang jelas rusak (dipotong di tengah) - paket tetap bisa disalin. */
mkdirSync(PAKET_A, { recursive: true });
writeFileSync(`${PAKET_A}/package.json`, '{\n  "id": "paket-manifest-rusak",\n  "name": "Paket Manifest Rusak",\n', 'utf8');

/* B: manifest sah, tapi grammarnya tidak ada di tabel importer. */
mkdirSync(PAKET_B, { recursive: true });
writeFileSync(
  `${PAKET_B}/package.json`,
  JSON.stringify(
    {
      id: 'zephyr.uji-bahasa-ngawur',
      name: 'Uji Bahasa Ngawur',
      publisher: 'uji',
      version: '1.0.0',
      description: 'Paket uji: bahasa dengan legacyMode yang tidak ada.',
      engines: { zephyr: '>=1.0' },
      categories: ['Languages'],
      contributes: {
        languages: [
          { id: 'ujingawur', label: 'Uji Ngawur', extensions: ['.ujingawur'], legacyMode: 'mode-yang-tidak-ada' },
        ],
      },
    },
    null,
    2,
  ),
  'utf8',
);

/* C: manifest sah, tapi berkas snippet yang dideklarasikan tidak ada - inilah
   jalur `gagal` (sesuatu rusak saat dimuat, bukan sekadar tak didukung). */
mkdirSync(PAKET_C, { recursive: true });
writeFileSync(
  `${PAKET_C}/package.json`,
  JSON.stringify(
    {
      id: ID_C,
      name: 'Uji Snippet Hilang',
      publisher: 'uji',
      version: '1.0.0',
      description: 'Paket uji: snippet menunjuk berkas yang tidak ada.',
      engines: { zephyr: '>=1.0' },
      categories: ['Snippets'],
      contributes: { snippets: [{ language: 'rust', path: './snippets/tidak-ada.json' }] },
    },
    null,
    2,
  ),
  'utf8',
);

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const target = list.find((t) => /zephyr/i.test(t.title ?? '')) ?? list[0];
if (!target) {
  console.error(`tidak ada target CDP di port ${PORT} - jalankan aplikasinya dulu`);
  process.exit(2);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 1;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) =>
  new Promise((r) => { const id = seq++; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const d = r.result?.exceptionDetails;
  if (d) return `ERR ${d.exception?.description ?? d.text}`;
  return r.result?.result?.value;
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable');
console.log('== uji jalur gagal loader (paket rusak & bahasa tanpa grammar) ==');

/* Mulai dari keadaan bersih: kalau percobaan sebelumnya meninggalkan paket ini,
   hasilnya akan terbaca "sudah terpasang" dan mengaburkan kontrolnya. */
const bersihkan = async () => {
  /* Uninstall dicocokkan pada id MANIFEST (`terpasang()` memakai itu), bukan
     nama folder - paket B folder-nya bernama lain dan sempat tertinggal. */
  for (const id of [ID_A, ID_B, ID_C, 'zephyr.uji-bahasa-ngawur', 'zephyr.uji-snippet-hilang']) {
    if (await ev(`window.__ZEPHYR_EXT19__.terpasang().some((m) => m.id === ${JSON.stringify(id)})`)) {
      await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(id)})`);
    }
  }
  await ev(`window.__ZEPHYR_EXT19__.refresh()`);
  await jeda(1200);
};
await bersihkan();

/* Panel yang dilihat pengguna dibuka lebih dulu, supaya DOM-nya ada saat diukur.
   Mount-nya asinkron (Suspense), jadi ditunggu - panel yang belum ter-mount
   membaca semua daftar sebagai kosong dan itu akan terbaca "tidak ada masalah". */
await ev(`window.__ZEPHYR__.getState().setSidebarVisible(true); window.__ZEPHYR__.getState().setActivity('extensions'); 'ok'`);
let panelSiap = false;
for (let i = 0; i < 40 && !panelSiap; i++) {
  panelSiap = await ev(`!!document.querySelector('[data-testid=extensions-view]')`);
  if (!panelSiap) await jeda(250);
}
console.log('panel:', panelSiap ? 'ter-mount' : 'TIDAK ter-mount (angka di bawah tidak sah)');

/* Panel yang tidak menyebut apa pun sesudah paket rusak dicabut = kontrol negatif. */
const bacaPanel = async () => JSON.parse(await ev(`(() => {
  const teks = (sel) => Array.from(document.querySelectorAll(sel + ' li')).map((li) => li.textContent.trim());
  return JSON.stringify({
    jumlah: document.querySelector('[data-testid=ext-ringkas-jumlah]')?.textContent.trim() ?? null,
    err: document.querySelector('[data-testid=ext-err]')?.textContent.trim() ?? null,
    gagal: teks('[data-testid=ext-ringkas-gagal]'),
    skip: teks('[data-testid=ext-ringkas-skip]'),
    bersih: document.querySelector('[data-testid=ext-ringkas-bersih]')?.textContent.trim() ?? null,
  });
})()`));

console.log('[0] panel sebelum paket rusak dipasang');
const awal = await bacaPanel();
console.log('   ', JSON.stringify(awal));

console.log('[1] pasang tiga paket rusak lewat jalur install yang sama dengan pengguna');
console.log('    A (manifest rusak) ->', await ev(`window.__ZEPHYR_EXT19__.install(${JSON.stringify(PAKET_A)})`));
await jeda(400);
const panelA = await bacaPanel();
console.log('    panel sesudah A:', JSON.stringify({ err: panelA.err ?? null }));
console.log('    B (bahasa tanpa grammar) ->', await ev(`window.__ZEPHYR_EXT19__.install(${JSON.stringify(PAKET_B)})`));
console.log('    C (snippet menunjuk berkas hilang) ->', await ev(`window.__ZEPHYR_EXT19__.install(${JSON.stringify(PAKET_C)})`));
await ev(`window.__ZEPHYR_EXT19__.refresh()`);
await jeda(2500);

console.log('[2] ringkasan loader (data mentah)');
console.log('    hasil() ->', JSON.stringify(await ev(`window.__ZEPHYR_EXT19__.hasil()`)));
console.log('    rusak() ->', JSON.stringify(await ev(`window.__ZEPHYR_EXT19__.rusak()`)));
console.log('    ringkasan.gagal ->', JSON.stringify(await ev(`window.__ZEPHYR_EXT19__.state().ringkasan.gagal`)));
console.log('    ringkasan.tidakDidukung ->', JSON.stringify(await ev(`window.__ZEPHYR_EXT19__.state().ringkasan.tidakDidukung`)));

console.log('[3] yang TERLIHAT di panel');
const sesudah = await bacaPanel();
console.log('   ', JSON.stringify(sesudah));

console.log('[4] cabut lagi & bersihkan');
await bersihkan();
for (const p of [PAKET_A, PAKET_B, PAKET_C]) {
  try { rmSync(p, { recursive: true, force: true }); } catch { /* biar saja */ }
}
await jeda(600);
const akhir = await bacaPanel();
console.log('   ', JSON.stringify(akhir));
ws.close();

const daftarMasalah = [...sesudah.gagal, ...sesudah.skip];
const adaManifest = /manifest|package\.json|json/i.test(panelA.err ?? '');
const adaBahasa = daftarMasalah.some((t) => /mode-yang-tidak-ada|ujingawur/i.test(t));
const adaSnippet = daftarMasalah.some((t) => /snippet/i.test(t) && /tidak-ada\.json/i.test(t));
const gagal = [];
if (!adaManifest) gagal.push(`penolakan paket ber-package.json rusak tidak memberi pesan yang menyebut sebabnya (pesan panel: ${JSON.stringify(panelA.err)})`);
if (!adaBahasa) gagal.push(`bahasa dengan legacyMode tak dikenal tidak muncul di panel beserta alasannya (daftar: ${JSON.stringify(daftarMasalah)})`);
if (!adaSnippet) gagal.push(`snippet yang berkasnya hilang tidak muncul di daftar "gagal" (daftar: ${JSON.stringify(sesudah.gagal)})`);
if (daftarMasalah.length === 0) gagal.push('panel tidak melaporkan masalah apa pun padahal paket rusak terpasang');

console.log('');
if (gagal.length) {
  console.log('GAGAL:');
  for (const g of gagal) console.log('  - ' + g);
  process.exitCode = 1;
} else {
  console.log('LULUS: tiga jalur gagal yang berbeda semuanya berakhir dengan pesan yang bisa dibaca pengguna:');
  console.log(`  * manifest rusak ditolak saat pemasangan, panel menampilkan: ${JSON.stringify(panelA.err)}`);
  for (const t of daftarMasalah) console.log('  * ' + t);
  console.log(`   (sebelum dipasang: ${awal.gagal.length + awal.skip.length} baris masalah; sesudah dicabut: ${akhir.gagal.length + akhir.skip.length} - kontrol dua sisi)`);
}
