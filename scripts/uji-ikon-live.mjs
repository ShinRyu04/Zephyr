/*
 * uji-ikon-live.mjs — paket ikon marketplace benar-benar muncul di UI?
 *
 * Yang diuji: `zephyr.ikon-bulat` memberi `.lua` glyph "LU". Berkas uji
 * `.uji-ikon-live/coba-lua.lua` dibuat di dalam workspace (fsRead/openPath
 * menolak path di luar root), lalu diukur lewat DOM: ikon yang berasal dari
 * paket selalu membawa awalan `ext:` pada `data-ikon`, sedangkan ikon bawaan
 * tidak pernah. Jadi satu-satunya penjelasan kalau `ext:` muncul/hilang adalah
 * ada-tidaknya paketnya - bukan selera tema.
 *
 * Kenapa DOM dan bukan nilai kembalian fungsi: 4 paket ikon sebelumnya
 * terpasang, terbaca lewat dev bridge, dan tidak mengubah satu piksel pun di
 * pohon berkas. Yang menentukan "kepake" adalah elemen yang benar-benar
 * dirender, bukan peta yang cuma bisa dibaca skrip.
 *
 * Pemakaian: node scripts/uji-ikon-live.mjs [--paket zephyr.ikon-bulat]
 *            [--berkas coba-lua.lua] [--glyph LU]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const PORT = 9223;
const DIR = 'D:/Zephyr/.uji-ikon-live';

const argDari = (nama, bawaan) => {
  const i = process.argv.indexOf(nama);
  return i > 0 ? process.argv[i + 1] : bawaan;
};
const PAKET = argDari('--paket', 'zephyr.ikon-bulat');
const NAMA = argDari('--berkas', 'coba-lua.lua');
const GLYPH = argDari('--glyph', 'LU');
const BERKAS = `${DIR}/${NAMA}`;

mkdirSync(DIR, { recursive: true });
writeFileSync(BERKAS, 'local hello = function()\n  return 1 + 1\nend\n', 'utf8');

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
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d.exception?.description ?? d.text ?? 'gagal mengevaluasi');
  }
  return r.result?.result?.value;
};
await send('Runtime.enable');

/*
 * Ikon diukur di dua tempat yang benar-benar dilihat orang: baris tab yang
 * sedang aktif, dan pohon berkas. `doc.querySelectorAll` dipakai apa adanya
 * supaya ikon yang cuma ada di memori tidak ikut terhitung.
 */
const UKUR = `(async () => {
  const st = window.__ZEPHYR__.getState();
  st.setSettingsOpen(false);
  for (const t of st.tabs.filter((x) => x.name === ${JSON.stringify(NAMA)})) st.forceCloseTab(t.id);
  await new Promise((r) => setTimeout(r, 600));
  await window.__ZEPHYR__.getState().openPath(${JSON.stringify(BERKAS)}, { preview: false });
  await new Promise((r) => setTimeout(r, 1400));
  const st2 = window.__ZEPHYR__.getState();
  const tab = st2.tabs.find((t) => t.name === ${JSON.stringify(NAMA)});
  if (!tab) throw new Error('tab tidak terbuka: ' + st2.statusMessage);
  st2.setActiveTab(tab.id);
  await new Promise((r) => setTimeout(r, 1500));
  const semua = [...document.querySelectorAll('[data-ikon]')];
  const dariPaket = semua.filter((e) => String(e.getAttribute('data-ikon')).startsWith('ext:'));
  const glif = [...document.querySelectorAll('.tree-fikon-glif')].map((e) => e.textContent.trim() + '::' + e.getAttribute('data-ikon'));
  return JSON.stringify({
    jumlahIkon: semua.length,
    dariPaket: dariPaket.map((e) => e.getAttribute('data-ikon') + '=' + e.textContent.trim()),
    jumlahDariPaket: dariPaket.length,
    glifContoh: glif.slice(0, 8),
    ikonTabAktif: (() => {
      /*
       * Baris tab tidak membawa id-nya di DOM (tidak ada [data-tab-id]),
       * jadi yang dipakai adalah baris yang benar-benar bertanda aktif -
       * div.tab.is-active - dan itu memang elemen yang dilihat pemakai.
       */
      const baris = document.querySelector('div.tab.is-active');
      const ik = baris?.querySelector('[data-ikon]');
      return ik ? ik.getAttribute('data-ikon') + '=' + ik.textContent.trim() : null;
    })(),
  });
})()`;

const bersih = `(() => {
  const st = window.__ZEPHYR__.getState();
  for (const t of st.tabs.filter((x) => x.name === ${JSON.stringify(NAMA)})) st.forceCloseTab(t.id);
  return true;
})()`;

const catat = (nama, v) => console.log(`   ${nama}: ${v}`);

console.log(`== uji ikon live: ${PAKET} -> .lua = "${GLYPH}" ==`);
if (await ev(`window.__ZEPHYR_EXT19__.terpasang().some((m) => m.id === ${JSON.stringify(PAKET)})`)) {
  console.log(`catatan: ${PAKET} sudah terpasang - dilepas dulu supaya kontrolnya bersih`);
  await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('[1] sebelum dipasang');
const sebelum = JSON.parse(await ev(UKUR));
catat('ikon berbasis paket', sebelum.jumlahDariPaket);
catat('ikon tab aktif', sebelum.ikonTabAktif);
catat('glif', JSON.stringify(sebelum.glifContoh));

console.log('[2] pasang lewat jalur marketplace');
console.log('    installKatalog ->', await ev(`window.__ZEPHYR_EXT19__.installKatalog(${JSON.stringify(PAKET)})`));
await new Promise((r) => setTimeout(r, 2500));

console.log('[3] sesudah dipasang');
const sesudah = JSON.parse(await ev(UKUR));
catat('ikon berbasis paket', sesudah.jumlahDariPaket);
catat('ikon tab aktif', sesudah.ikonTabAktif);
catat('glif', JSON.stringify(sesudah.glifContoh));

console.log('[4] cabut lagi');
console.log('    uninstall ->', await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`));
await new Promise((r) => setTimeout(r, 2500));
const dicabut = JSON.parse(await ev(UKUR));
catat('ikon berbasis paket', dicabut.jumlahDariPaket);
catat('ikon tab aktif', dicabut.ikonTabAktif);

await ev(bersih);
rmSync(DIR, { recursive: true, force: true });
ws.close();

const gagal = [];
const ikonTab = (h) => String(h.ikonTabAktif ?? '');
if (sebelum.jumlahDariPaket !== 0) gagal.push(`sudah ada ikon paket sebelum dipasang (${sebelum.jumlahDariPaket}) - kontrolnya tidak bersih`);
if (!sesudah.jumlahDariPaket) gagal.push('tidak ada ikon berawalan ext: setelah paket dipasang - paket terpasang tapi tidak dipakai UI');
if (!ikonTab(sesudah).startsWith('ext:')) gagal.push(`ikon tab aktif masih "${ikonTab(sesudah)}", bukan dari paket`);
if (!ikonTab(sesudah).includes(GLYPH)) gagal.push(`glif tab aktif tidak memuat "${GLYPH}": ${ikonTab(sesudah)}`);
if (dicabut.jumlahDariPaket !== 0) gagal.push(`ikon paket masih ada setelah dicabut (${dicabut.jumlahDariPaket})`);
if (ikonTab(dicabut).startsWith('ext:')) gagal.push('ikon tab aktif masih dari paket setelah dicabut');

console.log('');
if (gagal.length) {
  console.log('GAGAL:');
  for (const g of gagal) console.log('  - ' + g);
  process.exitCode = 1;
} else {
  console.log(`LULUS: ${sesudah.jumlahDariPaket} ikon dari paket dirender (tab aktif "${ikonTab(sesudah)}"), nol sebelum dipasang, nol lagi setelah dicabut.`);
}
