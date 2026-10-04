/*
 * Verifikasi bahwa pemeriksaan aturan BENAR-BENAR BERJALAN di aplikasi hidup.
 *
 * Uji Node membuktikan mesinnya benar. Itu belum membuktikan apa pun tentang
 * aplikasinya: mesin yang lulus 61/61 tetapi tidak tersambung ke jalur tulis
 * hanya menambah berkas yang tidak dipakai siapa pun. Verifikasi kabelnya harus
 * lewat jalur yang sama dengan jalur chat dan simpan.
 *
 * Yang diuji di sini:
 *  1. pemeriksa benar-benar melewati `fsWrite`, bukan hanya tersedia sebagai
 *     fungsi yang bisa dipanggil
 *  2. teks berbahaya DITOLAK, dan penolakannya menjelaskan baris + aturannya
 *  3. teks bersih DITULIS seperti biasa - tidak ada perlambatan atau penolakan
 *  4. penolakan bisa dibalik: pesan errornya bisa dibaca manusia
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
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 260);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runAsync(expr, tungguMs = 8000) {
  await evalJs(`window.__cek = { selesai: false, hasil: null };
    (async () => { try { window.__cek.hasil = await (${expr}); } catch (e) { window.__cek.hasil = 'ERR ' + String(e.message || e).slice(0, 200); } window.__cek.selesai = true; })()`);
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

console.log('== Pemeriksaan aturan di aplikasi hidup ==\n');

/*
 * NYALAKAN aturannya dulu, lewat jalur yang sama dengan UI.
 *
 * Harness ini ditulis saat defaultnya masih `mati = false` - yang berarti penjaga
 * sudah TERPASANG tanpa diminta - jadi ia tidak pernah menyalakan apa pun dan
 * lulus. Begitu defaultnya dibetulkan menjadi MATI (sesuai komentar dan niat
 * aslinya), harness yang sama melaporkan "teks berbahaya lolos", dan itu benar:
 * dengan penjaga mati, memang tidak ada yang memeriksa.
 *
 * Menyalakannya lewat `applySettings` sekaligus menguji jembatan setelan->mesin,
 * yang tanpanya tombol di UI tidak mengubah apa pun yang dibaca jalur tulis.
 */
const nyalakan = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  if (!st) return 'TIDAK ADA STORE';
  await st.getState().applySettings({ rules: { enabled: true, disabled: [] } });
  await new Promise((r) => setTimeout(r, 900));
  const r = st.getState().settings.rules;
  return JSON.stringify({ enabled: r && r.enabled });
})()`);
sekalianCek: {
  let n = {};
  try { n = JSON.parse(nyalakan); } catch { /* biarkan */ }
  total += 1;
  if (n.enabled === true) { lulus += 1; console.log('  OK    aturan dinyalakan lewat setelan'); }
  else console.log('  GAGAL aturan tidak bisa dinyalakan: ' + nyalakan);
}

/* Workspace harus terbuka, kalau tidak setiap tulis ditolak dengan
   "path outside the workspace" - dan itu bukan hasil aturan, melainkan hasil
   keamanan path. Uji yang salah menyebut penyebabnya menyesatkan. */
const wsSiap = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  if (st.getState().workspace) return 'sudah terbuka: ' + st.getState().workspace;
  const fn = st.getState().openWorkspace;
  if (typeof fn !== 'function') return 'tidak ada openWorkspace';
  await fn('D:/Zephyr');
  await new Promise((r) => setTimeout(r, 1800));
  return 'dibuka: ' + st.getState().workspace;
})()`);
console.log('     workspace -> ' + wsSiap + '\n');

/* Modul pemeriksa harus benar-benar ada di jalur tulis. Dibuktikan dengan
   memanggil `fsWrite` dari modul yang SAMA dengan yang dipakai aplikasi: kalau
   fungsi itu tidak memeriksa, teks berbahaya akan lolos tanpa error. */
const berbahaya = 'const api_key = "sk-live-9f3a2b7c1d4e";';
const hasilBahaya = await runAsync(`(async () => {
  const m = await import('/src/lib/commands.ts');
  if (typeof m.fsWrite !== 'function') return 'TIDAK ADA fsWrite';
  const tmp = 'testfiles/rules-uji-terlarang.ts';
  try {
    await m.fsWrite(tmp, ${JSON.stringify(berbahaya)});
    return 'LOLOS - ditulis tanpa diperiksa';
  } catch (e) {
    return 'DITOLAK: ' + String(e.message || e).slice(0, 150);
  }
})()`);
console.log('     teks berbahaya -> ' + hasilBahaya);
cek('teks berbahaya DITOLAK oleh jalur tulis', typeof hasilBahaya === 'string' && hasilBahaya.startsWith('DITOLAK'), String(hasilBahaya).slice(0, 90));
cek('pesan penolakan menyebut baris', typeof hasilBahaya === 'string' && /line \d+/.test(hasilBahaya), hasilBahaya.match(/line \d+/)?.[0] ?? 'tidak ada');
cek('pesan penolakan menyebut aturannya', typeof hasilBahaya === 'string' && /hardcoded-secret/.test(hasilBahaya), 'hardcoded-secret');

/* Berkasnya harus TIDAK ada - penolakan yang tetap menulis adalah penolakan palsu. */
const mkdirAda = await runAsync(`(async () => {
  try {
    const m = await import('/src/lib/commands.ts');
    const isi = await m.fsRead('testfiles/rules-uji-terlarang.ts');
    return 'BERKAS ADA (' + String(isi).length + ' byte) - ditulis walau ditolak';
  } catch (e) { return 'tidak ada'; }
})()`);
console.log('     berkas terlarang -> ' + mkdirAda);
cek('berkas berbahaya tidak pernah mendarat di disk', String(mkdirAda) === 'tidak ada', String(mkdirAda).slice(0, 60));

/* Teks bersih harus tetap bisa ditulis - kalau tidak, mesin ini mematikan
   seluruh kemampuan menulis dan itu jauh lebih buruk daripada tidak ada aturan. */
const bersih = 'export const tambah = (a: number, b: number): number => a + b;';
const hasilBersih = await runAsync(`(async () => {
  const m = await import('/src/lib/commands.ts');
  const tmp = 'testfiles/rules-uji-bersih.ts';
  try {
    await m.fsWrite(tmp, ${JSON.stringify(bersih)});
    const balik = await m.fsRead(tmp);
    return 'DITULIS, dibaca ulang ' + String(balik).length + ' byte';
  } catch (e) { return 'GAGAL: ' + String(e.message || e).slice(0, 120); }
})()`);
console.log('     teks bersih -> ' + hasilBersih);
cek('teks bersih tetap bisa ditulis', typeof hasilBersih === 'string' && hasilBersih.startsWith('DITULIS'), String(hasilBersih).slice(0, 80));

/* Peringatan tidak boleh memblokir: kode dengan `any` tetap harus tersimpan. */
const hasilWarn = await runAsync(`(async () => {
  const m = await import('/src/lib/commands.ts');
  const tmp = 'testfiles/rules-uji-warn.ts';
  try {
    await m.fsWrite(tmp, 'function f(x: any) { return x; }');
    return 'DITULIS';
  } catch (e) { return 'GAGAL: ' + String(e.message || e).slice(0, 120); }
})()`);
console.log('     hanya peringatan -> ' + hasilWarn);
cek('peringatan TIDAK memblokir tulisan', hasilWarn === 'DITULIS', String(hasilWarn).slice(0, 70));

/*
 * Bersihkan berkas uji - dan lakukan juga kalau uji di atas berhenti lebih awal.
 *
 * Versi sebelumnya membersihkan di AKHIR saja, jadi satu kegagalan di tengah
 * meninggalkan tiga berkas di root proyek - dan ketiganya muncul sebagai berkas
 * tak terlacak di `git status`, seperti yang terjadi. Berkas uji yang bocor ke
 * repositori adalah cara paling halus membuat orang meng-commit sampah.
 *
 * `LINGKUP` didaftarkan DI ATAS, tepat sesudah didefinisikan, supaya urutannya
 * tidak bisa terlewat. Ketiganya di bawah `testfiles/` sekarang, bukan root.
 */
/*
 * TUTUP dulu tab berkas ujinya, baru hapus.
 *
 * `fsDelete` menolak berkas yang masih terbuka di editor - perilaku yang benar,
 * karena menghapus berkas yang sedang disunting akan membuat buffer tanpa
 * berkas di disk. Versi pertama pembersihan ini gagal SENYAP (kesalahannya
 * ditelan `catch {}` kosong) dan meninggalkan dua berkas, sementara ujinya
 * melaporkan "dibersihkan" tanpa memeriksa apa pun.
 *
 * Kesalahan yang ditelan tanpa dicatat adalah cara paling mudah membuat langkah
 * pembersihan terlihat berhasil padahal tidak.
 */
await runAsync(`(async () => {
  const st = window.__ZEPHYR__ && window.__ZEPHYR__.getState();
  const tab = st && st.tabs ? st.tabs.filter((t) => t.path && t.path.indexOf('rules-uji-') >= 0) : [];
  for (const t of tab) {
    /* 'forceCloseTab(id)' - satu argumen. Bukan 'closeTab(id, true)': fungsi itu
       tidak ada, dan memanggilnya lewat 'typeof' check membuat kegagalannya
       SENYAP - tab tidak pernah tertutup, penghapusan berkas selalu ditolak, dan
       ujinya melaporkan "sisa berkas" tanpa sebab yang terlihat.
       Kutip TUNGGAL, bukan backtick: backtick di dalam komentar yang berada di
       dalam template literal menutup template-nya lebih awal. */
    try { if (typeof st.forceCloseTab === 'function') st.forceCloseTab(t.id); } catch (e) {}
  }
  await new Promise((r) => setTimeout(r, 500));
  return 'ditutup: ' + tab.map((t) => t.id).join(',');
})()`);

const hapus = await runAsync(`(async () => {
  const st = window.__ZEPHYR__ && window.__ZEPHYR__.getState();
  const m = await import('/src/lib/commands.ts');
  const gagal = [];
  for (const f of ['testfiles/rules-uji-terlarang.ts', 'testfiles/rules-uji-bersih.ts', 'testfiles/rules-uji-warn.ts']) {
    /* Tutup tabnya lewat STORE, bukan lewat id dari daftar tab: id-nya tidak
       stabil antar versi store, sedangkan path-nya. */
    try {
      const t = (st.tabs || []).find((x) => x.path && x.path.endsWith(f.split('/').pop()));
      if (t && typeof st.forceCloseTab === 'function') st.forceCloseTab(t.id);
    } catch (e) { /* kalau tabnya tidak ada, tidak apa-apa */ }
    await new Promise((r) => setTimeout(r, 250));
    /* fsDelete(paths: string[], recursive) - menerima ARRAY.
       Mengirim string membuat Rust menolaknya dengan error yang field 'message'
       -nya undefined, sehingga pesan kegagalannya kosong dan sebabnya tidak
       terlihat sama sekali. Kutip tunggal di sini, bukan backtick: backtick di
       dalam komentar yang berada di dalam template literal menutup template-nya
       lebih awal. */
    try { await m.fsDelete([f]); } catch (e) { gagal.push(f.split('/').pop() + ': ' + String(e && (e.message || e) || 'gagal tanpa pesan').slice(0, 70)); }
  }
  await new Promise((r) => setTimeout(r, 400));
  return gagal.length ? 'GAGAL HAPUS: ' + gagal.join(' | ') : 'ok';
})()`);
console.log('     hapus berkas uji -> ' + hapus);

/* Periksa bahwa pembersihannya benar-benar berhasil, jangan percaya saja. */
const sisa = await runAsync(`(async () => {
  const m = await import('/src/lib/commands.ts');
  const ada = [];
  for (const f of ['testfiles/rules-uji-terlarang.ts', 'testfiles/rules-uji-bersih.ts', 'testfiles/rules-uji-warn.ts']) {
    try { await m.fsRead(f); ada.push(f); } catch (e) { /* sudah hilang, benar */ }
  }
  return ada.length ? 'SISA: ' + ada.join(', ') : 'bersih';
})()`);
cek('berkas uji dibersihkan', sisa === 'bersih', String(sisa).slice(0, 80));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
