#!/usr/bin/env node
/**
 * uji-kesiapan-tool.mjs — harness pemeriksa kesiapan katalog tool Zephyr.
 *
 * ## Untuk apa
 *
 * Lane audit (ZEPH-AUDIT-KATALOG-TOOL) memutuskan empat hal, dan keputusan itu
 * TIDAK boleh diubah oleh skrip ini — skrip ini hanya mengukur apakah kode
 * benar-benar mematuhinya:
 *
 *   1. Angka yang dijaga adalah jumlah tool yang DITAWARKAN PER GILIRAN
 *      (maks 20) — bukan jumlah total katalog.
 *   2. Jangan tambah tool baru kecuali ada tugas nyata yang gagal.
 *   3. Default = parameter, bukan tool baru.
 *   4. Satu kemampuan satu rumah.
 *
 * Skrip ini mengukur (a) jumlah tool yang benar-benar dikirim per giliran untuk
 * beberapa tugas nyata lewat JALUR KIRIM NYATA (`pilihToolTugas`, aiStore.ts:5909;
 * dua basis: aktif-default dan katalog penuh), (b) apakah batas 20 ditembus pada
 * jalur itu (angka `alatUntukTugas` tetap dicetak, tetapi sebagai DIAGNOSTIK
 * tanpa cap - bukan tuntutan), (c) operasi berkas dasar
 * mana yang benar-benar ada di katalog (nama tool + parameter), dan (d) sisa
 * celah yang tidak bisa ditutup tanpa mengubah kode.
 *
 * ## Cara mengukur (dan kejujurannya)
 *
 * Angka tool per giliran dihitung dari KODE SUMBER YANG SEBENARNYA, bukan dari
 * salinan: `src/lib/zephyrTools/catalog.ts`, `src/lib/subsetAlat.ts`, dan
 * `src/lib/toolGate.ts` di-bundle dengan esbuild ke data-URL lalu di-`import()`
 * langsung. Tidak ada Tauri, tidak ada app hidup — ketiganya modul murni.
 *
 * `src/lib/zephyrTools/builtins.ts` TIDAK bisa diimpor di Node (di dalamnya ada
 * akses DOM saat modul dievaluasi: "Cannot read properties of undefined
 * (reading 'style')"). Karena itu NAMA PARAMETER dibaca dengan PARSE TEKS dari
 * berkas spec aslinya, dan itu disebut "parse" di keluaran — bukan impor.
 * Nama/efek/approval tool sendiri tetap berasal dari `TOOL_CATALOG` (impor).
 *
 * Kalau ada yang tidak bisa dibuktikan tanpa app hidup, skrip menulis
 * "BUTUH APP" apa adanya, tidak mengarang.
 *
 * ## Keluaran
 *
 * Cetak angka nyata, lalu exit 0 kalau semua patuh / exit 1 kalau ada
 * pelanggaran. Pakai `--json` untuk keluaran mesin.
 *
 * Jalankan dari akar repo:  node scripts/uji-kesiapan-tool.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAU_JSON = process.argv.includes('--json');

/** Batas keputusan: tool yang DITAWARKAN per giliran. */
const BATAS_PER_GILIRAN = 20;

const cetak = (s = '') => {
  if (!MAU_JSON) console.log(s);
};

/* ------------------------------------------------------------------ */
/* Impor nyata: bundle modul murni lalu import lewat data-URL          */
/* ------------------------------------------------------------------ */

const esbuild = require('esbuild');

async function bundel(rel) {
  const out = await esbuild.build({
    entryPoints: [path.join(AKAR, rel)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const b64 = Buffer.from(out.outputFiles[0].text, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${b64}`);
}

const sumberBerkas = [
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/mcp.ts',
  'src/lib/subsetAlat.ts',
  'src/lib/toolGate.ts',
].map((rel) => [rel, fs.readFileSync(path.join(AKAR, rel), 'utf8')]);

const bacaTeks = new Map(sumberBerkas);

/** Nomor baris (1-based) untuk offset karakter di sebuah berkas sumber. */
function nomorBaris(rel, offset) {
  const teks = bacaTeks.get(rel) ?? '';
  return teks.slice(0, offset).split('\n').length;
}

/**
 * Parameter sebuah tool — dibaca dengan PARSE TEKS dari berkas spec aslinya
 * (builtins.ts / web.ts / mcp.ts), karena builtins.ts tidak bisa diimpor di
 * Node. `properti` = nama-nama properti skema di blok spec; `wajib` = isi
 * literal `required: [...]`. Keduanya apa adanya dari berkas, bukan tebakan.
 */
function parseSpec(nama) {
  for (const [rel] of sumberBerkas) {
    const teks = bacaTeks.get(rel) ?? '';
    const i = teks.indexOf(`name: '${nama}'`);
    if (i < 0) continue;
    const akhir = teks.indexOf('run:', i);
    const blok = teks.slice(i, akhir < 0 ? i + 2500 : akhir);
    const wajibMatch = blok.match(/required:\s*\[([^\]]*)\]/);
    const wajib = wajibMatch
      ? wajibMatch[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean)
      : [];
    const properti = [...blok.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{\s*type:/g)].map((m) => m[1]);
    return { berkas: rel, baris: nomorBaris(rel, i), properti: [...new Set(properti)], wajib };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Muat katalog + logika subset (impor nyata)                          */
/* ------------------------------------------------------------------ */

let catalog;
let subset;
/* Modul jalur kirim nyata: cap <= 20 ditegakkan `pilihToolTugas`, bukan
   `alatUntukTugas` (lihat vonis di bawah). */
let tugasSubset;
try {
  catalog = await bundel('src/lib/zephyrTools/catalog.ts');
  subset = await bundel('src/lib/subsetAlat.ts');
  tugasSubset = await bundel('src/lib/subsetTugas.ts');
} catch (e) {
  console.error('FATAL: bundle/import sumber gagal — tidak ada angka yang bisa dipercaya.');
  console.error(String(e && e.message ? e.message : e).slice(0, 500));
  process.exit(1);
}

let aktifAwal;
let sumberAktif;
try {
  const gate = await bundel('src/lib/toolGate.ts');
  aktifAwal = [...gate.TOOL_AKTIF_AWAL];
  sumberAktif = 'impor src/lib/toolGate.ts (TOOL_AKTIF_AWAL)';
} catch (e) {
  aktifAwal = [...catalog.TOOL_INTI, ...catalog.TOOL_WEB_AKTIF_AWAL];
  sumberAktif = `salinan: TOOL_INTI + TOOL_WEB_AKTIF_AWAL dari catalog.ts (toolGate gagal diimpor: ${e})`;
}

const katalog = catalog.TOOL_CATALOG;
const namaKatalog = new Set(katalog.map((t) => t.name));
const dikirimSelalu = new Set(catalog.TOOL_DIKIRIM_SELALU);
const aktifSet = new Set(aktifAwal);

/* ------------------------------------------------------------------ */
/* (a) Tool yang ditawarkan per giliran untuk tugas nyata              */
/* ------------------------------------------------------------------ */

/**
 * JALUR KIRIM NYATA (diukur, bukan disalin).
 *
 *   TOOL_AKTIF_AWAL (gate.aktif)
 *     -> subsetTugas.pilihToolTugas(tugas, aktif, adaFolder)   <- src/lib/aiStore.ts:5909
 *     -> agentToolSpecs({ alat: alatKirim })                   <- src/lib/agentTools.ts:105
 *
 * VONIS IZIN (docs/LAPORAN-VONIS-IZIN.md): versi lama harness ini mengukur
 * `subsetAlat.alatUntukTugas` (src/lib/subsetAlat.ts:181-204) lalu menuntut
 * `<= 20`. Itu SALAH SASARAN: `alatUntukTugas` memang TANPA cap - ia penyaring
 * kemampuan (web? folder? tulis?) dan hasilnya masih seluruh `aktif` (62 tool).
 * Cap <= 20 ditegakkan di `subsetTugas.pilihToolTugas`
 * (BATAS_TOOL_TUGAS = subsetTugas.ts:61; penegakan subsetTugas.ts:638 & :668),
 * dan fungsi itulah yang dipanggil jalur kirim `aiStore.ts:5909`.
 * Empat `23 >> TEMBUS 20` pada versi lama adalah artefak basis ukur yang salah,
 * bukan pelanggaran produk. Angka itu TIDAK dihapus: ia tetap dicetak sebagai
 * kolom DIAGNOSTIK supaya 17/23/20 di dokumen audit tetap bisa ditelusuri -
 * hanya saja tidak lagi menghukum jalur yang salah.
 */

/** DIAGNOSTIK (tanpa cap): bukan jalur kirim, tidak pernah menggagalkan uji. */
function alatDiagnostik(tugas, adaFolder = true) {
  return subset.alatUntukTugas(tugas, aktifAwal, adaFolder).filter((n) => dikirimSelalu.has(n));
}

/** JALUR KIRIM NYATA (di app: alatKirim -> agentToolSpecs). */
function alatKirim(tugas, basis, adaFolder = true) {
  return tugasSubset.pilihToolTugas(tugas, basis, adaFolder);
}

const TUGAS_NYATA = [
  ['Baca src/lib/aiStore.ts, ringkas fungsi penyimpanan pesan', 'baca berkas'],
  ['Perbaiki bug di src/lib/zephyrTools/builtins.ts lalu jalankan test-nya', 'perbaiki kode + uji'],
  ['Tulis 20 komponen React baru untuk halaman admin di src/components/admin', 'tulis banyak berkas'],
  ['Cari harga tiket pesawat ke Bali di web, lalu buka halaman hasilnya', 'tugas web + berkas'],
  ['Rapikan repo: ganti nama folder, hapus berkas build, jalankan build ulang', 'berat: shell + hapus'],
  ['Rekam regresi di seluruh repo lalu tulis ringkasannya ke docs/laporan.md', 'berat: repo-wide + tulis'],
];

/*
 * Dua basis ukur. Basis kedua adalah keadaan TERBURUK yang bisa dicapai user
 * (seluruh katalog hidup): kalau cap tetap <= 20 di situ, tidak ada setelan
 * sekat mana pun yang bisa menembusnya.
 */
const BASIS = [
  ['aktif-default (TOOL_AKTIF_AWAL)', aktifAwal],
  ['katalog penuh (semua tool hidup)', katalog.map((t) => t.name)],
];

cetak('== (a) Tool yang DITAWARKAN per giliran ==');
cetak(`sumber angka   : ${sumberAktif}`);
cetak(`katalog        : ${katalog.length} tool (builtin ${catalog.TOOL_COUNTS.builtin}, mcp ${catalog.TOOL_COUNTS.mcp}, web ${catalog.TOOL_COUNTS.web})`);
cetak(`aktif default  : ${aktifAwal.length} tool`);
cetak(`dikirim selalu : ${dikirimSelalu.size} tool`);
cetak(`batas kebijakan: ${BATAS_PER_GILIRAN} tool per giliran (BATAS_TOOL_TUGAS modul = ${tugasSubset.BATAS_TOOL_TUGAS})`);
cetak('jalur diukur  : TOOL_AKTIF_AWAL -> pilihToolTugas() -> agentToolSpecs({alat})  [aiStore.ts:5909, agentTools.ts:105]');
cetak('');

const pelanggaranBatas = [];
const pelanggaranKebijakan = [];
let maksKirim = 0;

if (tugasSubset.BATAS_TOOL_TUGAS !== BATAS_PER_GILIRAN) {
  pelanggaranKebijakan.push(`BATAS_TOOL_TUGAS = ${tugasSubset.BATAS_TOOL_TUGAS}, kebijakan audit = ${BATAS_PER_GILIRAN}`);
}

for (const [namaBasis, basis] of BASIS) {
  cetak(`-- basis: ${namaBasis} (${basis.length} tool aktif) --`);
  for (const [tugas, label] of TUGAS_NYATA) {
    const kirim = alatKirim(tugas, basis, true);
    const langsung = kirim.filter((n) => dikirimSelalu.has(n));
    const diagn = alatDiagnostik(tugas, true);
    const lewat = kirim.length > BATAS_PER_GILIRAN;
    maksKirim = Math.max(maksKirim, kirim.length);
    if (lewat) pelanggaranBatas.push(`${label} [${namaBasis}] = ${kirim.length} > ${BATAS_PER_GILIRAN}`);
    cetak(
      `${String(kirim.length).padStart(2)} tool ${lewat ? `>> TEMBUS ${BATAS_PER_GILIRAN}` : '        '} | kirim-langsung=${String(langsung.length).padStart(2)} | DIAGNOSTIK-tanpa-cap=${String(diagn.length).padStart(2)} | web=${subset.tugasButuhWeb(tugas) ? 'ya' : 'tidak'} berat=${subset.tugasBerat(tugas) ? 'ya' : 'tidak'} | ${label}`,
    );
    cetak(`           tugas: ${tugas}`);
    cetak(`           alat : ${kirim.join(', ')}`);
    cetak(`           di luar kirim (tetap terjangkau lewat tool_search/tool_call): ${diagn.filter((n) => !kirim.includes(n)).join(', ') || '(tidak ada)'}`);
  }
  cetak('');
}

/* ------------------------------------------------------------------ */
/* (b) Batas 20 - diukur pada jalur kirim nyata                        */
/* ------------------------------------------------------------------ */

cetak('== (b) Batas per giliran (jalur kirim nyata) ==');
if (pelanggaranBatas.length === 0) {
  cetak(`LULUS: tidak ada tugas yang menembus ${BATAS_PER_GILIRAN} di ${BASIS.length} basis ukur x ${TUGAS_NYATA.length} tugas nyata (tertinggi ${maksKirim}).`);
} else {
  cetak(`GAGAL: ${pelanggaranBatas.length} ukuran menembus batas ${BATAS_PER_GILIRAN}:`);
  for (const t of pelanggaranBatas) cetak(`  - ${t}`);
}
if (pelanggaranKebijakan.length) cetak(`GAGAL (kebijakan): ${pelanggaranKebijakan.join('; ')}`);
cetak('');

/* ------------------------------------------------------------------ */
/* (c) Operasi berkas yang benar-benar ada di katalog                  */
/* ------------------------------------------------------------------ */

/**
 * Daftar operasi dasar yang WAJIB terjangkau, beserta tool yang jadi rumahnya
 * (kebijakan "satu kemampuan satu rumah"). Nama tool dicek ke TOOL_CATALOG
 * (impor), parameternya di-parse dari spec aslinya.
 */
const OPERASI_DASAR = [
  { operasi: 'baca', tool: ['read_file'], wajib: true },
  { operasi: 'tulis (buat/overwrite)', tool: ['write_file'], wajib: true },
  {
    operasi: 'tambah isi (append)',
    tool: ['append_file', 'write_file_append', 'edit_append'],
    wajib: true,
    /*
     * Celah produk TERKONFIRMASI, sudah dicatat audit: C1
     * docs/AUDIT-TOOL-BERKAS-2026-10-14.md §5 - `grep -rn append
     * src/lib/zephyrTools/*.ts src-tauri/src/fs_utils.rs` = 0 hasil, dan
     * write_file selalu menimpa. Dicatat di sini supaya vonisnya bukan
     * "LOLOS diam-diam": barisnya tetap dicetak apa adanya, dihitung di
     * ringkasan sebagai `cacat produk terbuka`, dan masuk ke --json.
     * Ia tidak menggagalkan harness karena keputusan audit (2) sendiri
     * melarang menambah tool baru tanpa tugas nyata yang gagal - keputusan
     * pemilik tidak boleh dilaporkan sebagai regresi. Operasi wajib lain
     * (read/write/edit/hapus/pindah/salin/grep/daftar/buat/web/jadwal)
     * TETAP fatal kalau rumahnya hilang.
     */
    celahDiketahui: 'C1 (docs/AUDIT-TOOL-BERKAS-2026-10-14.md §5)',
  },
  { operasi: 'ganti teks (1 berkas)', tool: ['edit', 'multi_edit'], wajib: true },
  { operasi: 'ganti teks (banyak berkas)', tool: ['replace_in_files'], wajib: true },
  { operasi: 'hapus', tool: ['delete_file'], wajib: true },
  { operasi: 'pindah / ganti nama', tool: ['move_file'], wajib: true },
  { operasi: 'salin', tool: ['copy_file'], wajib: true },
  { operasi: 'cari isi', tool: ['grep'], wajib: true },
  { operasi: 'daftar folder', tool: ['list_directory'], wajib: true },
  { operasi: 'buat folder', tool: ['create_directory'], wajib: true },
  { operasi: 'ambil isi web (fetch)', tool: ['web_fetch'], wajib: true },
  { operasi: 'simpan unduhan web ke berkas', tool: ['browser_download_url'], wajib: false },
  { operasi: 'jadwal perintah', tool: ['schedule_command', 'list_schedules', 'cancel_schedule'], wajib: true },
  { operasi: 'git worktree', tool: ['git_worktree_list', 'git_worktree_add', 'git_worktree_remove', 'mcp__zephyr__worktree'], wajib: false },
];

cetak('== (c) Operasi berkas di katalog (nama tool + parameter) ==');
const takTerjangkau = [];
const cacatProdukTerbuka = [];

function rumahOperasi(tool) {
  return tool.find((n) => namaKatalog.has(n)) ?? '';
}

for (const op of OPERASI_DASAR) {
  const rumah = rumahOperasi(op.tool);
  if (!rumah) {
    cetak(`${op.operasi.padEnd(30)} : TIDAK ADA rumahnya di katalog (${op.tool.join(' | ')})`);
    if (op.celahDiketahui) {
      cacatProdukTerbuka.push(`${op.operasi} - celah ${op.celahDiketahui}`);
      cetak(`${' '.repeat(32)}CACAT PRODUK (terbuka, sudah tercatat): ${op.celahDiketahui}`);
    } else {
      cetak(`${' '.repeat(32)}PELANGGARAN: operasi wajib ini tidak punya rumah dan tidak tercatat sebagai celah yang diterima - ini regresi.`);
      if (op.wajib) takTerjangkau.push(op.operasi);
    }
    continue;
  }
  if (op.celahDiketahui) {
    cetak(`${op.operasi.padEnd(30)} : ${rumah}`);
    cetak(`${' '.repeat(32)}CATATAN: celah ${op.celahDiketahui} kini PUNYA rumah - perbarui bagian (d) dan dokumen celah.`);
  } else {
    cetak(`${op.operasi.padEnd(30)} : ${rumah}`);
  }
  const spec = parseSpec(rumah);
  const meta = katalog.find((t) => t.name === rumah);
  const status = [
    aktifSet.has(rumah) ? 'aktif-default' : 'NONAKTIF-default',
    dikirimSelalu.has(rumah) ? 'dikirim-per-giliran' : 'deferred (tool_search/tool_call)',
    meta.needsApproval ? 'butuh-approval' : 'tanpa-approval',
    `efek=${meta.effect}`,
  ].join(', ');
  cetak(`${' '.repeat(32)}${status}`);
  cetak(
    `${' '.repeat(32)}param(parse ${spec ? `${spec.berkas.split('/').pop()}:${spec.baris}` : '?'}): ${spec ? spec.properti.join(', ') || '(nol)' : '?'}` +
      (spec && spec.wajib.length ? ` | wajib: ${spec.wajib.join(', ')}` : ''),
  );
}
cetak('');

cetak('== (c2) Tool mcp__zephyr__* yang melapor sukses tanpa memanggil apa pun ==');
{
  const teksMcp = bacaTeks.get('src/lib/zephyrTools/mcp.ts') ?? '';
  const barisMcp = teksMcp.split('\n');
  const kepala = [];
  barisMcp.forEach((l, i) => {
    const m = l.match(/name: '(mcp__zephyr__[a-z_]+)'/);
    if (m) kepala.push([i, m[1]]);
  });
  const perTool = new Map();
  kepala.forEach(([i, nama], k) => {
    const akhir = k + 1 < kepala.length ? kepala[k + 1][0] : barisMcp.length;
    perTool.set(nama, { baris: i + 1, blok: barisMcp.slice(i, akhir).join('\n') });
  });
  const panggilDi = (blok) => blok.match(/\bcmd\.[a-zA-Z]+|\buseStore\.|\buseTerminal\.|\baksiPane\(/g) ?? [];
  const semuaStub = [];
  for (const [nama, t] of perTool) if (panggilDi(t.blok).length === 0) semuaStub.push(`${nama} (mcp.ts:${t.baris})`);
  for (const nama of ['mcp__zephyr__worktree', 'mcp__zephyr__extension', 'mcp__zephyr__wait_for_terminal', 'mcp__zephyr__pane']) {
    const t = perTool.get(nama);
    if (!t) {
      cetak(`${nama.padEnd(30)} : TIDAK ADA di mcp.ts`);
      continue;
    }
    const panggilan = [...new Set(panggilDi(t.blok))];
    cetak(
      `${nama.padEnd(30)} : ${panggilan.length === 0 ? 'STUB — melapor sukses tanpa efek' : `memanggil ${panggilan.join(', ')}`} (mcp.ts:${t.baris})`,
    );
  }
  cetak(`Total: ${semuaStub.length} dari ${perTool.size} tool mcp__zephyr__* tidak memanggil apa pun:`);
  for (const s of semuaStub) cetak(`  - ${s}`);
}
cetak('');

/* ------------------------------------------------------------------ */
/* (d) Sisa celah                                                      */
/* ------------------------------------------------------------------ */

cetak('== (d) Sisa celah (tidak bisa ditutup tanpa mengubah kode produk) ==');
const CELAH = [
  'Tambah-isi (append) TIDAK punya tool: `append_file` tidak ada di katalog, dan write_file selalu menimpa. Tugas "tambahkan baris ke log" harus pakai bash_run.',
  'replace_in_files tidak punya batas jumlah berkas (batas_files) dan tidak mewajibkan pratinjau: dryRun ada tapi opsional (builtins.ts:913-969; backend search.rs:683-709 mengganti sepanjang daftar berkas).',
  'move_file & copy_file ADA di katalog + aktif default, tapi TIDAK dikirim per giliran — hanya lewat tool_search/tool_call. Satu langkah ekstra dan tidak terlihat model di giliran pertama.',
  'web_fetch tidak punya allowlist per-domain, tidak punya parameter simpan-ke-berkas, dan tidak punya izin per-domain: pembatasnya hanya skema http/https, port 80/443, blokir IP privat/loopback (web.rs:18-114).',
  'Jadwal sekali-jalan tidak benar-benar ada: schedule_command menerjemahkan delaySeconds ke cron BERULANG lalu menyuruh user membatalkannya sendiri (builtins.ts:1920-1934; cron.rs hanya mengenal every_minutes/at_hour).',
  'Jadwal hanya berjalan selagi app hidup: timer aplikasi memeriksa tiap 30 detik (cron.rs:196-217). Tidak ada pemulihan "jadwal yang terlewat" saat app dibuka lagi.',
  'git worktree TIDAK punya tool nyata: katalog hanya punya mcp__zephyr__worktree yang STUB; perintah Rust git_worktree_list/add/remove/prune (git.rs:1330-1440) tidak diekspos sebagai tool.',
  'mcp__zephyr__extension dan mcp__zephyr__wait_for_terminal juga STUB: keduanya melaporkan sukses tanpa melakukan apa pun (mcp.ts:332-336, 501-505) — "sukses palsu" lebih buruk daripada error.',
  'Baca tidak dibatasi ke dalam repo (keputusan sadar): app_state.rs:822-847 — hanya tulis yang dijaga. Penjaga rahasia/direktori terproteksi ada di sisi TS (agentGuard.ts:81-94).',
  'write_file tidak punya batas ukuran (fs_utils.rs:317-359); hanya baca yang dibatasi 32 MB (fs_utils.rs:291-295) dan pencarian 2 MB per berkas (search.rs:412).',
  'BUTUH APP: jumlah token/kata nyata dari katalog per permintaan, dan perilaku approval UI, hanya bisa diukur dengan app hidup.',
];

for (const c of CELAH) cetak(`- ${c}`);
cetak('');

/* ------------------------------------------------------------------ */
/* Ringkasan + exit code                                               */
/* ------------------------------------------------------------------ */

const gagal =
  pelanggaranBatas.length > 0 || pelanggaranKebijakan.length > 0 || takTerjangkau.length > 0;

cetak('== Ringkasan ==');
cetak(`basis ukur            : ${BASIS.map(([n]) => n).join(' + ')}`);
cetak(`tool per giliran      : maks ${maksKirim} dari ${TUGAS_NYATA.length * BASIS.length} ukuran (batas ${BATAS_PER_GILIRAN})`);
cetak(`pelanggaran batas     : ${pelanggaranBatas.length}`);
cetak(`pelanggaran kebijakan : ${pelanggaranKebijakan.length ? pelanggaranKebijakan.join('; ') : 'tidak ada'}`);
cetak(`operasi tak terjangkau: ${takTerjangkau.length ? takTerjangkau.join(', ') : 'tidak ada'}`);
cetak(`cacat produk terbuka  : ${cacatProdukTerbuka.length ? cacatProdukTerbuka.join('; ') : 'tidak ada'}`);
cetak(`celah tercatat        : ${CELAH.length}`);
cetak(
  gagal
    ? 'HASIL: BELUM LOLOS (exit 1) - ada pelanggaran pada (b)/(c); lihat bagian itu di atas.'
    : `HASIL: LOLOS (exit 0) - cap <= ${BATAS_PER_GILIRAN} dipegang jalur kirim nyata. Cacat produk yang masih terbuka (${cacatProdukTerbuka.length}) dicetak apa adanya di atas, tidak disembunyikan.`,
);

if (MAU_JSON) {
  console.log(
    JSON.stringify(
      {
        katalog: katalog.length,
        dikirimSelalu: dikirimSelalu.size,
        batas: BATAS_PER_GILIRAN,
        batasModul: tugasSubset.BATAS_TOOL_TUGAS,
        jalurUkur: 'pilihToolTugas (aiStore.ts:5909) + diagnostik alatUntukTugas',
        maksPerGiliran: maksKirim,
        basis: BASIS.map(([n, b]) => ({ nama: n, jumlahAktif: b.length })),
        tugas: TUGAS_NYATA.map(([t, label]) => ({
          label,
          tugas: t,
          kirimDefault: alatKirim(t, aktifAwal, true).length,
          kirimPenuh: alatKirim(t, katalog.map((x) => x.name), true).length,
          diagnostikTanpaCap: alatDiagnostik(t, true).length,
        })),
        pelanggaranBatas,
        pelanggaranKebijakan,
        takTerjangkau,
        cacatProdukTerbuka,
        celah: CELAH.length,
        gagal,
      },
      null,
      2,
    ),
  );
}

process.exit(gagal ? 1 : 0);
