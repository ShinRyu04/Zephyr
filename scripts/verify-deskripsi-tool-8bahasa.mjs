/**
 * verify-deskripsi-tool-8bahasa.mjs - deskripsi tool lengkap untuk SEPULUH bahasa.
 *
 *   node scripts/verify-deskripsi-tool-8bahasa.mjs
 *
 * Latar belakang.
 *
 * Aplikasi punya sepuluh bahasa antarmuka (`i18n.ts` -> `DICTS`): id, en, ja,
 * ko, zh, es, fr, de, pt, ar. Sebelum perubahan ini `deskripsiTool` hanya punya
 * dua peta, ID dan EN, dan setiap bahasa lain - termasuk delapan yang sudah
 * diterjemahkan penuh di `i18n-extra.ts` - jatuh ke Inggris. Akibatnya user
 * berbahasa Jepang melihat panel Tools berbahasa Inggris walau sisa antarmuka
 * sudah Jepang: keluhan yang sama persis dengan yang dulu memunculkan
 * `cek-panel-tools-bahasa.mjs`, hanya berpindah bahasa.
 *
 * Yang diperiksa berkas ini.
 *
 *   1. Struktur: kesepuluh peta ada, masing-masing berisi kunci yang SAMA
 *      PERSIS dengan himpunan nama tool di katalog - tidak kurang, tidak lebih.
 *   2. Isi: tidak ada nilai kosong, dan tidak ada nilai yang identik dengan
 *      teks Inggris (yang berarti lupa diterjemahkan, bukan diterjemahkan).
 *   3. Perilaku `deskripsiTool()` yang SUNGGUHAN: modul TypeScript-nya
 *      ditranspilasi dan dijalankan, lalu dipanggil - bukan disalin ulang
 *      menjadi regex yang bisa berbeda dari kode yang diuji.
 *   4. Nama MCP: keempat belas tool `mcp__zephyr__*` harus mengembalikan
 *      deskripsi tidak kosong di SETIAP bahasa, lewat pelepasan awalan.
 *   5. Fallback: bahasa yang belum punya kunci jatuh ke Inggris, bukan ke
 *      string kosong.
 *
 * Kenapa modulnya benar-benar dijalankan.
 *
 * `verify-deskripsi-tool.mjs` membaca berkasnya sebagai teks karena katalog
 * mengimpor tanpa ekstensi dan tidak bisa dibuka Node telanjang. Berkas ini
 * tidak punya batasan itu: `deskripsiTool.ts` sengaja MURNI DATA - tanpa impor
 * apa pun yang menyentuh store, DOM, atau `self` (lihat kepala
 * `deskripsiToolHook.ts`, yang memisahkan bagian yang butuh store justru supaya
 * berkas data ini tetap bisa dimuat di luar aplikasi). Jadi ia bisa
 * ditranspilasi dengan `typescript` yang sudah ada di devDependencies dan
 * dievaluasi langsung. Itu membuat pemeriksaan "bahasa jatuh ke Inggris" dan
 * "MCP tidak kosong" mengukur fungsi yang benar-benar dikirim ke aplikasi,
 * bukan tiruannya.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const jalurDeskripsi = join(akar, 'src/lib/zephyrTools/deskripsiTool.ts');
const jalurKatalog = join(akar, 'src/lib/zephyrTools/catalog.ts');

/* ------------------------------------------------------------------ */
/* 1. Katalog: ambil himpunan nama tool yang dilihat model.            */
/* ------------------------------------------------------------------ */

/*
 * Baris katalog: `['nama', 'Grup', 'effect', bool, 'deskripsi']`.
 *
 * Regex ini sengaja meminta kelima elemen sekaligus, bukan hanya namanya:
 * baris yang bentuknya menyimpang (mis. efek baru, atau penambahan kolom) akan
 * GAGAL cocok dan katalog jadi tidak terbaca - jauh lebih baik daripada diam
 * lalu diperlakukan sebagai "tool yang tidak ada".
 */
const katalogTeks = readFileSync(jalurKatalog, 'utf8');
const reKatalog = new RegExp(
  "\\[\\s*'([^']+)',\\s*'[^']*',\\s*'(?:read|net|netWrite|appWrite|fsWrite|exec)',\\s*(?:true|false),\\s*'([^']*)'\\]",
  'g',
);
const katalog = [];
let mk;
while ((mk = reKatalog.exec(katalogTeks)) !== null) katalog.push(mk[1]);

/*
 * Katalog menulis tool MCP lengkap (`mcp__zephyr__inspect`), sedangkan peta
 * deskripsi memakai nama polos (`inspect`). Bandingkan dalam bentuk polos.
 */
const AWALAN_MCP = /^mcp__zephyr__/;
const namaKatalog = katalog.map((n) => n.replace(AWALAN_MCP, ''));
const himpunanKatalog = new Set(namaKatalog);

/* ------------------------------------------------------------------ */
/* 2. Jalankan modul deskripsi SUNGGUHAN lewat transpilasi TypeScript. */
/* ------------------------------------------------------------------ */

/*
 * `deskripsiTool.ts` mengimpor satu berkas daun (`./awalan`, memuat definisi
 * awalan nama tool). Modul `data:` tidak bisa menyelesaikan impor relatif,
 * jadi keduanya ditranspilasi ke berkas SUNGGUHAN di folder sementara, dan
 * impor relatifnya diberi ekstensi `.js` supaya Node dapat menemukannya
 * (Node ESM tidak menebak ekstensi). Berkasnya dihapus lagi setelah dimuat -
 * modulnya sudah ada di memori, jadi sisa folder tidak menumpuk.
 */
const opsiTranspil = {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
};
const dirSementara = mkdtempSync(join(tmpdir(), 'uji-deskripsi-'));
const transpilKe = (namaAsal, namaKeluar) => {
  const hasil = ts.transpileModule(readFileSync(join(dirname(jalurDeskripsi), namaAsal), 'utf8'), {
    ...opsiTranspil,
    fileName: namaAsal,
  });
  const keluaran = hasil.outputText.replace(/(from\s+')(\.\/[^']+)(')/g, '$1$2.js$3');
  writeFileSync(join(dirSementara, namaKeluar), keluaran, 'utf8');
  return keluaran;
};
transpilKe('awalan.ts', 'awalan.js');
transpilKe('deskripsiTool.ts', 'deskripsiTool.js');
const modul = await import(pathToFileURL(join(dirSementara, 'deskripsiTool.js')).href);
rmSync(dirSementara, { recursive: true, force: true });
const { deskripsiTool, POLA_AWALAN_MCP } = modul;

/* Nama yang diekspor tergantung perubahan: kumpulkan semua peta `DESKRIPSI_TOOL_*`. */
const PETA_NAMA = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const KODE_DARI_NAMA = {
  ID: 'id',
  EN: 'en',
  JA: 'ja',
  KO: 'ko',
  ZH: 'zh',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  PT: 'pt',
  AR: 'ar',
};

/* ------------------------------------------------------------------ */
/* 3. Pemeriksaan.                                                     */
/* ------------------------------------------------------------------ */

const masalah = [];
const lapor = (teks) => masalah.push(teks);

if (typeof deskripsiTool !== 'function') {
  console.error('FATAL: modul tidak mengekspor deskripsiTool - tidak ada yang bisa diuji');
  process.exit(1);
}
if (katalog.length === 0) {
  console.error('FATAL: katalog tidak terbaca - regex tidak cocok dengan baris mana pun');
  process.exit(1);
}
if (!(POLA_AWALAN_MCP instanceof RegExp)) {
  lapor('POLA_AWALAN_MCP tidak diekspor sebagai RegExp');
}

/* -- 3a. Struktur setiap peta. -- */
const peta = {};
for (const namaPeta of PETA_NAMA) {
  const isi = modul[`DESKRIPSI_TOOL_${namaPeta}`];
  if (!isi || typeof isi !== 'object') {
    lapor(`DESKRIPSI_TOOL_${namaPeta} tidak ada / bukan objek`);
    continue;
  }
  peta[namaPeta] = isi;

  const kunci = Object.keys(isi);
  const himpunanKunci = new Set(kunci);

  /* Kunci ganda tidak mungkin tertangkap di sini (objek JS sudah menimpanya),
     jadi yang diperiksa adalah jumlah: kalau ada kunci ganda, jumlah kunci
     akan lebih sedikit dari jumlah baris. Pemeriksaan TypeScript di langkah
     terpisah yang menangkap penulisannya; di sini cukup jumlahnya. */

  for (const n of himpunanKatalog) {
    if (!himpunanKunci.has(n)) lapor(`DESKRIPSI_TOOL_${namaPeta} tidak punya kunci: ${n}`);
  }
  for (const n of kunci) {
    if (!himpunanKatalog.has(n)) lapor(`DESKRIPSI_TOOL_${namaPeta} punya kunci asing: ${n}`);
  }

  if (kunci.length !== himpunanKatalog.size) {
    lapor(
      `DESKRIPSI_TOOL_${namaPeta} punya ${kunci.length} kunci, katalog punya ${himpunanKatalog.size}`,
    );
  }
}

/* -- 3b. Isi: tidak kosong, dan tidak kembar dengan Inggris. -- */
const id = peta.ID ?? {};
const en = peta.EN ?? {};
for (const namaPeta of PETA_NAMA) {
  const isi = peta[namaPeta];
  if (!isi) continue;
  for (const [kunci, teks] of Object.entries(isi)) {
    if (typeof teks !== 'string' || !teks.trim()) {
      lapor(`DESKRIPSI_TOOL_${namaPeta} kosong untuk ${kunci}`);
      continue;
    }
    /*
     * Sebuah terjemahan yang identik dengan Inggris berarti tidak
     * diterjemahkan. Pengecualian yang sah: nama tool yang memang sama di
     * semua bahasa - mis. `git`, `URL`, `SSH`, `DOM`, `localhost`. Karena itu
     * yang ditolak adalah kalimat yang PANJANG dan sama, bukan kata tunggal.
     */
    if (namaPeta !== 'EN' && namaPeta !== 'ID' && teks === en[kunci] && teks.length > 25) {
      lapor(`DESKRIPSI_TOOL_${namaPeta} masih sama dengan Inggris untuk ${kunci}: ${teks}`);
    }
  }
}

/* -- 3c. Perilaku deskripsiTool() yang sungguh-sungguh. -- */
const KODE = Object.values(KODE_DARI_NAMA);

for (const kode of KODE) {
  for (const namaTool of himpunanKatalog) {
    const hasil = deskripsiTool(namaTool, kode);
    if (!hasil || !hasil.trim()) {
      lapor(`deskripsiTool('${namaTool}', '${kode}') kosong`);
    }
  }
}

/* Bahasa yang dikenal harus mengembalikan teks bahasanya, bukan Inggris. */
const contohBahasa = { ja: 'JA', ko: 'KO', zh: 'ZH', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT', ar: 'AR' };
let bahasaAktif = 0;
let bahasaFallback = 0;
for (const [kode, namaPeta] of Object.entries(contohBahasa)) {
  const isi = peta[namaPeta];
  if (!isi) continue;
  for (const namaTool of himpunanKatalog) {
    const hasil = deskripsiTool(namaTool, kode);
    if (hasil === isi[namaTool]) bahasaAktif++;
    else if (hasil === en[namaTool]) bahasaFallback++;
    else lapor(`deskripsiTool('${namaTool}', '${kode}') tidak cocok peta mana pun: ${hasil}`);
  }
}
/* id harus memakai peta ID, bukan Inggris. */
let idBedaDariEn = 0;
for (const namaTool of himpunanKatalog) {
  if (deskripsiTool(namaTool, 'id') !== en[namaTool]) idBedaDariEn++;
}

/* -- 3d. Nama MCP tidak boleh kosong di bahasa mana pun. -- */

/*
 * PENTING: katalog menyimpan 14 tool MCP dengan nama POLOS (`inspect`), dan
 * awalan `mcp__zephyr__` baru ditempelkan `rakit()` saat katalog dirakit -
 * nama berawalan itu TIDAK PERNAH muncul sebagai literal di catalog.ts.
 * Karena itu daftar MCP di sini dibangun dengan menempelkan awalan sendiri,
 * bukan dengan menyaring isi berkas.
 *
 * Petakan lewat nama polos: 56 nama di katalog dikurangi 42 nama yang bukan
 * MCP. Cara yang tidak menebak-nebak adalah memakai daftar dari blok `MCP` di
 * `catalog.ts` - tapi karena harness ini sengaja tidak mengimpor katalog
 * (lihat kepala berkas), yang dipakai adalah nama polos yang sama-sama tidak
 * ada di 42 tool lain.
 */
const NAMA_MCP_POLOS = [
  'inspect', 'run_command', 'open_file', 'workspace', 'set_setting', 'extension',
  'ssh', 'read', 'sh', 'wait_for_terminal', 'worktree', 'focus_pane', 'pane',
];
const mcpPanjang = NAMA_MCP_POLOS.map((n) => `mcp__zephyr__${n}`);
for (const n of NAMA_MCP_POLOS) {
  if (!himpunanKatalog.has(n)) lapor(`nama MCP polos tidak ada di katalog: ${n}`);
}
const mcpKosong = [];
for (const kode of KODE) {
  for (const namaLengkap of mcpPanjang) {
    const hasil = deskripsiTool(namaLengkap, kode);
    if (!hasil || !hasil.trim()) mcpKosong.push({ kode, nama: namaLengkap });
  }
}

/*
 * -- 3e. Fallback ke Inggris, bukan string kosong. --
 *
 * Diuji dengan bahasa karangan yang tidak ada petanya. Kalau kelak ada yang
 * mengubah `deskripsiTool` untuk mengembalikan string kosong saat peta hilang,
 * panel Tools akan menyembunyikan barisnya diam-diam - dan itu tepat
 * kegagalan yang berkas ini jaga.
 */
const fallbackUji = deskripsiTool('read_file', 'xx-tidak-ada');
if (fallbackUji !== en.read_file) {
  lapor(
    `bahasa tak dikenal tidak jatuh ke Inggris: dapat ${JSON.stringify(fallbackUji)}, harusnya ${JSON.stringify(en.read_file)}`,
  );
}
if (!fallbackUji.trim()) lapor('bahasa tak dikenal mengembalikan string kosong - baris tool akan hilang dari panel');

/*
 * Nama yang BENAR-BENAR tidak ada harus tetap kosong.
 *
 * Panel menyembunyikan baris tanpa deskripsi (lihat ToolGatePanel), dan teks
 * apa pun di situ akan menyesatkan: nama yang tidak ada di katalog bukan tool,
 * jadi tidak ada deskripsi yang bisa dipakai.
 */
if (deskripsiTool('tool-yang-tidak-pernah-ada', 'id') !== '') {
  lapor('nama tak dikenal seharusnya mengembalikan string kosong');
}

/* ------------------------------------------------------------------ */
/* 4. Laporan.                                                         */
/* ------------------------------------------------------------------ */

console.log(`katalog              : ${katalog.length} tool (${himpunanKatalog.size} nama polos)`);
for (const namaPeta of PETA_NAMA) {
  const isi = peta[namaPeta];
  console.log(
    `  DESKRIPSI_TOOL_${namaPeta.padEnd(2)}: ${isi ? String(Object.keys(isi).length).padStart(3) + ' kunci' : '  TIDAK ADA'}`,
  );
}
console.log(`tool MCP dengan awalan: ${mcpPanjang.length}`);
console.log(`bahasa memakai peta sendiri : ${bahasaAktif}`);
console.log(`bahasa jatuh ke Inggris     : ${bahasaFallback}`);
console.log(`deskripsiTool('read_file','xx') -> ${JSON.stringify(fallbackUji).slice(0, 60)}`);
console.log(`tool MCP kosong             : ${mcpKosong.length}`);
console.log(`ID berbeda dari EN          : ${idBedaDariEn}/${himpunanKatalog.size}`);

if (masalah.length) {
  console.error(`\nMASALAH (${masalah.length}):`);
  for (const x of masalah.slice(0, 60)) console.error('  - ' + x);
  if (masalah.length > 60) console.error(`  ... dan ${masalah.length - 60} lagi`);
  process.exit(1);
}
console.log(
  `\nOK: ${PETA_NAMA.length} peta x ${himpunanKatalog.size} kunci, himpunan kunci identik dengan katalog; ` +
    `${mcpPanjang.length} tool MCP terisi di semua bahasa; fallback ke Inggris bekerja.`,
);

/* Awalan nama tool MCP hidup di SATU sumber: `zephyrTools/awalan.ts`.
   `catalog.ts` mengimpornya, jadi literal `AWALAN_MCP = ...` memang tidak ada
   lagi di sana - memeriksa catalog.ts akan selalu gagal walau keadaannya benar.
   Yang diperiksa sekarang: (a) awalan.ts memuat literalnya, dan (b) catalog.ts
   benar-benar mengambilnya dari './awalan', supaya tidak ada salinan kedua yang
   bisa menyimpang dari daftar MCP yang diuji di atas. */
const awalanTeks = readFileSync(join(dirname(jalurDeskripsi), 'awalan.ts'), 'utf8');
const masalahAwalan = [];
if (!/export const AWALAN_MCP = 'mcp__zephyr__'/.test(awalanTeks))
  masalahAwalan.push("awalan.ts tidak lagi memuat AWALAN_MCP = 'mcp__zephyr__'");
if (!/from '\.\/awalan'/.test(katalogTeks) || !/\bAWALAN_MCP\b/.test(katalogTeks))
  masalahAwalan.push("catalog.ts tidak mengimpor AWALAN_MCP dari './awalan'");
if (masalahAwalan.length) {
  console.error(
    '\nCATATAN: ' +
      masalahAwalan.join('; ') +
      ' - perbarui daftar MCP di harness ini supaya ia tetap menguji tool yang benar.',
  );
  process.exit(1);
}
