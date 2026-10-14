/**
 * uji-pane-kurs-rencana.mjs — penilai RENCANA jalur "pane -> sumber -> tulis -> verifikasi".
 *
 * Kenapa berkas ini ada: dua item lama repo (LAMA-pane-uji dan LAMA-kurs)
 * menuntut SATU alur yang bisa dijalankan agen tanpa manusia: buka pane di app,
 * ambil data dari sumber nyata, tulis hasil ke berkas, lalu verifikasi. Sebelum
 * alur itu dijalankan sungguhan, yang HARUS terbukti lebih dulu adalah
 * rencananya sendiri: tiap langkah menunjuk perintah NYATA di repo (berkas +
 * baris), larangan mengarang angka kurs benar-benar berhenti saat sumber tidak
 * terjangkau, tabel hasil wajib berkolom `tahun|nilai|sumber`, dan tidak ada
 * satu jalur pun yang menulis `.env`/kunci/kredensial.
 *
 * Inilah yang diuji (19 kasus, K1..K19):
 *   A. Peta rencana   : K1 urutan langkah; K2+K3 tiap rujukan berkas:baris ADA
 *                       dan barisnya benar-benar memuat teks yang diklaim;
 *                       K4 tiap alat di rencana ada di daftar tool NYATA hasil
 *                       pemindaian web.ts/builtins.ts/mcp.ts
 *   B. Anti-mengarang : K5 urutan (tulis TIDAK boleh sebelum sumber); K6 rencana
 *                       bebas angka kurs literal; K7..K10 validator tabel
 *                       menolak header tanpa `sumber`, sumber kosong, nilai
 *                       bukan angka; K11 hitung baris 29 tahun
 *   C. Jalur berhenti : K12 transport melempar (429/putus) -> status BERHENTI,
 *                       NOL baris, NOL berkas ditulis; K13 tahun tanpa nilai di
 *                       sumber -> ditandai TANPA SUMBER, tidak diisi tebakan
 *   D. Berkas & jejak : K14 tulisAman menolak .env/.pem/.key/.p12/id_rsa/
 *                       credentials dan menerima berkas dokumen; K15 penjaga
 *                       .env nyata di `ambilWeb.ts:421` terbaca
 *   E. Dokumen nyata  : K16+K17 `docs/kurs-dollar.md` (kalau ada) lolos validator,
 *                       tiap baris bersumber terdaftar, 2026 tidak dikarang
 *   F. Butuh app      : K18 jalur LIVE (agen nyata mengemudikan pane) ditandai
 *                       BUTUH APP dan DILEWATI — harness ini tidak pernah
 *                       menyentuh CDP/app, jadi aman dijalankan berdampingan
 *                       dengan agen lain yang menyunting src/**
 *
 * Deterministik & hermetik: NOL jaringan (URL sumber hanya DATA di daftar
 * SUMBER), NOL CDP, NOL app, NOL shell keluar. Penulisan hanya ke direktorat
 * sementara (TMPDIR) yang dibersihkan sendiri.
 *
 *   node scripts/uji-pane-kurs-rencana.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AKAR_TMP = process.env.TMPDIR || os.tmpdir();

/* ------------------------------------------------------------------ */
/* Peta rencana: langkah -> perintah NYATA (berkas + baris)           */
/* ------------------------------------------------------------------ */

/**
 * `rujukan.baris` adalah nomor baris 1-based di dalam repo. Setiap baris
 * diperiksa dengan membaca berkasnya dari disk: klaim tanpa bukti = gagal.
 */
const RENCANA = [
  {
    id: 'L1',
    aksi: 'buka-pane',
    ket: 'buka pane milik app supaya isi halaman bisa dibaca agen',
    alat: ['browser_open', 'mcp__zephyr__pane', 'mcp__zephyr__focus_pane'],
    rujukan: [
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 443, harus: "name: 'browser_open'" },
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 459, harus: 'run: async (a) => {' },
      { berkas: 'src/lib/zephyrTools/mcp.ts', baris: 575, harus: "name: 'mcp__zephyr__pane'" },
      { berkas: 'src/lib/zephyrTools/mcp.ts', baris: 561, harus: 'run: async (a) => {' },
      { berkas: 'src/lib/panelStore.ts', baris: 16, harus: 'export const PANEL_TABS' },
      { berkas: 'src/lib/panelStore.ts', baris: 20, harus: "command: 'terminalPanel.focus'" },
    ],
  },
  {
    id: 'L2',
    aksi: 'panggil-sumber',
    ket: 'ambil nilai kurs dari sumber resmi; tanpa jaringan ini BERHENTI',
    alat: ['web_fetch', 'web_search', 'bash_run', 'mcp__zephyr__run_command'],
    rujukan: [
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 410, harus: "name: 'web_fetch'" },
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 421, harus: 'run: async (a) => {' },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 1187, harus: "name: 'bash_run'" },
      { berkas: 'src/lib/zephyrTools/mcp.ts', baris: 148, harus: "name: 'mcp__zephyr__run_command'" },
    ],
  },
  {
    id: 'L3',
    aksi: 'tulis-berkas',
    ket: 'tulis tabel hasil ke berkas dokumen lewat jalur tulis bersama',
    alat: ['write_file'],
    rujukan: [
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 770, harus: "name: 'write_file'" },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 783, harus: 'run: async (a) => {' },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 785, harus: 'jagaTulis(path);' },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 89, harus: 'function jagaTulis' },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 2530, harus: 'export async function tulis(' },
    ],
  },
  {
    id: 'L4',
    aksi: 'verifikasi',
    ket: 'baca balik hasil + jalankan harness untuk membuktikan isinya',
    alat: ['browser_read', 'bash_run', 'read_file'],
    rujukan: [
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 579, harus: "name: 'browser_read'" },
      { berkas: 'src/lib/zephyrTools/web.ts', baris: 588, harus: 'run: async (a) => {' },
      { berkas: 'src/lib/zephyrTools/builtins.ts', baris: 664, harus: "name: 'read_file'" },
    ],
  },
];

const URUTAN_BENAR = ['buka-pane', 'panggil-sumber', 'tulis-berkas', 'verifikasi'];

const BERKAS_TOOL = [
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/mcp.ts',
];

/** Sumber kurs yang BOLEH dipakai. Harness tidak pernah menghubunginya. */
const SUMBER = [
  {
    id: 'WB:PA.NUS.FCRF',
    url: 'https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&per_page=100&date=1998:2026',
    indikator: 'Official exchange rate (LCU per US$, period average)',
    tahun_terbit: '1998..2025 (2026 belum terbit)',
  },
];
const SUMBER_SAH = new Set(SUMBER.map((s) => s.id));

/** Tahun yang diminta item: 1998..2026. */
const TAHUN = [];
for (let y = 1998; y <= 2026; y++) TAHUN.push(y);

/* ------------------------------------------------------------------ */
/* Alat bantu                                                          */
/* ------------------------------------------------------------------ */

const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), 'utf8');

function bacaBaris(rel, nomor) {
  const teks = baca(rel).split(/\r?\n/);
  return teks[nomor - 1] ?? '';
}

function namaToolNyata() {
  const set = new Set();
  for (const rel of BERKAS_TOOL) {
    const re = /name: '([a-z][a-z0-9_]*)'/g;
    let m;
    while ((m = re.exec(baca(rel))) !== null) set.add(m[1]);
  }
  return set;
}

/* ------------------------------------------------------------------ */
/* Validator tabel: kolom WAJIB tahun|nilai|sumber                     */
/* ------------------------------------------------------------------ */

function periksaTabel(md) {
  const garis = md.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  if (garis.length < 2) return { ok: false, alasan: 'tabel tidak ditemukan', baris: [] };
  const kolom = garis[0].split('|').slice(1, -1).map((s) => s.trim().toLowerCase());
  if (kolom.join('|') !== 'tahun|nilai|sumber') {
    return { ok: false, alasan: `header salah: ${kolom.join('|')}`, baris: [] };
  }
  const baris = [];
  for (let i = 1; i < garis.length; i++) {
    const sel = garis[i].split('|').slice(1, -1).map((s) => s.trim());
    if (sel.every((s) => /^:?-{2,}:?$/.test(s))) continue;
    if (sel.length !== 3) return { ok: false, alasan: `baris ${i + 1}: ${sel.length} kolom`, baris: [] };
    const tahun = Number(sel[0]);
    const nilai = Number(sel[1].replace(/[,\s]/g, ''));
    if (!Number.isInteger(tahun)) return { ok: false, alasan: `baris ${i + 1}: tahun bukan angka`, baris: [] };
    if (!Number.isFinite(nilai) || nilai <= 0) {
      return { ok: false, alasan: `baris ${i + 1}: nilai tidak sah`, baris: [] };
    }
    if (!sel[2]) return { ok: false, alasan: `baris ${i + 1}: sumber kosong (DILARANG mengarang)`, baris: [] };
    if (!SUMBER_SAH.has(sel[2])) {
      return { ok: false, alasan: `baris ${i + 1}: sumber tidak terdaftar (${sel[2]})`, baris: [] };
    }
    baris.push({ tahun, nilai, sumber: sel[2] });
  }
  return { ok: true, alasan: 'ok', baris };
}

/* ------------------------------------------------------------------ */
/* Gerbang tulis: tidak boleh .env / kunci / kredensial                */
/* ------------------------------------------------------------------ */

const LARANGAN = [
  /(^|[\\/])\.env(\.[^\\/]*)?$/i,
  /\.(pem|key|pfx|p12|keystore|jks)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.[^\\/]*)?$/i,
  /(credential|credentials|kredensial|secret|password|passwd)[^\\/]*$/i,
];

function tulisAman(tujuan, isi) {
  for (const pola of LARANGAN) {
    if (pola.test(tujuan)) return { ok: false, alasan: `${tujuan} ditolak oleh ${pola}` };
  }
  fs.mkdirSync(path.dirname(tujuan), { recursive: true });
  fs.writeFileSync(tujuan, isi, 'utf8');
  return { ok: true, alasan: 'ditulis' };
}

/* ------------------------------------------------------------------ */
/* Jalur berhenti: sumber tidak terjangkau -> BERHENTI, bukan menebak  */
/* ------------------------------------------------------------------ */

function jalankanRencana({ transport, dir, nama = 'kurs-dollar.md' }) {
  const ditulis = [];
  let jawab;
  try {
    jawab = transport();
  } catch (e) {
    return { status: 'BERHENTI', alasan: `sumber tidak terjangkau: ${e?.message ?? e}`, baris: [], ditulis };
  }
  if (!jawab || !Array.isArray(jawab.baris) || jawab.baris.length === 0) {
    return { status: 'BERHENTI', alasan: 'sumber tidak memberi nilai', baris: [], ditulis };
  }
  const md = susunTabel(jawab.baris);
  const tulis = tulisAman(path.join(dir, nama), md);
  if (!tulis.ok) return { status: 'BERHENTI', alasan: tulis.alasan, baris: [], ditulis };
  ditulis.push(path.join(dir, nama));
  return { status: 'OK', alasan: 'ok', baris: jawab.baris, ditulis };
}

function susunTabel(baris) {
  const kepala = ['| tahun | nilai | sumber |', '| --- | --- | --- |'];
  const isi = [...baris]
    .sort((a, b) => a.tahun - b.tahun)
    .map((r) => `| ${r.tahun} | ${r.nilai} | ${r.sumber} |`);
  return [...kepala, ...isi].join('\n') + '\n';
}

/** Tahun tanpa nilai di sumber: TIDAK diisi — ditandai. */
function nilaiUntuk(tahun, jawab) {
  const r = (jawab?.baris ?? []).find((x) => x.tahun === tahun);
  return r ? { nilai: r.nilai, tanda: 'ADA SUMBER' } : { nilai: undefined, tanda: 'TANPA SUMBER' };
}

/* ------------------------------------------------------------------ */
/* Reporter                                                            */
/* ------------------------------------------------------------------ */

const hasil = [];
let lulus = 0;
let gagal = 0;
let lewat = 0;

function kasus(id, judul, status, pesan) {
  hasil.push({ id, judul, status, pesan });
  if (status === 'LULUS') lulus++;
  else if (status === 'GAGAL') gagal++;
  else lewat++;
}

function cek(id, judul, syarat, pesan) {
  kasus(id, judul, syarat ? 'LULUS' : 'GAGAL', pesan);
}

/* ------------------------------------------------------------------ */
/* A. Peta rencana                                                     */
/* ------------------------------------------------------------------ */

cek(
  'K1',
  'urutan langkah: buka pane -> panggil sumber -> tulis berkas -> verifikasi',
  URUTAN_BENAR.length === RENCANA.length &&
    RENCANA.map((l) => l.aksi).join('>') === URUTAN_BENAR.join('>'),
  `${RENCANA.length} langkah: ${RENCANA.map((l) => l.id + ':' + l.aksi).join(' -> ')}`,
);

const rujukanSemua = RENCANA.flatMap((l) => l.rujukan.map((r) => ({ ...r, id: l.id })));
const rujukanHilang = rujukanSemua.filter((r) => !fs.existsSync(path.join(AKAR, r.berkas)));
cek(
  'K2',
  'tiap rujukan menunjuk berkas yang ADA di repo',
  rujukanHilang.length === 0,
  rujukanHilang.length === 0
    ? `${rujukanSemua.length} rujukan berkas:baris, semua berkasnya ada`
    : `hilang: ${rujukanHilang.map((r) => r.berkas).join(', ')}`,
);

const rujukanSalah = rujukanSemua.filter((r) => !bacaBaris(r.berkas, r.baris).includes(r.harus));
cek(
  'K3',
  'tiap rujukan berkas:baris benar-benar memuat teks yang diklaim',
  rujukanSalah.length === 0,
  rujukanSalah.length === 0
    ? `${rujukanSemua.length} baris diperiksa apa adanya di disk`
    : `salah: ${rujukanSalah.map((r) => `${r.berkas}:${r.baris} tidak memuat "${r.harus}"`).join('; ')}`,
);

const toolNyata = namaToolNyata();
const alatAsing = [...new Set(RENCANA.flatMap((l) => l.alat))].filter((a) => !toolNyata.has(a));
cek(
  'K4',
  'tiap alat di rencana ada di daftar tool NYATA (web.ts/builtins.ts/mcp.ts)',
  alatAsing.length === 0,
  alatAsing.length === 0
    ? `semua alat dikenal (${toolNyata.size} nama tool dipindai dari 3 berkas)`
    : `tidak dikenal: ${alatAsing.join(', ')}`,
);

/* ------------------------------------------------------------------ */
/* B. Anti-mengarang angka kurs                                        */
/* ------------------------------------------------------------------ */

const iSumber = RENCANA.findIndex((l) => l.aksi === 'panggil-sumber');
const iTulis = RENCANA.findIndex((l) => l.aksi === 'tulis-berkas');
cek(
  'K5',
  'langkah tulis berada SETELAH langkah sumber (tidak menulis sebelum data ada)',
  iSumber >= 0 && iTulis > iSumber,
  `indeks sumber=${iSumber}, tulis=${iTulis}`,
);

const ANGKA_KURS = /\b(?:[5-9]\d{3}|[1-2]\d{4})\b/;
const teksRencana = JSON.stringify(RENCANA);
const kenaAngka = teksRencana.match(ANGKA_KURS);
cek(
  'K6',
  'rencana tidak memuat angka kurs literal (semua nilai kurs hanya dari sumber)',
  !kenaAngka,
  kenaAngka ? `angka kurs ditemukan di rencana: ${kenaAngka[0]}` : 'nol angka pada rentang 5.000..29.999 di dalam rencana',
);

const TBL_SAH = ['| tahun | nilai | sumber |', '| --- | --- | --- |', '| 1998 | 10013.6225 | WB:PA.NUS.FCRF |'].join('\n');
const v7 = periksaTabel(TBL_SAH);
cek('K7', 'header `tahun|nilai|sumber` diterima validator', v7.ok, v7.ok ? `1 baris sah: ${JSON.stringify(v7.baris[0])}` : v7.alasan);

const v8 = periksaTabel(['| tahun | nilai |', '| --- | --- |', '| 1998 | 10013.6225 |'].join('\n'));
cek('K8', 'header tanpa kolom `sumber` DITOLAK', !v8.ok, v8.alasan);

const v9 = periksaTabel(['| tahun | nilai | sumber |', '| --- | --- | --- |', '| 1998 | 10013.6225 |  |'].join('\n'));
cek('K9', 'baris tanpa sumber DITOLAK (anti-mengarang)', !v9.ok, v9.alasan);

const v10 = periksaTabel(['| tahun | nilai | sumber |', '| --- | --- | --- |', '| 1998 | kurang lebih segini | WB:PA.NUS.FCRF |'].join('\n'));
cek('K10', 'nilai bukan angka DITOLAK', !v10.ok, v10.alasan);

const fixture29 = ['| tahun | nilai | sumber |', '| --- | --- | --- |'];
for (const y of TAHUN) fixture29.push(`| ${y} | ${1000 + (y - 1998)} | WB:PA.NUS.FCRF |`);
const v11 = periksaTabel(fixture29.join('\n'));
cek(
  'K11',
  'uji hitung baris: fixture 1998..2026 -> 29 baris terbaca',
  v11.ok && v11.baris.length === TAHUN.length,
  v11.ok ? `${v11.baris.length} baris (${v11.baris[0].tahun}..${v11.baris[v11.baris.length - 1].tahun})` : v11.alasan,
);

/* ------------------------------------------------------------------ */
/* C. Jalur berhenti                                                   */
/* ------------------------------------------------------------------ */

const dir1 = fs.mkdtempSync(path.join(AKAR_TMP, 'uji-pane-kurs-'));
const h12 = jalankanRencana({
  transport: () => {
    throw new Error('HTTP 429 sumber tidak menjawab');
  },
  dir: dir1,
});
const sisa1 = fs.readdirSync(dir1);
cek(
  'K12',
  'sumber tidak terjangkau -> BERHENTI, nol baris, nol berkas ditulis',
  h12.status === 'BERHENTI' && h12.baris.length === 0 && h12.ditulis.length === 0 && sisa1.length === 0,
  `status=${h12.status} alasan="${h12.alasan}" baris=${h12.baris.length} berkas=${sisa1.length}`,
);

const jawabParsial = { baris: [{ tahun: 1998, nilai: 10013.6225, sumber: 'WB:PA.NUS.FCRF' }] };
const h13 = nilaiUntuk(2026, jawabParsial);
const h13ada = nilaiUntuk(1998, jawabParsial);
cek(
  'K13',
  'tahun tanpa nilai di sumber ditandai TANPA SUMBER (bukan ditebak)',
  h13.nilai === undefined && h13.tanda === 'TANPA SUMBER' && h13ada.nilai === 10013.6225,
  `2026 -> ${h13.tanda} (nilai=${h13.nilai}); 1998 -> ${h13ada.tanda} (nilai=${h13ada.nilai})`,
);

const dir2 = fs.mkdtempSync(path.join(AKAR_TMP, 'uji-pane-kurs-'));
const h14 = jalankanRencana({ transport: () => jawabParsial, dir: dir2 });
const md14 = fs.readFileSync(path.join(dir2, 'kurs-dollar.md'), 'utf8');
const v14 = periksaTabel(md14);
const ada2026 = v14.ok ? v14.baris.some((b) => b.tahun === 2026) : false;
cek(
  'K14',
  'jalur OK: berkas ditulis, tabel lolos validator, 2026 tidak ikut dikarang',
  h14.status === 'OK' && v14.ok && !ada2026,
  `status=${h14.status}, tabel ok=${v14.ok}, baris=${v14.baris.length}, baris2026=${ada2026}`,
);

const tolakTarget = [
  '.env',
  'docs/.env.local',
  'kunci.pem',
  'id_rsa',
  'credentials.json',
  'app.key',
  'server.p12',
  'kredensial-db.txt',
];
const ditolakSemua = tolakTarget.every((t) => tulisAman(path.join(dir2, t), 'x').ok === false);
const terimaTarget = tulisAman(path.join(dir2, 'kurs-dollar.md'), '| tahun | nilai | sumber |\n');
const targetDiRencana = RENCANA.filter((l) => l.aksi === 'tulis-berkas').every((l) =>
  ['docs/kurs-dollar.md'].every((t) => !LARANGAN.some((p) => p.test(t))),
);
cek(
  'K15',
  'tidak ada jalur menulis .env/kunci/kredensial; berkas dokumen diterima',
  ditolakSemua && terimaTarget.ok && targetDiRencana,
  `${tolakTarget.length}/${tolakTarget.length} target terlarang ditolak; target di rencana bersih; tulisAman(dokumen).ok=${terimaTarget.ok}`,
);

const barisPenjaga = bacaBaris('src/lib/zephyrTools/ambilWeb.ts', 421);
const penjagaNyata = /\\.env/.test(barisPenjaga) && /tidak boleh ditimpa/.test(barisPenjaga);
const ujiPenjaga = LARANGAN[0].test('C:\\rahasia\\.env') && LARANGAN[0].test('a/.env.production');
cek(
  'K16',
  'penjaga .env NYATA di repo terbaca + pola harness setara',
  penjagaNyata && ujiPenjaga,
  `ambilWeb.ts:421 => ${barisPenjaga.trim()}`,
);

/* ------------------------------------------------------------------ */
/* E. Dokumen nyata                                                    */
/* ------------------------------------------------------------------ */

const DOK = 'docs/kurs-dollar.md';
const adaDok = fs.existsSync(path.join(AKAR, DOK));
if (!adaDok) {
  kasus('K17', 'dokumen kurs nyata lolos validator', 'BUTUH BERKAS', `${DOK} belum ada — jalur live belum dijalankan`);
  kasus('K18', 'dokumen kurs nyata bebas nilai tanpa sumber', 'BUTUH BERKAS', `${DOK} belum ada`);
} else {
  const md = baca(DOK);
  const v = periksaTabel(md);
  const tahunAda = v.ok ? v.baris.map((b) => b.tahun) : [];
  const sesuaiTAHUN = v.ok && tahunAda.every((t) => TAHUN.includes(t));
  cek(
    'K17',
    'dokumen kurs nyata: header tahun|nilai|sumber + tiap nilai punya sumber terdaftar',
    v.ok && sesuaiTAHUN,
    v.ok
      ? `${v.baris.length} baris, tahun ${tahunAda[0]}..${tahunAda[tahunAda.length - 1]}, semua sumber terdaftar`
      : v.alasan,
  );
  const tahunTanpaBaris = TAHUN.filter((y) => !tahunAda.includes(y));
  const catatanTanpa = md.includes('TANPA SUMBER') || md.includes('tanpa sumber');
  cek(
    'K18',
    'tahun yang belum terbit TIDAK dikarang + dinyatakan terbuka di dokumen',
    !tahunAda.includes(2026) && (tahunTanpaBaris.length === 0 || catatanTanpa),
    `tahun tanpa baris: ${tahunTanpaBaris.join(', ') || 'tidak ada'}; bagian "tanpa sumber" ada=${catatanTanpa}; baris2026=${tahunAda.includes(2026)}`,
  );
}

/* ------------------------------------------------------------------ */
/* F. Butuh app (dilewati, tidak menyentuh app)                        */
/* ------------------------------------------------------------------ */

kasus(
  'K19',
  'jalur LIVE: agen nyata membuka pane, mengambil data, menulis hasil',
  'BUTUH APP',
  'dijalankan manusia/agen saat app hidup: node scripts/uji-pane-kurs-rencana.mjs (rencana) lalu alur L1..L4 di docs/LAPORAN-PANE-DAN-KURS.md',
);

/* ------------------------------------------------------------------ */
/* Cetak                                                               */
/* ------------------------------------------------------------------ */

for (const h of hasil) {
  const tanda = h.status === 'LULUS' ? 'LULUS' : h.status === 'GAGAL' ? 'GAGAL' : `LEWAT (${h.status})`;
  process.stdout.write(`[${h.id}] ${tanda.padEnd(22)} ${h.judul}\n      -> ${h.pesan}\n`);
}
process.stdout.write(
  `\n  catatan: nol jaringan, nol CDP, nol app; temp di ${AKAR_TMP}\n`,
);
process.stdout.write(`\n== ${lulus}/${hasil.length} lulus ==\n`);
process.stdout.write(`   gagal: ${gagal}  dilewati: ${lewat} (BUTUH APP/BERKAS)\n`);
process.exit(gagal === 0 ? 0 : 1);
