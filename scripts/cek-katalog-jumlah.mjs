/*
 * cek-katalog-jumlah.mjs — hitung paket bawaan per kategori dan jelaskan
 * selisihnya terhadap HEAD, supaya paket tidak pernah "hilang diam-diam".
 *
 * Kenapa ada skrip ini, bukan sekadar pemeriksaan ad-hoc:
 * angka yang dilihat user di aplikasi (katalog bawaan = 105 paket di worktree,
 * 118 di HEAD) pernah berubah tanpa ada satu tempat pun yang bisa menjawab
 * "13 paket itu ke mana?". Selisih katalog yang tidak dijelaskan bukan sekadar
 * angka: ia berarti user kehilangan fitur tanpa tahu alasannya. Jadi setiap id
 * yang ada di HEAD dan tidak ada di worktree WAJIB punya alasan tertulis di
 * DIBUANG_SENGAJA. Kalau tidak, skrip gagal (exit 1) — bukan sekadar mencetak
 * peringatan yang gampang diabaikan.
 *
 * Tiga hal yang diperiksa:
 *   1. jumlah paket per kategori di ext_bundled.rs + ext_bundled_extra.rs
 *      (worktree) dan di HEAD (lewat `git show HEAD:<path>`);
 *   2. daftar id yang hilang / baru antara HEAD dan worktree, dicocokkan
 *      dengan DIBUANG_SENGAJA;
 *   3. konsistensi ikon: id bahasa yang paketnya sudah dibuang tapi barisnya
 *      MASIH ada di ext_lang_icons.rs -> dilaporkan sebagai "ikon ketinggalan"
 *      (peringatan, sengaja tidak menggagalkan skrip, karena ikon ketinggalan
 *      tidak merusak apa pun, cuma jadi sampah dan bukti pembersihan setengah).
 *
 * Pakai: node scripts/cek-katalog-jumlah.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const KATALOG = ['src-tauri/src/ext_bundled.rs', 'src-tauri/src/ext_bundled_extra.rs'];
const IKON = 'src-tauri/src/ext_lang_icons.rs';

/*
 * Id yang sengaja tidak lagi ditawarkan sebagai paket, beserta alasannya.
 *
 * Pola yang sama terlihat pada paket yang MASIH ada: ekstensi berkas milik
 * bahasa yang sudah native dipangkas dari daftarnya, karena menawarkan paket
 * untuk bahasa yang editor sudah dukung hanya membingungkan ("kenapa saya
 * harus pasang paket Python kalau Python sudah jalan?").
 *
 *   LANG_PYTHON     [".py",  ".pyw",  ".pyi"]     -> [".pyi"]
 *   LANG_RUBY       [".rb",  ".erb",  ".gemspec"] -> [".erb", ".gemspec"]
 *   LANG_PERL       [".pl",  ".pm",   ".t", ".pod"] -> [".t", ".pod"]
 *   LANG_POWERSHELL [".ps1", ".psm1", ".psd1"]    -> [".psm1", ".psd1"]
 *   LANG_MIRC       [".mrc", ".ini"]              -> [".mrc"]
 *   LANG_SASS       [".sass", ".scss"]            -> [".sass"]
 *   LANG_SHELL      [".sh",  ".bash", ".zsh", ".fish"] -> [".fish"]
 *
 * 13 paket bahasa di bawah adalah kelanjutan pemangkasan yang sama: bahasanya
 * sudah ditangani di dalam aplikasi (src/lib/lang.ts + src/lib/cmLegacyModes.ts),
 * jadi paketnya dilepas dari katalog bawaan.
 */
const DIBUANG_SENGAJA = {
  'zephyr.lang-javascript': 'JS/TS native lewat @codemirror/lang-javascript (package.json)',
  'zephyr.lang-css': 'CSS native lewat @codemirror/lang-css (package.json)',
  'zephyr.lang-go': 'Go native lewat @codemirror/lang-go (package.json)',
  'zephyr.lang-rust': 'Rust native lewat @codemirror/lang-rust (package.json)',
  'zephyr.lang-sql': 'SQL native lewat @codemirror/lang-sql (package.json)',
  'zephyr.lang-yaml': 'YAML native lewat @codemirror/lang-yaml (package.json)',
  'zephyr.lang-lua': 'Lua native lewat legacy-modes/mode/lua (src/lib/cmLegacyModes.ts:55)',
  'zephyr.lang-swift': 'Swift native lewat legacy-modes/mode/swift (src/lib/cmLegacyModes.ts:96)',
  'zephyr.lang-toml': 'TOML native lewat legacy-modes/mode/toml (src/lib/cmLegacyModes.ts:101)',
  'zephyr.lang-properties': 'Properties native lewat legacy-modes/mode/properties (src/lib/cmLegacyModes.ts:73)',
  'zephyr.lang-clike': 'C-like native lewat legacy-modes/mode/clike (src/lib/cmLegacyModes.ts:20)',
  'zephyr.lang-asterisk': 'Asterisk native lewat legacy-modes/mode/asterisk (src/lib/cmLegacyModes.ts:18)',
  'zephyr.lang-ttcn-cfg': 'TTCN-CFG native lewat legacy-modes/mode/ttcn-cfg (src/lib/cmLegacyModes.ts:104)',
};

let gagal = 0;
let peringatan = 0;

/* ── Parser ─────────────────────────────────────────────────────────── */

/*
 * Parser sengaja sederhana: ambil semua token `"id": "zephyr.…"` dan
 * `"categories": ["…"]` secara berurutan, lalu tempelkan tiap kategori ke id
 * terdekat SEBELUMNYA. Manifest di berkas ini selalu menulis `id` lebih dulu
 * daripada `categories`, jadi urutan sudah cukup andal; berkas ikon/tema
 * (payload JSON) tidak punya `id` maupun `categories` jadi tidak terhitung.
 */
function parseKatalog(teks) {
  const pola = /"id"\s*:\s*"(zephyr\.[^"]+)"|"categories"\s*:\s*\[\s*"([^"]+)"/g;
  const paket = [];
  let idTerakhir = null;
  let m;
  while ((m = pola.exec(teks)) !== null) {
    if (m[1]) {
      idTerakhir = m[1];
      paket.push({ id: m[1], kategori: null });
    } else if (idTerakhir) {
      const p = paket[paket.length - 1];
      if (p && p.id === idTerakhir && p.kategori === null) p.kategori = m[2];
    }
  }
  return paket;
}

function dariHEAD(berkas) {
  try {
    return execFileSync('git', ['show', `HEAD:${berkas}`], {
      cwd: AKAR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function rekap(paket) {
  const per = new Map();
  for (const p of paket) {
    const k = p.kategori || '(tanpa kategori)';
    per.set(k, (per.get(k) || 0) + 1);
  }
  return per;
}

function cetakRekap(judul, per) {
  const kunci = [...per.keys()].sort((a, b) => a.localeCompare(b));
  console.log(`  ${judul}`);
  let total = 0;
  for (const k of kunci) {
    const n = per.get(k);
    total += n;
    console.log(`    ${k.padEnd(14)} ${String(n).padStart(4)}`);
  }
  console.log(`    ${'— total —'.padEnd(14)} ${String(total).padStart(4)}`);
  return total;
}

/* ── 1. Katalog worktree ────────────────────────────────────────────── */

console.log('== JUMLAH PAKET KATALOG BAWAAN ==');
console.log('');
console.log(`Akar kerja: ${AKAR}`);
console.log('');

const semuaWorktree = [];
const perBerkasWorktree = new Map();

for (const berkas of KATALOG) {
  const path = join(AKAR, berkas);
  if (!existsSync(path)) {
    console.log(`LEWAT - ${berkas} tidak ada`);
    gagal++;
    continue;
  }
  const paket = parseKatalog(readFileSync(path, 'utf8'));
  paket.forEach((p) => semuaWorktree.push({ ...p, berkas }));
  perBerkasWorktree.set(berkas, paket);
  console.log(`${berkas}: ${paket.length} paket`);
}

console.log('');
console.log('Per kategori (worktree):');
for (const [berkas, paket] of perBerkasWorktree) cetakRekap(`${berkas}:`, rekap(paket));
const totalWorktree = cetakRekap('GABUNGAN:', rekap(semuaWorktree));

const tanpaKategori = semuaWorktree.filter((p) => !p.kategori);
if (tanpaKategori.length) {
  console.log('');
  console.log(`PERINGATAN - ${tanpaKategori.length} entri tanpa kategori: ${tanpaKategori.map((p) => p.id).join(', ')}`);
  peringatan++;
}

/* ── 2. Bandingkan dengan HEAD ──────────────────────────────────────── */

console.log('');
console.log('== BANDINGKAN DENGAN HEAD ==');
console.log('');

const idWorktree = new Set(semuaWorktree.map((p) => p.id));
const semuaHEAD = [];
let adaHEAD = false;

for (const berkas of KATALOG) {
  const teks = dariHEAD(berkas);
  if (teks === null) {
    console.log(`${berkas}: tidak ada di HEAD`);
    continue;
  }
  adaHEAD = true;
  const paket = parseKatalog(teks);
  paket.forEach((p) => semuaHEAD.push({ ...p, berkas }));
  if (berkas.endsWith('ext_bundled.rs')) {
    cetakRekap(`${berkas} (HEAD):`, rekap(paket));
  }
}

if (!adaHEAD) {
  console.log('GAGAL - tidak satu pun berkas katalog ditemukan di HEAD (jalankan di dalam repo git)');
  process.exit(1);
}

const idHEAD = new Set(semuaHEAD.map((p) => p.id));
const totalHEAD = new Set(semuaHEAD.map((p) => p.id)).size;

const hilang = [...idHEAD].filter((id) => !idWorktree.has(id)).sort();
const baru = [...idWorktree].filter((id) => !idHEAD.has(id)).sort();

const kategoriHEAD = (id) => semuaHEAD.find((p) => p.id === id)?.kategori || '(?)';
const kategoriWorktree = (id) => semuaWorktree.find((p) => p.id === id)?.kategori || '(?)';

console.log('');
console.log(`Total id unik  HEAD: ${totalHEAD}   worktree: ${idWorktree.size}   selisih: ${totalHEAD - idWorktree.size}`);
console.log('');

if (baru.length) {
  console.log(`ID BARU DI WORKTREE (${baru.length}):`);
  baru.forEach((id) => console.log(`  + ${id}  [${kategoriWorktree(id)}]`));
} else {
  console.log('ID BARU DI WORKTREE (0): -');
}

console.log('');
if (!hilang.length) {
  console.log('ID HILANG (0): -');
} else {
  console.log(`ID HILANG (${hilang.length}):`);
  const dijelaskan = [];
  const takDijelaskan = [];
  for (const id of hilang) {
    const alasan = DIBUANG_SENGAJA[id];
    if (alasan === undefined) {
      takDijelaskan.push(id);
      console.log(`  ? ${id.padEnd(24)} [${kategoriHEAD(id)}]  <- TIDAK DIJELASKAN`);
    } else {
      dijelaskan.push(id);
      console.log(`  . ${id.padEnd(24)} [${kategoriHEAD(id)}]  -> ${alasan}`);
    }
  }
  console.log('');
  console.log(`  dijelaskan DIBUANG_SENGAJA: ${dijelaskan.length}/${hilang.length}`);
  if (takDijelaskan.length) {
    console.log('');
    console.log(`GAGAL - ${takDijelaskan.length} id hilang tanpa alasan tercatat: ${takDijelaskan.join(', ')}`);
    console.log('        Tambahkan ke DIBUANG_SENGAJA di skrip ini (id + alasan), atau kembalikan paketnya.');
    gagal++;
  }
}

/* Daftar DIBUANG_SENGAJA yang basi: id-nya masih ada di katalog. */
const basi = Object.keys(DIBUANG_SENGAJA).filter((id) => idWorktree.has(id)).sort();
if (basi.length) {
  console.log('');
  console.log(`PERINGATAN - ${basi.length} id di DIBUANG_SENGAJA ternyata MASIH ada di katalog (daftar basi):`);
  basi.forEach((id) => console.log(`  ${id}`));
  peringatan++;
}

/* ── 3. Konsistensi ikon ────────────────────────────────────────────── */

console.log('');
console.log('== IKON BAHASA (ext_lang_icons.rs) ==');
console.log('');

const pathIkon = join(AKAR, IKON);
if (!existsSync(pathIkon)) {
  console.log(`LEWAT - ${IKON} tidak ada`);
} else {
  const teksIkon = readFileSync(pathIkon, 'utf8');
  const idIkon = new Set(
    [...teksIkon.matchAll(/"(zephyr\.lang-[a-z0-9-]+)"/g)].map((m) => m[1]),
  );
  const dibuang = Object.keys(DIBUANG_SENGAJA);
  const ketinggalan = dibuang.filter((id) => idIkon.has(id)).sort();
  const bersih = dibuang.filter((id) => !idIkon.has(id)).sort();

  console.log(`Total id ikon bahasa: ${idIkon.size}`);
  console.log(`Id yang sudah dibuang katalognya: ${dibuang.length}`);
  console.log('');

  if (ketinggalan.length) {
    console.log(`PERINGATAN - IKON KETINGGALAN (${ketinggalan.length}) — paketnya sudah tidak ada, barisnya masih ada:`);
    ketinggalan.forEach((id) =>
      console.log(`  ${id}  <- hapus barisnya agar pembersihan tidak setengah jalan`),
    );
    peringatan++;
  } else {
    console.log('OK - tidak ada ikon ketinggalan');
  }
  if (bersih.length) {
    console.log('');
    console.log(`Sudah bersih ikonnya (${bersih.length}): ${bersih.join(', ')}`);
  }
}

/* ── Rekap akhir ────────────────────────────────────────────────────── */

console.log('');
console.log('== REKAP ==');
console.log(`  total paket worktree : ${totalWorktree}`);
console.log(`  total id unik HEAD   : ${totalHEAD}`);
console.log(`  id hilang            : ${hilang.length} (dijelaskan ${hilang.filter((i) => DIBUANG_SENGAJA[i]).length})`);
console.log(`  id baru              : ${baru.length}`);
console.log(`  peringatan ikon/lain : ${peringatan}`);
console.log('');
console.log(gagal ? `== GAGAL: ${gagal} masalah ==` : '== katalog konsisten dengan HEAD ==');
process.exit(gagal ? 1 : 0);
