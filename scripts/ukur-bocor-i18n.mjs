/**
 * ukur-bocor-i18n.mjs - menghitung teks yang BOCOR ke UI, dengan angka.
 *
 *   node scripts/ukur-bocor-i18n.mjs
 *
 * Kenapa perlu mengukur, bukan menebak.
 *
 * Arsitektur i18n proyek ini TERBALIK dari yang biasa: kamus dasarnya memakai
 * KUNCI berbahasa Indonesia dan nilainya bahasa target. Jadi `tr('Sedang jalan')`
 * itu SAH - dan terjemahannya benar ADA di kamus. Teks Indonesia yang bocor
 * bukan berasal dari kunci Indonesia itu sendiri, melainkan dari kunci yang
 * TIDAK punya entri di kamus mana pun: `translate()` mengembalikannya apa
 * adanya, dan yang dikembalikan adalah teks Indonesia.
 *
 * Karena itu ukuran yang benar bukan "berapa banyak tr('Indonesia')" - itu akan
 * melaporkan ratusan kunci yang SEHAT - melainkan "berapa banyak kunci yang
 * dipanggil kode tapi tidak ada di kamus".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const AKAR = 'D:/Zephyr/src';

const berkasSemua = [];
const telusuri = (dir) => {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) {
      telusuri(p);
      continue;
    }
    if (/\.(ts|tsx)$/.test(nama)) berkasSemua.push(p);
  }
};
telusuri(AKAR);

/* Kamus: jangan dihitung sebagai "pemakai kunci". */
const KAMUS = new Set(['i18n.ts', 'i18n-extra.ts', 'i18n-src.ts']);

/* Semua kunci yang tersedia, dari ketiga berkas kamus. */
const semuaKunci = new Set();
const tambahKunci = (teks, pola) => {
  for (const m of teks.matchAll(pola)) semuaKunci.add(m[1]);
};

const isiKamus = (nama) => readFileSync(join(AKAR, 'lib', nama), 'utf8');
/* Kunci bisa berkutip tunggal, ganda, atau tanpa kutip (objek literal). */
for (const nama of KAMUS) {
  const t = isiKamus(nama);
  tambahKunci(t, /'((?:[^'\\]|\\.)*)':/g);
  tambahKunci(t, /"((?:[^"\\]|\\.)*)":/g);
  tambahKunci(t, /^\s*([A-Za-z][A-Za-z0-9_.]*):\s*'/gm);
}
console.log(`Kunci tersedia di kamus: ${semuaKunci.size}`);

/*
 * Kunci yang DIPANGGIL kode. Hanya bentuk literal yang bisa diukur otomatis;
 * kunci yang datang dari variabel tidak bisa, dan itu disebutkan sebagai
 * batasan di akhir.
 */
const BENTUK = [
  /\btr\(\s*'((?:[^'\\]|\\.)*)'/g,
  /\btr\(\s*"((?:[^"\\]|\\.)*)"/g,
  /\btx\(\s*'((?:[^'\\]|\\.)*)'/g,
  /\btx\(\s*"((?:[^"\\]|\\.)*)"/g,
  /\btranslate\(\s*[^,]+,\s*'((?:[^'\\]|\\.)*)'/g,
  /\btranslate\(\s*[^,]+,\s*"((?:[^"\\]|\\.)*)"/g,
];

const bocor = new Map();
let totalPanggilan = 0;

for (const berkas of berkasSemua) {
  const nama = berkas.split(/[\\/]/).pop();
  if (KAMUS.has(nama)) continue;
  const teks = readFileSync(berkas, 'utf8');
  for (const pola of BENTUK) {
    for (const m of teks.matchAll(pola)) {
      const kunci = m[1];
      totalPanggilan += 1;
      if (semuaKunci.has(kunci)) continue;
      const rel = berkas.replace(/\\/g, '/').replace('D:/Zephyr/src/', '');
      if (!bocor.has(kunci)) bocor.set(kunci, []);
      bocor.get(kunci).push(rel);
    }
  }
}

console.log(`Panggilan kunci literal: ${totalPanggilan}`);
console.log(`Kunci UNIK yang tidak ada di kamus: ${bocor.size}\n`);

/* Berapa banyak yang benar-benar teks Indonesia (mengandung kata Indonesia). */
const PENANDA = /\b(yang|dan|atau|untuk|dari|dengan|tidak|belum|sudah|akan|ini|itu|ke|di|pada|adalah|telah|bisa|harus|jika|kalau|saat|setelah|karena|agar|oleh|juga|hanya|masih|lebih|paling|satu|dua|semua|setiap|dapat)\b/i;
const INDONESIA_KHAS = /\b(Simpan|Batal|Hapus|Berkas|Pengaturan|Tutup|Buka|Cari|Jalankan|Ubah|Tambah|Gagal|Berhasil|Sedang|Menunggu|Antre|Selesai|Aktif|Nonaktif|Tema|Bahasa|Jendela|Pilih|Kirim|Muat|Simpan|Perbarui|Bersihkan|Riwayat|Catatan|Tugas|Jadwal|Alat|Bantuan|Tentang|Keluar|Masuk|Mundur|Maju|Atas|Bawah|Kiri|Kanan)\b/;

const indo = [];
const inggris = [];
for (const [kunci, tempat] of bocor) {
  if (INDONESIA_KHAS.test(kunci) || (PENANDA.test(kunci) && kunci.includes(' '))) indo.push([kunci, tempat]);
  else inggris.push([kunci, tempat]);
}

console.log(`== BOCOR: teks Indonesia (${indo.length} kunci unik) ==`);
for (const [kunci, tempat] of indo.sort((a, b) => b[1].length - a[1].length).slice(0, 40)) {
  console.log(`  ${JSON.stringify(kunci)}  <- ${tempat[0]}${tempat.length > 1 ? ` (+${tempat.length - 1})` : ''}`);
}
if (indo.length > 40) console.log(`  ... dan ${indo.length - 40} lagi`);

console.log(`\n== BOCOR: bukan teks Indonesia (${inggris.length} kunci unik) ==`);
for (const [kunci, tempat] of inggris.sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
  console.log(`  ${JSON.stringify(kunci)}  <- ${tempat[0]}`);
}
if (inggris.length > 25) console.log(`  ... dan ${inggris.length - 25} lagi`);

/* Berapa kunci yang HANYA ada di sebagian bahasa - sumber jatuhnya ke Indonesia. */
console.log('\n== Kunci yang ada di kamus tapi TIDAK di semua bahasa ==');
const extra = readFileSync(join(AKAR, 'lib', 'i18n-extra.ts'), 'utf8');
const blok = {};
const penandaBlok = [...extra.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)];
for (let i = 0; i < penandaBlok.length; i += 1) {
  const mulai = penandaBlok[i].index + penandaBlok[i][0].length;
  const akhir = i + 1 < penandaBlok.length ? penandaBlok[i + 1].index : extra.indexOf('export const EXTRA');
  blok[penandaBlok[i][1]] = extra.slice(mulai, akhir);
}
const kunciBahasa = {};
for (const [kode, isi] of Object.entries(blok)) {
  const s = new Set();
  for (const m of isi.matchAll(/'((?:[^'\\]|\\.)*)':/g)) s.add(m[1]);
  for (const m of isi.matchAll(/"((?:[^"\\]|\\.)*)":/g)) s.add(m[1]);
  kunciBahasa[kode] = s;
}
const kodeSemua = Object.keys(kunciBahasa);
let kurangDiSebagian = 0;
for (const kunci of kunciBahasa.EN || []) {
  const hilangDi = kodeSemua.filter((l) => l !== 'EN' && l !== 'ID' && !kunciBahasa[l].has(kunci));
  if (hilangDi.length) kurangDiSebagian += 1;
}
console.log(`  ${kurangDiSebagian} kunci ada di EN tapi tidak di semua bahasa lain`);
