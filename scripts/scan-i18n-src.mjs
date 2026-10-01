// scan-i18n-src.mjs — pindai sumber: atribut JSX + literal yang tampil di UI
// tapi belum dibungkus tr()/tx()/tf().
//
// Pakai:  node scripts/scan-i18n-src.mjs
//
// Fokus: nilai atribut (hint/label/title/placeholder/aria-label/alt) dan teks
// anak elemen yang mengandung kata Indonesia. Hasil dikelompokkan per file
// supaya perbaikannya bisa bertahap dan bisa diverifikasi.

import fs from 'node:fs';
import path from 'node:path';

const AKAR = 'src';
const ATTR = ['hint', 'label', 'title', 'placeholder', 'aria-label', 'alt', 'desc', 'note'];

// Kata yang menandakan teks Indonesia (bukan istilah teknis yang sama di dua bahasa).
const INDO =
  /\b(dipakai|untuk|yang|dengan|dari|tidak|belum|sudah|akan|bisa|saat|kalau|harus|juga|hanya|lebih|paling|biar|termuat|batas|ditumpuk|menempel|berat|halus|jelas|aktif|mati|nyala|buka|tutup|simpan|hapus|ubah|pilih|kirim|jalan|mulai|berhenti|berikutnya|sebelumnya|hasil|cari|ganti|pasang|lepas|tambah|kurang|naik|turun|kiri|kanan|bawah|penuh|kosong|baris|kolom|huruf|angka|warna|gambar|tampilan|jendela|layar|halaman|tombol|kotak|garis|titik|kata|teks|nama|isi|nilai|ukuran|jumlah|waktu|tempat|posisi|mode|pengaturan|perintah|proyek|folder|berkas|merekam|terdeteksi|kembali|selesai|menyimpan|mengubah|memilih|menjalankan|mengirim|membuka|menutup|kunci|password|terang|gelap|mode|angka|minimal|maksimal|setiap|seluruh|semua|tanpa|buat|memakai|berlaku|disimpan|dijalankan|ditulis|dipindah|dibuka|ditutup|dimatikan|dinyalakan|diaktifkan|kosongkan|naikkan|pasang|pindahkan|tandai|kira|perkiraan|daftar|dipaksa|ditolak|melewati|penjaga|saling|menimpa|terlipat|ringkasan|muncul)\b/i;

// Baris yang memang bukan UI (komentar, tipe, import, path, selector).
const SKIP =
  /^\s*(\/\/|\/\*|\*|import |export type|export interface|type |interface )/;

function berkasTsx(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) berkasTsx(p, out);
    else if (/\.(tsx|ts)$/.test(f.name) && !/\.test\./.test(f.name)) out.push(p);
  }
  return out;
}

const hasil = {};

for (const file of berkasTsx(AKAR)) {
  const isi = fs.readFileSync(file, 'utf8');
  const baris = isi.split('\n');
  const temuan = [];

  baris.forEach((l, i) => {
    if (SKIP.test(l)) return;

    // 1. Atribut mentah: attr="..." (bukan attr={...})
    for (const a of ATTR) {
      const re = new RegExp(`${a}="([^"]{4,200})"`, 'g');
      let m;
      while ((m = re.exec(l))) {
        const t = m[1].trim();
        // Lewati yang jelas teknis (path, url, kode, angka saja, nama kunci)
        if (!INDO.test(t)) continue;
        if (/^(https?:|[A-Z]:|\\\\|\/|[a-z0-9._-]+$)/i.test(t)) continue;
        temuan.push({ baris: i + 1, jenis: `attr:${a}`, teks: t });
      }
    }

    // 2. Anak elemen mentah: >teks< yang mengandung kata Indonesia
    const re2 = />([^<>{}\n]{8,200})</g;
    let m2;
    while ((m2 = re2.exec(l))) {
      const t = m2[1].trim();
      if (!INDO.test(t)) continue;
      if (/^[A-Za-z0-9._\-/\\:]+$/.test(t)) continue;
      temuan.push({ baris: i + 1, jenis: 'anak', teks: t });
    }
  });

  if (temuan.length > 0) hasil[file] = temuan;
}

// Cetak ringkas
let total = 0;
const unik = new Set();
for (const [file, temuan] of Object.entries(hasil)) {
  console.log(`\n## ${file} (${temuan.length})`);
  for (const t of temuan) {
    console.log(`   ${String(t.baris).padStart(4)} [${t.jenis}] ${t.teks}`);
    unik.add(t.teks);
  }
  total += temuan.length;
}
console.log(`\n== ${total} temuan, ${unik.size} teks unik, ${Object.keys(hasil).length} berkas ==`);

// Simpan daftar unik untuk dipakai skrip terjemahan
const outPath = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'i18n-temuan.json');
fs.writeFileSync(outPath, JSON.stringify([...unik].sort(), null, 2), 'utf8');
console.log(`   daftar unik: ${outPath}`);
