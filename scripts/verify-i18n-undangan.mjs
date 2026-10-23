// verify-i18n-undangan.mjs — detektor "permukaan yang belum diterjemahkan".
//
// MASALAH: sebagian komponen memanggil tr()/tx()/tf() dengan teks Indonesia mentah
// alih-alih key katalog. Teks seperti itu hanya tampil benar saat bahasa antarmuka =
// Indonesia; di bahasa lain ia jatuh ke Inggris atau, kalau peta tidak punya entrinya,
// muncul mentah.
//
// PENTING (versi kedua detector ini): teks INGGRIS sebagai argumen SUDAH BENAR di
// proyek ini. translate() (src/lib/i18n.ts) memakai teks Inggris literal sebagai key
// dan mencari terjemahannya di `src/lib/i18n-src.ts` (lihat `EN: Record<string,string>`
// di sana, mis. 'hasil' -> 'result', 'Kembalikan tata letak bawaan' -> ...). Jadi
// `tx('Close notification')` adalah bentuk yang sah, BUKAN temuan.
//
// Yang salah hanyalah teks BAHASA INDONESIA yang ditulis langsung: ia tidak pernah ada
// di kamus mana pun, sehingga takkan pernah diterjemahkan.
//
// Heuristik:
//   - buang key bertitik ('settings.title', 'ai.loop.running');
//   - buang literal yang MEMANG ada sebagai key di kamus — sumber kebenarannya sama
//     dengan yang dipakai translate(): src/lib/i18n.ts (DICTS), src/lib/i18n-extra.ts
//     (EXTRA, menang), dan src/lib/i18n-src.ts (SRC). Literal seperti
//     'Sama seperti chat (bawaan)' yang ada di kamus memang diterjemahkan, jadi bukan
//     temuan walau tulisannya Indonesia;
//   - buang label pendek yang memang sengaja dibiarkan (§LABEL_PENDEK);
//   - buang literal yang tidak punya huruf sama sekali;
//   - temuan = literal yang memuat >= 2 kata Indonesia, ATAU tepat 1 kata Indonesia
//     yang AMAT KHAS dan tidak dipakai bahasa Inggris (§KATA_ID_KHAS).
//
// Versi lama menandai SETIAP literal yang memuat spasi. Itu membanjiri laporan dengan
// 916 teks Inggris yang sesungguhnya benar dan mengubur temuan asli.
//
// Jalankan: node scripts/verify-i18n-undangan.mjs
// Keluar 0 bila tidak ada temuan; keluar 1 bila ada (bisa dipakai sebagai gate).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const AKAR = 'src';

/** Fungsi translator yang argumen pertamanya adalah kunci. */
const FUNGSI = new Set(['tr', 'tf', 'tx', 'useT', 'useTf']);

/** Berapa kata Indonesia minimal supaya sebuah literal dianggap kalimat Indonesia. */
const MIN_KATA = 2;

/**
 * Kata Indonesia yang sudah pasti menandai kalimat Indonesia walau berdiri sendiri
 * (>= MIN_KATA tidak berlaku untuk daftar ini). Isinya sengaja KURAT: kata yang juga
 * lazim sebagai kata Inggris atau sebagai potongan UI teknis ("save", "open", "close",
 * "semua", "cari", "kunci", "hapus", "cek", "pi") TIDAK dimasukkan, supaya teks Inggris
 * tidak tertandai.
 */
const KATA_ID_KHAS = new Set([
  'berkas',
  'berjalan',
  'diperlukan',
  'kesalahan',
  'mengunduh',
  'memuat',
  'pengaturan',
  'setelan',
  'tampilkan',
  'sembunyikan',
  'jalankan',
  'kirim',
  'selesai',
  'gagal',
  'berhasil',
  'tidak',
  'belum',
  'sudah',
  'harus',
  'kalau',
  'jika',
  'karena',
  'namun',
  'tetapi',
  'supaya',
  'semoga',
]);

/** Kata yang menandai kalimat Indonesia. Dipakai untuk hitungan >= MIN_KATA. */
const KATA_ID = new Set([
  // partikel / kata fungsi
  'yang', 'dan', 'atau', 'tidak', 'dengan', 'untuk', 'sudah', 'belum', 'akan',
  'dari', 'ini', 'itu', 'bisa', 'jika', 'kalau', 'tutup', 'buka', 'bisa',
  'telah', 'pada', 'dalam', 'saat', 'ketika', 'karena', 'supaya', 'agar',
  'tetapi', 'namun', 'lalu', 'kemudian', 'adalah', 'oleh', 'antara', 'serta',
  'maupun', 'sehingga', 'maka', 'selama', 'setelah', 'sebelum', 'sambil',
  'tanpa', 'saja', 'lah', 'pun', 'tak', 'nya',
  // keterangan / kuantitas
  'sedang', 'masih', 'juga', 'hanya', 'semua', 'setiap', 'seperti', 'pernah',
  'selalu', 'sering', 'kadang', 'mungkin', 'pasti', 'sangat', 'cukup',
  'terlalu', 'sekali', 'lebih', 'paling', 'bukan', 'lagi', 'sini', 'sana',
  'mana', 'apa', 'siapa', 'kapan', 'bagaimana', 'mengapa', 'dulu', 'nanti',
  'sekarang', 'kembali', 'ulangi', 'tunggu',
  // aksi / istilah aplikasi
  'gagal', 'berhasil', 'harus', 'jalankan', 'simpan', 'hapus', 'atur', 'pilih',
  'tambah', 'ubah', 'cari', 'salurkan', 'salin', 'muat', 'periksa', 'pasang',
  'lepas', 'aktifkan', 'matikan', 'batal', 'lanjut', 'mulai', 'hentikan',
  'berkas', 'folder', 'berjalan', 'memuat', 'mengunduh', 'kesalahan',
  'pengaturan', 'setelan', 'tampilkan', 'sembunyikan', 'kirim', 'selesai',
  'bawaan', 'kustom', 'bilah', 'tautan', 'wadah', 'isian', 'pesan', 'perintah',
  'jalan', 'hidup', 'mati', 'kirim', 'dipakai', 'pakai', 'butuh', 'minta',
  'perlu', 'wajib', 'izin', 'biar', 'boleh', 'tampil',
]);

/**
 * Label pendek yang sengaja dibiarkan sebagai literal (istilah teknis/merek yang
 * sama di semua bahasa). Tambahkan di sini dengan sengaja, bukan untuk menyembunyikan
 * temuan yang sebenarnya harus diterjemahkan.
 */
const LABEL_PENDEK = new Set([
  'Zoom In',
  'Zoom Out',
  'Base URL',
  'API Key',
]);

/** Pola key katalog: minimal dua segmen huruf kecil/snake_case dipisah titik. */
const KEY_BERTITIK = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b/;

/**
 * Berkas kamus yang dipakai translate() (src/lib/i18n.ts). EXTRA menang atas DICTS,
 * dan SRC menangani key yang sumbernya teks asli. Ketiganya dianggap "sudah masuk kamus".
 */
const BERKAS_KAMUS = ['src/lib/i18n.ts', 'src/lib/i18n-extra.ts', 'src/lib/i18n-src.ts'];

/**
 * Baca SEMUA key dari kamus (segmen mana pun; nilai sebenarnya tidak dibutuhkan).
 * Bentuk yang didukung: `'key': 'nilai'` maupun `'key':\n  'nilai'` — keduanya cocok
 * dengan pola yang sama karena kita hanya membaca sisi sebelum titik dua.
 */
function muatKeyKamus() {
  const key = new Set();
  for (const b of BERKAS_KAMUS) {
    if (!existsSync(b)) continue;
    const teks = readFileSync(b, 'utf8');
    /*
     * Both quote styles. The dictionary is not consistent: entries written later
     * use double quotes (`"Selesai": "Done"`), and a single-quote-only pattern
     * reported those keys as "missing from the dictionary" - nine false findings
     * in the AI status badges, which were in fact translated.
     */
    for (const m of teks.matchAll(/['"]((?:[^'\\"]|\\.)*)['"]\s*:/g)) key.add(m[1]);
  }
  return key;
}

const KEY_KAMUS = muatKeyKamus();

/** Pola pemanggilan `nama(` atau `nama (`. */
const PEMANGGILAN = /\b(tr|tf|tx|useT|useTf)\s*\(/g;

/** Cocokkan literal string JS/TS (single, double, backtick) yang dimulai pada posisi i. */
function bacaLiteral(teks, i) {
  const kutip = teks[i];
  if (kutip !== "'" && kutip !== '"' && kutip !== '`') return null;
  let j = i + 1;
  let isi = '';
  while (j < teks.length) {
    const c = teks[j];
    if (c === '\\') {
      isi += teks[j + 1] ?? '';
      j += 2;
      continue;
    }
    if (c === kutip) return { isi, akhir: j };
    if (c === '\n' && kutip !== '`') return null; // literal tak wajar
    isi += c;
    j += 1;
  }
  return null;
}

/** Hitung nomor baris (1-based) dari offset. */
function baris(teks, offset) {
  let n = 1;
  for (let i = 0; i < offset; i += 1) if (teks[i] === '\n') n += 1;
  return n;
}

/**
 * Pecah literal menjadi kata. Placeholder gaya {nama}, ekspansi ${...}, dan tag ikut
 * dibuang supaya tidak dihitung sebagai kata Indonesia. Angka/URL juga dibuang.
 */
function kataDari(literal) {
  return literal
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .toLowerCase()
    .split(/[^a-z\u00c0-\u024f]+/)
    .filter(Boolean);
}

/**
 * Apakah literal ini teks BAHASA INDONESIA yang ditulis langsung?
 * Hanya `true` bila ada bukti kuat; teks Inggris (termasuk kalimat panjang) `false`.
 */
function terlihatSepertiIndonesia(literal) {
  const t = literal.trim();
  if (!t) return false;
  if (KEY_BERTITIK.test(t)) return false; // sudah berupa key katalog
  if (KEY_KAMUS.has(t)) return false; // sudah terdaftar di kamus, jadi diterjemahkan
  if (LABEL_PENDEK.has(t)) return false; // label pendek yang disengaja
  if (!/[A-Za-z]/.test(t)) return false; // angka/simbol saja

  const kata = kataDari(t);
  const khas = kata.filter((k) => KATA_ID_KHAS.has(k)).length;
  if (khas >= 1) return true; // satu kata Indonesia yang amat khas sudah cukup
  const umum = kata.filter((k) => KATA_ID.has(k)).length;
  return umum >= MIN_KATA; // sisanya perlu minimal dua kata Indonesia
}

/** Kumpulkan semua file .ts/.tsx di bawah dir, lewati node_modules. */
function kumpulkanFile(dir) {
  const hasil = [];
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama.startsWith('.')) continue;
    const p = join(dir, nama);
    const st = statSync(p);
    if (st.isDirectory()) hasil.push(...kumpulkanFile(p));
    else if (/\.(ts|tsx)$/.test(nama) && !nama.endsWith('.d.ts')) hasil.push(p);
  }
  return hasil;
}

const temuan = []; // { file, baris, literal }
for (const file of kumpulkanFile(AKAR)) {
  const teks = readFileSync(file, 'utf8');
  PEMANGGILAN.lastIndex = 0;
  let m;
  while ((m = PEMANGGILAN.exec(teks)) !== null) {
    if (!FUNGSI.has(m[1])) continue;
    // Lewati spasi setelah '(' untuk menemukan argumen pertama.
    let i = m.index + m[0].length;
    while (i < teks.length && /\s/.test(teks[i])) i += 1;
    const lit = bacaLiteral(teks, i);
    if (!lit) continue;
    if (!terlihatSepertiIndonesia(lit.isi)) continue;
    temuan.push({
      file: relative('.', file).replace(/\\/g, '/'),
      baris: baris(teks, i),
      literal: lit.isi,
    });
  }
}

// Kelompokkan per file, urutkan file dengan jumlah terbanyak di atas.
const perFile = new Map();
for (const t of temuan) {
  if (!perFile.has(t.file)) perFile.set(t.file, []);
  perFile.get(t.file).push(t);
}
const urut = [...perFile.entries()].sort(
  (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
);

if (temuan.length === 0) {
  console.log(
    'BERSIH — tidak ada panggilan tr()/tf()/tx() dengan literal bahasa Indonesia.',
  );
  process.exit(0);
}

console.log(
  `Teks Indonesia mentah di tr()/tf()/tx(): ${temuan.length} panggilan di ${perFile.size} berkas.\n`,
);
for (const [file, daftar] of urut) {
  console.log(`${file} (${daftar.length})`);
  for (const t of daftar.sort((a, b) => a.baris - b.baris)) {
    console.log(`  ${t.baris}: ${t.literal}`);
  }
  console.log('');
}
console.log(`TOTAL: ${temuan.length}`);
process.exit(1);
