/**
 * uji-busy-berat.mjs — apakah `agentBusy` pernah kelepasan `false` DI TENGAH run
 * berat, dan seberapa cepat ia benar-benar dilepas setelah run selesai.
 *
 * Kenapa ada: harness lama menunggu "sampai agentBusy=false" lalu menyimpulkan run
 * kelar. Bila busy sempat false sekejap di tengah run (di antara giliran alat dan
 * langkah berikutnya), harness menyimpulkan selesai terlalu cepat, tugas kedua
 * menyusup ke run yang masih hidup, dan laporan berikutnya jadi palsu. Di sini
 * sebab-akibatnya diukur langsung: PENGAMAT 250 ms mencatat setiap perubahan
 * (busy, jumlah langkah, fase, panjang antrian) selama run berjalan.
 *
 * Yang diperiksa:
 *   B1 tugas berat diterima (busy menyala) <= 15 detik
 *   B2 TIDAK ada flap: tidak pernah ada jendela busy=false yang langkahnya
 *      masih bertambah sesudahnya (itu tanda run masih hidup padahal UI bilang idle)
 *   B3 total waktu "false" selama run berjalan < 1 detik (di luar flap, ini juga
 *      menangkap false sesaat yang tak sempat mengubah jumlah langkah)
 *   B4 jeda langkah-terakhir -> busy=false <= 5 detik
 *   B5 berkas hasil benar-benar ada di disk (hitungan Node, bukan klaim agen)
 *   B6 tak ada penanda sibuk tertinggal (agentBusys semua false, fase idle)
 *
 *   node scripts/uji-busy-berat.mjs [port] [folder]     Launcher: scripts/_run-busy-berat.bat
 *   env: MENIT=14 (batas tunggu), STABIL=10 (busy harus tenang sekian detik)
 */
import { readdirSync } from 'node:fs';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const AKAR = (process.argv[3] || 'D:/Testing/busy-berat').split('\\').join('/');
const MENIT = Number(process.env.MENIT || 14);
const STABIL = Number(process.env.STABIL || 10) * 1000;
const R = reporter('agentBusy saat tugas berat: flap di tengah run & pelepasan akhir');

const TUGAS = [
  `Tugas berat. Di workspace ini buat dokumentasi kecil berisi 12 berkas:`,
  '`index.md` (daftar isi berisi tautan ke sebelas berkas lain) lalu `bab-1.md` sampai `bab-11.md`.',
  'Setiap `bab-N.md` minimal 30 baris: judul, tiga sub-bagian, dan satu contoh kode pendek.',
  'Isinya bebas (boleh tentang apa saja asal runtut), yang penting lengkap 12 berkas.',
  'Jangan membaca berkas lain, jangan memakai shell atau alat web.',
  'Setelah semua berkas ada, tutup todo-mu dan jawab satu kalimat: selesai.',
].join('\n');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, ws: window.__ZEPHYR__.getState().workspace };
})())`);
console.log(`     awal: busy=${awal.busy} ws=${awal.ws}`);
if (awal.busy) {
  console.log('     BERHENTI: agen masih sibuk sebelum uji dimulai (jalankan util-tunggu-idle dulu).');
  await cdp.close();
  process.exit(2);
}

/* Workspace harus benar-benar pindah; kalau tidak, berkasnya mendarat di folder lain
   dan B5 bakal melapor "0 berkas" untuk run yang sebenarnya sukses. */
console.log(`     menyiapkan workspace ${AKAR}...`);
const wsPasang = await cdp.json(
  `return JSON.stringify(await (async () => {
  for (let i = 0; i < 20; i++) {
    void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(AKAR)});
    await new Promise((r) => setTimeout(r, 250));
    const ws = window.__ZEPHYR__.getState().workspace ?? null;
    if (String(ws).split(String.fromCharCode(92)).join('/') === ${JSON.stringify(AKAR)}) return { ws, ok: true };
  }
  return { ws: window.__ZEPHYR__.getState().workspace ?? null, ok: false };
})())`,
  30000,
);
if (!wsPasang.ok) {
  console.log(`     BERHENTI: workspace uji tidak bisa dipasang (sekarang ${wsPasang.ws}).`);
  await cdp.close();
  process.exit(3);
}

/* Pengamat: mencatat setiap PERUBAHAN tanda tangan (busy, jumlah langkah, fase,
   panjang antrian). Dijalankan di dalam halaman supaya frekuensinya 250 ms tanpa
   membebani koneksi CDP; yang lewat batas hanya perubahan, bukan tiap sampel. */
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  const T = { t0: Date.now(), catatan: [], terakhir: null, batas: 4000 };
  T.tick = () => {
    const s = A.getState();
    const tanda = [
      s.agentBusy ? 1 : 0,
      (s.agentSteps || []).length,
      (s.agentSteps || []).filter((x) => x.kind === 'selesai').length,
      s.agentPhase,
      Object.values(s.antrians || {}).reduce((n, a) => n + (a ? a.length : 0), 0),
    ].join('|');
    if (tanda !== T.terakhir) {
      T.terakhir = tanda;
      if (T.catatan.length < T.batas) {
        T.catatan.push({
          ms: Date.now() - T.t0,
          busy: !!s.agentBusy,
          langkah: (s.agentSteps || []).length,
          phase: s.agentPhase,
          antrian: Object.values(s.antrians || {}).reduce((n, a) => n + (a ? a.length : 0), 0),
          baru: (s.agentSteps || []).filter((x) => x.kind !== 'selesai').slice(-1)[0]?.tool ?? null,
        });
      }
    }
    T.jadwal = setTimeout(T.tick, 250);
  };
  T.jadwal = setTimeout(T.tick, 250);
  window.__BT__ = T;
  return { mulai: true };
})())`);

/* Kirim tugas; tunggu sampai busy false DAN tenang STABIL detik (bukan sekali lihat false). */
console.log(`     mengirim tugas (12 berkas), batas ${MENIT} menit...`);
const kirim = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  void A.getState().send(${JSON.stringify(TUGAS)});
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const terkirim = !!A.getState().agentBusy;
  const tTerima = Date.now();
  let tenangSejak = 0;
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    if (!s.agentBusy) {
      if (!tenangSejak) tenangSejak = Date.now();
      if (Date.now() - tenangSejak >= ${STABIL}) break;
    } else tenangSejak = 0;
    await new Promise((r) => setTimeout(r, 250));
  }
  const s2 = A.getState();
  const steps = s2.agentSteps || [];
  const terakhir = steps.length ? Math.max(...steps.map((x) => x.at || 0)) : 0;
  return {
    terkirim,
    diterima_ms: tTerima - t0,
    kelar: !!tenangSejak,
    langkah: steps.length,
    jeda_ms: tenangSejak && terakhir ? tenangSejak - terakhir : null,
    phase: s2.agentPhase,
    agentBusys: s2.agentBusys,
    antrian: Object.values(s2.antrians || {}).reduce((n, a) => n + (a ? a.length : 0), 0),
    catatan: window.__BT__ ? window.__BT__.catatan : null,
    durasi_ms: Date.now() - (window.__BT__ ? window.__BT__.t0 : t0),
  };
})())`,
  MENIT * 60000 + 60000,
);

await cdp.json(`return JSON.stringify((() => { if (window.__BT__) clearTimeout(window.__BT__.jadwal); return true; })())`);

const berkas = (() => {
  try {
    return readdirSync(AKAR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
})();
const bab = berkas.filter((f) => /^bab-\d+\.md$/.test(f)).length;
const adaIndex = berkas.includes('index.md');

const cat = kirim.catatan || [];
const jendelaFalse = [];
let buka = null;
let pernahTrue = false;
let terimaMs = null;
for (const c of cat) {
  if (c.busy && terimaMs === null) terimaMs = c.ms;
  /* false sebelum busy pernah menyala = keadaan sebelum kiriman diterima, bukan flap */
  if (!c.busy && buka === null && pernahTrue) buka = c;
  if (c.busy && buka !== null) {
    jendelaFalse.push({ dari: buka.ms, sampai: c.ms, langkahDiAwal: buka.langkah, langkahSesudah: c.langkah });
    buka = null;
  }
  if (c.busy) pernahTrue = true;
}
const latensiMs = kirim.terkirim && terimaMs !== null ? terimaMs : kirim.diterima_ms;
const flap = jendelaFalse.filter((j) => j.langkahSesudah > j.langkahDiAwal);
const msFalseSaatJalan = jendelaFalse.reduce((n, j) => n + (j.sampai - j.dari), 0);

console.log(`     terkirim=${kirim.terkirim} busynya-menyala=${latensiMs} ms durasi=${Math.round(kirim.durasi_ms / 1000)}s langkah=${kirim.langkah} jeda-busy=${kirim.jeda_ms === null ? '-' : Math.round(kirim.jeda_ms / 1000) + 's'}`);
console.log(`     berkas di disk: ${berkas.length} md (${bab} bab + index=${adaIndex})`);
console.log(`     jendela busy=false selama run: ${jendelaFalse.length} (total ${msFalseSaatJalan} ms); flap: ${flap.length}`);
for (const j of jendelaFalse) {
  console.log(
    `       false ${j.dari}-${j.sampai} ms (${j.sampai - j.dari} ms), langkah ${j.langkahDiAwal}->${j.langkahSesudah}${j.langkahSesudah > j.langkahDiAwal ? '  <-- FLAP' : ''}`,
  );
}
const sisaSibuk = Object.entries(kirim.agentBusys || {}).filter(([, v]) => v).map(([k]) => k || '(default)');

R.check('B1', kirim.terkirim && latensiMs <= 15000, `tugas berat diterima (busy menyala) dalam ${latensiMs} ms`);
R.check('B2', flap.length === 0, `tidak ada flap (busy=false sementara langkah tetap bertambah): ${flap.length} kejadian`);
R.check('B3', msFalseSaatJalan < 1000, `total busy=false selama run ${msFalseSaatJalan} ms (< 1000 ms)`);
R.check('B4', kirim.kelar && kirim.jeda_ms !== null && kirim.jeda_ms <= 5000, `jeda langkah-terakhir -> busy=false: ${kirim.jeda_ms === null ? 'tidak lepas' : Math.round(kirim.jeda_ms / 1000) + 's'}`);
R.check('B5', bab === 11 && adaIndex, `12 berkas di disk: ${bab} bab + index=${adaIndex}`);
R.check('B6', sisaSibuk.length === 0 && kirim.phase === 'idle' && kirim.antrian === 0, `bersih: penanda sibuk ${sisaSibuk.join(', ') || 'tidak ada'}, fase=${kirim.phase}, antrian=${kirim.antrian}`);

await cdp.close();
R.selesai();
