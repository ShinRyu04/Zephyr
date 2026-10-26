/**
 * uji-kurs-dollar.mjs — tugas web NYATA dengan SATU pane browser.
 *
 * Keluhan yang diuji: "dia selalu buka terminal pane baru tiap kali buka, kalau
 * bisa tetap satu". Agen diminta membuka Google, mencari kurs 1 USD -> IDR, lalu
 * menyusun daftar kurs per tahun 1998..2026. Semua halaman HARUS dinavigasi di
 * pane browser yang sama.
 *
 * Yang diperiksa:
 *   K1 run berakhir sendiri (tidak macet / tidak kehabisan langkah)
 *   K2 tanpa error provider di balasan terakhir
 *   K3 jumlah pane BROWSER selama tugas TIDAK PERNAH lebih dari 1
 *   K4 id pane browser SELALU sama (dipakai ulang, bukan dibuang-buat)
 *   K5 berkas hasil benar-benar ADA di disk
 *   K6 daftarnya memuat cukup banyak tahun berbeda (1998..2026)
 *   K7 angka kurs masuk akal (ribuan rupiah per dollar)
 *   K8 sumber disebut
 *   K9 ada minimal satu browser_read/browser_click yang BERHASIL
 *
 *   node scripts/uji-kurs-dollar.mjs 9223 [D:/Testing] [pane]
 */
import { Cdp, reporter, tungguBridge } from './lib-cdp.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing').replace(/\\/g, '/');
const MODE = process.argv[4] ?? 'pane'; // 'pane' = browser pane, selain itu bebas
const MENIT = Number(process.env.UJI_MENIT ?? 15);
const R = reporter('kurs 1 USD -> IDR 1998..2026 dengan SATU pane browser');

const berkasHasil = path.join(path.resolve(WS), 'kurs-dollar.md');
try { fs.rmSync(berkasHasil); } catch { /* belum ada */ }

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/* Bridge dev terpasang beberapa saat setelah halaman selesai memuat (dan
   halaman bisa saja baru selesai reload HMR karena berkas src disunting).
   Tanpa tunggu di sini, snapshot pertama meledak jadi
   "__ZEPHYR_AI__ is undefined" - kegagalan balapan, bukan masalah app. */
for (const b of ['__ZEPHYR__', '__ZEPHYR_AI__', '__ZEPHYR_TERM__']) await tungguBridge(cdp, b);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, model: A.model, provider: A.provider, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     agen: ${awal.provider}/${awal.model} ws=${awal.ws} busy=${awal.busy}`);
/* Run lama yang proses Node-nya dibunuh di tengah jalan meninggalkan
   `agentBusy` nyangkut di app - harness lalu menolak jalan selamanya. Tunggu
   berjangka supaya sisa run benar-benar selesai (hard limit app 15 menit),
   bukan langsung menyerah pada angka busy pertama. */
for (let i = 0; awal.busy && i < 30; i++) {
  await new Promise((s) => setTimeout(s, 20000));
  const kini = await cdp.json(`return JSON.stringify({ busy: !!window.__ZEPHYR_AI__.store.getState().agentBusy })`).catch(() => null);
  awal.busy = kini ? kini.busy : awal.busy;
}
if (awal.busy) {
  console.log('     BERHENTI: agen masih sibuk setelah menunggu.');
  await cdp.close();
  process.exit(2);
}

/* Workspace DIBUKA dulu: tanpa itu write_file menolak ("outside the workspace")
   dan tugas menulis berkas mustahil selesai. Itu bukan kegagalan agen. */
await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)}); return true; })())`);
for (let i = 0; i < 40; i++) {
  const r = await cdp.json(`return JSON.stringify({ws: window.__ZEPHYR__.getState().workspace})`);
  if (String(r.ws ?? '').replace(/\\/g, '/') === WS) break;
  await new Promise((s) => setTimeout(s, 500));
}

/* Bersihkan tab browser lama supaya hitungan K3 mulai dari nol.
   Browser tidak lagi hidup sebagai pane di tab terminal: ia satu tab tetap di
   area editor dengan id 'tab-browser' (lihat src/lib/zephyrTools/web.ts).
   K3/K4 di bawah tetap bermakna - yang diawasi kini jumlah TAB browser dan
   id-nya (harus selalu tab yang sama, bukan tab baru per halaman). */
const tabAwal = await cdp.json(`return JSON.stringify((() => {
  const out = window.__ZEPHYR__.getState().tabs.filter((x) => x.view === 'browser').map((x) => x.id);
  for (const id of out) window.__ZEPHYR__.getState().forceCloseTab(id);
  return out;
})())`);
console.log(`     tab browser dibersihkan: ${tabAwal.length}`);

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  return true;
})())`);

const TUGAS = [
  'Pakai browser pane di dalam aplikasi ini (tool browser_open / browser_read / browser_nav) untuk mencari di Google:',
  'kurs 1 dollar Amerika ke rupiah hari ini.',
  '',
  'ATURAN PANE - penting: pakai SATU pane browser saja. Jangan buka pane browser baru setiap kali membuka halaman;',
  'navigasi halaman berikutnya di pane yang sudah ada (browser_open akan memakai ulang pane yang ada, atau browser_nav goto).',
  'Pane baru hanya kalau saya minta membandingkan dua halaman berdampingan.',
  '',
  'Setelah kurs hari ini ketemu, susun daftar kurs 1 USD ke IDR per tahun dari 1998 sampai 2026',
  '(pakai sumber yang kamu bisa baca: Google, Bank Indonesia, atau data kurs historis).',
  '',
  'Simpan hasilnya di berkas `kurs-dollar.md` di workspace ini: tabel dengan kolom Tahun | Kurs 1 USD (IDR) | Sumber,',
  'lalu satu paragraf singkat sumber datanya. Kalau ada tahun yang datanya tidak kamu temukan, tulis "tidak ditemukan" di baris itu -',
  'jangan mengarang angka.',
].join('\n');

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)}); return true; })())`);
console.log(`     tugas dikirim (${new Date().toISOString()})`);

/* Pengawas tab browser: diukur dari SISI NODE tiap 2 detik (tahan reload HMR,
   dan tidak ikut mati bersama context eval yang panjang). */
let maksTab = 0;
const idTab = new Set();
let berhentiJalan = false;
const pengawas = (async () => {
  while (!berhentiJalan) {
    try {
      const s = await cdp.json(`return JSON.stringify((() => {
        return window.__ZEPHYR__.getState().tabs.filter((x) => x.view === 'browser').map((x) => x.id);
      })())`, 15000);
      maksTab = Math.max(maksTab, s.length);
      for (const id of s) idTab.add(id);
    } catch { /* app sedang reload: lewati putaran ini */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
})();

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  const jejak = [];
  let terakhir = '';
  while (Date.now() - t0 < 20000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  let nLangkah = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => x.name);
    const todos = s.agentTodos || [];
    const baris = 'n=' + steps.length + ' browser=' + nama.filter((n) => String(n).startsWith('browser')).length
      + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length
      + ' todo=' + todos.filter((t) => t.status === 'done').length + '/' + todos.length;
    if (baris !== terakhir) { terakhir = baris; jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris); }
    if (!s.agentBusy) {
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0, langkah: steps.length, nama,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        browserBaca: steps.filter((x) => String(x.name).startsWith('browser') && x.ok !== false).map((x) => x.name),
        todoTotal: todos.length, todoDone: todos.filter((t) => t.status === 'done').length,
        balasan: last ? String(last.content || '').slice(0, 1500) : '',
        error: last ? (last.error || null) : null, jejak,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 240000) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const s = A.getState();
  const stepsT = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
  const namaT = stepsT.map((x) => x.name);
  const todosT = s.agentTodos || [];
  /*
   * Jalur timeout HARUS membawa bukti yang sama dengan jalur sukses. Dulu
   * objek ini cuma {ok:false,...} tanpa browserBaca, sehingga K9 selalu
   * "tidak ada" walau browser_read sudah sukses berkali-kali - kegagalan
   * palsu yang menutupi bukti nyata jalur pane.
   */
  return {
    ok: false, ms: Date.now() - t0, langkah: stepsT.length, nama: namaT,
    gagal: stepsT.filter((x) => x.ok === false || x.error).map((x) => x.name),
    browserBaca: stepsT.filter((x) => String(x.name).startsWith('browser') && x.ok !== false).map((x) => x.name),
    todoTotal: todosT.length, todoDone: todosT.filter((t) => t.status === 'done').length,
    error: null, jejak, balasan: 'BATAS WAKTU',
  };
})())`,
  (MENIT * 60000) + 60000,
);

berhentiJalan = true;
await pengawas;

console.log(`\n     selesai dalam ${Math.round(hasil.ms / 1000)}s, ${hasil.langkah} langkah`);
for (const j of (hasil.jejak || []).slice(-12)) console.log('       ' + j);
console.log(`     tab browser: maksimum ${maksTab}, id unik ${idTab.size} ${[...idTab].join(', ')}`);
if (hasil.gagal?.length) console.log(`     langkah gagal: ${hasil.gagal.join(', ')}`);

R.check('K1', !!hasil.ok, `run berakhir sendiri dalam ${Math.round(hasil.ms / 1000)}s (${hasil.langkah} langkah)`);
R.check('K2', !hasil.error, `tanpa error provider (error=${JSON.stringify(hasil.error ?? null)})`);
R.check('K3', maksTab <= 1, `tab browser tidak pernah > 1 (maksimum ${maksTab})`);
R.check('K4', idTab.size <= 1, `tab browser yang dipakai selalu sama (${idTab.size} id unik)`);
R.check('K9', (hasil.browserBaca || []).length >= 1, `langkah browser yang berhasil: ${(hasil.browserBaca || []).join(', ') || 'tidak ada'}`);

const ada = fs.existsSync(berkasHasil);
const isi = ada ? fs.readFileSync(berkasHasil, 'utf8') : '';
R.check('K5', ada, `berkas ${berkasHasil} ${ada ? `ADA (${isi.length} char)` : 'TIDAK ADA'}`);

const tahun = new Set();
for (const m of isi.matchAll(/\b(19\d\d|20[0-2]\d)\b/g)) {
  const n = Number(m[1]);
  if (n >= 1998 && n <= 2026) tahun.add(n);
}
R.check('K6', tahun.size >= 15, `tahun berbeda di daftar: ${tahun.size} (${[...tahun].sort().slice(0, 5).join(',')}...${[...tahun].sort().slice(-3).join(',')})`);

const angka = [...isi.matchAll(/\b(1[0-9]\.?\d{2,3}|[2-9]\.?\d{3}|1\d{4})\b/g)].map((m) => m[1]);
R.check('K7', angka.length >= 10, `angka kurs masuk akal: ${angka.length} temuan (mis. ${angka.slice(0, 5).join(', ')})`);
const sebutSumber = isi.match(/world bank|bank indonesia|bi\.go\.id|google|frankfurter|er-api|open\.er-api/i);
R.check('K8', !!sebutSumber, `sumber disebut: ${sebutSumber ? sebutSumber[0] : isi.length ? 'tidak ada nama sumber' : '-'}`);

console.log(`\n     balasan terakhir agen:\n${'       ' + String(hasil.balasan || '').replace(/\n/g, '\n       ').slice(0, 900)}`);
await cdp.close();
R.selesai();
