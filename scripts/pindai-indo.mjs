// pindai-indo.mjs — temukan SEMUA teks Indonesia yang dirender di UI.
//
// Versi sebelumnya hanya menangkap beberapa bentuk (label:, hint:, isi tag).
// Skrip ini memindai lebih luas: seluruh string literal dan teks JSX, lalu
// menyaring yang benar-benar berbahasa Indonesia memakai daftar kata fungsi
// (kata yang hampir selalu muncul di kalimat Indonesia) dan daftar kata yang
// dikecualikan (istilah teknis, nama merek, potongan kode).
//
// Keluaran: %LOCALAPPDATA%\Temp\indo-<n>.json berisi daftar kunci unik.

import fs from 'node:fs';
import path from 'node:path';

const KATA_ID = [
  'yang', 'dengan', 'tidak', 'belum', 'sudah', 'dari', 'untuk', 'pada', 'dalam',
  'adalah', 'akan', 'bisa', 'kalau', 'saat', 'lagi', 'juga', 'harus', 'lebih',
  'paling', 'soal', 'baris', 'sini', 'apa', 'saja', 'jika', 'agar', 'supaya',
  'setiap', 'semua', 'hanya', 'bukan', 'masih', 'pernah', 'sedang', 'telah',
  'oleh', 'antara', 'serta', 'maupun', 'namun', 'tetapi', 'tapi', 'karena',
  'sehingga', 'maka', 'kapan', 'dimana', 'bagaimana', 'mengapa', 'siapa',
  'mana', 'atau', 'dan', 'ini', 'itu', 'ke', 'di', 'lah', 'nya', 'pun', 'tak',
  'selama', 'setelah', 'sebelum', 'ketika', 'sambil', 'tanpa', 'kembali',
  'buat', 'dipakai', 'pakai', 'minta', 'butuh', 'jalan', 'berjalan', 'mati',
  'hidup', 'buka', 'tutup', 'simpan', 'hapus', 'tambah', 'ubah', 'cari',
  'kirim', 'pilih', 'salin', 'muat', 'periksa', 'pasang', 'lepas', 'aktif',
  'nonaktif', 'aktifkan', 'matikan', 'nyala', 'malam', 'siang', 'terang',
  'gelap', 'warna', 'huruf', 'ukuran', 'tinggi', 'lebar', 'kecil', 'besar',
  'cepat', 'lambat', 'berat', 'ringan', 'halus', 'kasar', 'nyaman', 'aman',
  'data', 'berkas', 'folder', 'tempat', 'posisi', 'daftar', 'jumlah', 'nama',
  'kunci', 'nilai', 'hasil', 'cara', 'pakai', 'guna', 'perlu', 'mau', 'ingin',
  'satu', 'dua', 'tiga', 'empat', 'lima', 'penuh', 'kosong', 'bersih', 'kotor',
  'baru', 'lama', 'awal', 'akhir', 'atas', 'bawah', 'kiri', 'kanan', 'depan',
  'belakang', 'samping', 'luar', 'sebelah', 'sama', 'beda', 'lain', 'hanya',
  'juga', 'saja', 'sangat', 'agak', 'cukup', 'terlalu', 'sekali', 'pernah',
  'selalu', 'sering', 'jarang', 'kadang', 'mungkin', 'pasti', 'tentu', 'jelas',
  'samar', 'sedang', 'kualitas', 'kecepatan', 'ukuran', 'bentuk', 'gaya',
  'tampilan', 'layar', 'jendela', 'panel', 'tombol', 'menu', 'pilihan',
  'pengaturan', 'setelan', 'aturan', 'syarat', 'kondisi', 'keadaan', 'status',
];

/** Istilah yang bukan kalimat Indonesia walau memuat kata di atas. */
const ABAIKAN = [
  /^(Enter|Shift|Ctrl|Alt|Cmd|Esc|Tab|Space|F\d+)[\s+·]/,
  /^[A-Za-z-]+\/[A-Za-z-]+$/,
  /^[a-z-]+\.[a-z]+$/,
  /^#[0-9a-f]{3,8}$/i,
  /^https?:/,
  /^\d/,
  /^[A-Z_]{3,}$/,
  /^(import|export|const|function|return|await|async)\b/,
  /^[a-z]+[A-Z][a-zA-Z]*$/, // camelCase
  /^(zephyr|github|whatsapp|trakteer|saweria|opencode|claude|codex|gemini|copilot|cursor|hermes|vscode|vs code|npm|node|python|rust|json|yaml|html|css|ssh|mcp|lsp|dap|api|url|cli|pid|ram|cpu|ui|ux|ai)\b/i,
  /^[\w.-]+\.(json|ts|tsx|js|mjs|exe|cmd|toml|yaml|md|txt)$/,
];

function berjalan(dir, hasil = []) {
  for (const nama of fs.readdirSync(dir)) {
    const p = path.join(dir, nama);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(nama)) continue;
      berjalan(p, hasil);
    } else if (/\.(tsx|ts)$/.test(nama) && !/i18n/.test(nama)) {
      hasil.push(p);
    }
  }
  return hasil;
}

const temuan = new Map(); // teks -> [{berkas, baris}]

/**
 * Apakah teks ini kalimat Indonesia?
 *
 * Syarat: minimal 5 karakter, mengandung minimal satu kata fungsi Indonesia,
 * dan tidak cocok dengan daftar pengecualian.
 */
function indonesia(t) {
  const s = t.trim();
  if (s.length < 5 || s.length > 400) return false;
  if (ABAIKAN.some((re) => re.test(s))) return false;
  // Harus ada huruf, bukan hanya simbol/angka.
  if (!/[a-zA-Z]{3}/.test(s)) return false;
  const kata = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return kata.some((k) => KATA_ID.includes(k));
}

for (const p of berjalan('src')) {
  const src = fs.readFileSync(p, 'utf8');
  const tambah = (teks, idx) => {
    const t = teks.trim();
    if (!indonesia(t)) return;
    // Lewati yang sudah dibungkus tr()/tx().
    const sebelum = src.slice(Math.max(0, idx - 30), idx);
    if (/\b(tr|tx|tf|translate)\(\s*['"]$/.test(sebelum)) return;
    const baris = src.slice(0, idx).split('\n').length;
    if (!temuan.has(t)) temuan.set(t, []);
    temuan.get(t).push({ berkas: p, baris });
  };

  // 1. Teks di antara tag JSX.
  for (const m of src.matchAll(/>\s*([^<>{}"\n]{5,400}?)\s*</g)) tambah(m[1], m.index);

  // 2. String literal (kutip tunggal, ganda, backtick) — untuk prop dan objek.
  for (const m of src.matchAll(/(['"`])((?:[^'"`\\\n]|\\.){5,400})\1/g)) {
    const isi = m[2];
    // Hanya ambil yang tampak seperti kalimat, bukan potongan kode.
    if (!/[A-Za-z]{3}/.test(isi)) continue;
    if (/[;{}()=><\[\]]/.test(isi) && !/—/.test(isi)) continue;
    tambah(isi, m.index);
  }
}

const daftar = [...temuan.keys()].sort();
const keluar = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', `indo-${daftar.length}.json`);
fs.writeFileSync(keluar, JSON.stringify(
  daftar.map((t) => ({ teks: t, lokasi: temuan.get(t).slice(0, 3) })), null, 2));

console.log(`# ${daftar.length} teks Indonesia ditemukan`);
console.log(`# disimpan: ${keluar}\n`);
for (const t of daftar.slice(0, 40)) {
  const l = temuan.get(t)[0];
  console.log(`  ${t.slice(0, 100)}`);
  console.log(`      ${l.berkas}:${l.baris}`);
}
if (daftar.length > 40) console.log(`\n  … ${daftar.length - 40} lagi di berkas JSON`);
