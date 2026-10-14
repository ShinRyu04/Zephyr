/*
 * gen-dokumen-bundel.mjs - panen SEMUA dokumen repo jadi artefak yang ikut bundel.
 *
 * ## Kenapa ada
 *
 * Aplikasi yang dipasang user TIDAK membawa folder sumbernya: `docs/`, `README`,
 * dan `CHANGELOG` sengaja tidak ikut repo publik (`docs/ATURAN-KERJA.md` §1).
 * Pertanyaan "apa isi dokumen Zephyr" karena itu tidak bisa dijawab dari disk
 * user - yang tidak ada di sana. Jawabannya harus IKUT BUNDEL, sama seperti
 * fakta Zephyr (`scripts/gen-fakta-zephyr.mjs` -> `src/lib/zephyrIndeks.ts`).
 *
 * Beda sasaran: indeks fakta menyimpan fakta ringkas (label, setelan, pintasan),
 * skrip ini menyimpan ISI DOKUMEN apa adanya - sub-bab, tabel, keputusan, spike.
 *
 * Yang dibaca (dan hanya itu):
 *   1. docs/**\/*.md            (rekursif, termasuk sub-folder)
 *   2. CHANGELOG*.md di akar    (bahan pertanyaan "apa yang baru")
 *   3. README*.md di akar
 *   4. RELEASE_NOTES*.md di akar
 * Alasan yang lain (AGENTS.md, ARCHITECTURE.md, SECURITY.md, BUGLOG.md, dst)
 * tidak diambil: itu berkas kerja agen, bukan dokumentasi produk, dan sebagian
 * sudah ada di kategori `dokumen` indeks fakta.
 *
 * Keluaran: src/lib/zephyrDokumenData.ts
 *   - DOKUMEN_VERSI  : jumlah berkas/bagian, total byte, hash sumber, cap waktu
 *   - DOKUMEN_BERKAS : [berkas, ukuran, ubah(ISO), jumlah bagian, jumlah baris]
 *   - DOKUMEN_BAGIAN : [berkas, judul, baris(1-based), teks]
 *
 * Normalisasi (berlaku juga di sisi pembaca/harness):
 *   - CRLF -> LF (nomor baris tidak bergeser, jadi `berkas:baris` tetap cocok
 *     dengan berkas aslinya);
 *   - teks DISIMPAN APA ADANYA selain itu - tidak dipotong, diringkas, atau
 *     diterjemahkan, karena potongan hasil pencarian harus bisa dicek balik ke
 *     berkas nyata (harness `scripts/cek-bundel-docs.mjs` memang begitu).
 *
 * Judul di dalam blok pagar (``` / ~~~) DIABAIKAN saat memecah bagian: tanpa
 * aturan itu komentar `#` di dalam blok ```bash dianggap sub-bab dan dokumen
 * pecah di tempat yang salah (AGENTS.md dan CHANGELOG.md penuh contoh seperti
 * itu).
 *
 * Deterministik: cap waktu artefak = mtime SUMBER TERBARU (bukan jam sekarang),
 * jadi `--check` bisa membandingkan hasil generate ulang dengan berkas di disk.
 *
 * Jalankan:
 *   node scripts/gen-dokumen-bundel.mjs           # tulis src/lib/zephyrDokumenData.ts
 *   node scripts/gen-dokumen-bundel.mjs --check   # exit 1 kalau artefak basi
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const KELUARAN = join(akar, 'src/lib/zephyrDokumenData.ts');
const CHECK = process.argv.includes('--check');

/** Berkas markdown di akar yang ikut bundel (README/CHANGELOG/catatan rilis). */
const PILIH_AKAR = /^(readme|changelog|release_notes).*\.md$/i;

/** Kumpulkan berkas: docs/**\/*.md + keluarga README/CHANGELOG/RELEASE_NOTES. */
function daftarBerkas() {
  const nama = [];
  const telusuri = (rel) => {
    const mutlak = join(akar, rel);
    let isi;
    try {
      isi = readdirSync(mutlak, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of isi) {
      const anak = `${rel}/${e.name}`;
      if (e.isDirectory()) telusuri(anak);
      else if (e.name.toLowerCase().endsWith('.md')) nama.push(anak);
    }
  };
  telusuri('docs');
  for (const e of readdirSync(akar, { withFileTypes: true })) {
    if (e.isFile() && PILIH_AKAR.test(e.name)) nama.push(e.name);
  }
  /* Urutan berkas ikut alfabetis supaya hasil generate tidak bergoyang. */
  return [...new Set(nama)].sort();
}

const PAGAR = /^\s*(```|~~~)/;

/**
 * Pecah markdown jadi bagian per judul. Judul di dalam blok pagar diabaikan.
 *
 * Nomor baris disimpan EKSPLISIT, bukan diturunkan dari rumus: `barisJudul`
 * (baris judul, 0 kalau bagian ini tak punya judul) dan `barisTeks` (baris
 * pertama teks bagian). Dua angka terpisah itu menghapus seluruh kasus khusus
 * "preamble sebelum judul pertama" - pembaca tidak perlu menebak dari string.
 *
 * Baris kosong di ujung teks dibuang, dan bagian yang sama sekali tidak berisi
 * teks (judul langsung disusul judul lain, mis. `## [Unreleased]` yang langsung
 * disusul `### Security`) TIDAK disimpan: tidak ada satu baris pun yang bisa
 * dikutip dari sana, jadi menyimpannya cuma memancing potongan kosong.
 */
function pecahBagian(teks) {
  const baris = teks.split('\n');
  const bagian = [];
  let judul = '(tanpa judul)';
  let nomorJudul = 0;
  let kumpul = [];
  let pagar = null; // penanda pagar yang sedang terbuka (``` atau ~~~)

  const dorong = () => {
    const mulai = kumpul.findIndex((l) => l.trim().length > 0);
    const dasarTeks = nomorJudul === 0 ? 1 : nomorJudul + 1;
    if (mulai === -1) {
      /*
       * Judul TANPA BADAN (mis. `## [Unreleased]` yang langsung disusul
       * `### Security`) tetap disimpan: dia yang jadi batas blok rilis di
       * CHANGELOG, dan tanpanya "apa yang baru" akan menunjuk rilis yang salah
       * (1.0.0, rilis pertama). Teksnya kosong, jadi pencarian melewatinya -
       * tidak ada baris yang bisa dikutip dari sana.
       */
      if (nomorJudul !== 0) bagian.push({ judul, barisJudul: nomorJudul, barisTeks: dasarTeks, teks: '' });
      return;
    }
    let akhir = kumpul.length;
    while (akhir > mulai && kumpul[akhir - 1].trim() === '') akhir--;
    const isi = kumpul.slice(mulai, akhir).join('\n');
    bagian.push({ judul, barisJudul: nomorJudul, barisTeks: dasarTeks + mulai, teks: isi });
  };

  for (let i = 0; i < baris.length; i++) {
    const l = baris[i];
    const penanda = PAGAR.exec(l)?.[1];
    if (penanda) {
      if (!pagar) pagar = penanda;
      else if (l.trimStart().startsWith(pagar)) pagar = null;
    }
    const judulBaru = pagar ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(l);
    if (judulBaru) {
      dorong();
      judul = judulBaru[2];
      nomorJudul = i + 1;
      kumpul = [];
      continue;
    }
    kumpul.push(l);
  }
  dorong();
  return bagian;
}

/** Normalisasi baca: CRLF -> LF saja. Isi lain tidak disentuh. */
function baca(rel) {
  const mutlak = join(akar, rel);
  const mentah = readFileSync(mutlak, 'utf8');
  const teks = mentah.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const st = statSync(mutlak);
  return { teks, ukuran: st.size, ubah: st.mtime.toISOString(), baris: teks.split('\n').length };
}

function bangun() {
  const berkas = [];
  const bagian = [];
  const potonganHash = [];
  let terbaru = 0;

  for (const rel of daftarBerkas()) {
    const f = baca(rel);
    const bagi = pecahBagian(f.teks);
    berkas.push([rel, f.ukuran, f.ubah, bagi.length, f.baris]);
    for (const b of bagi) bagian.push([rel, b.judul, b.barisJudul, b.barisTeks, b.teks]);
    potonganHash.push(`${rel}\u0000${f.ukuran}\u0000${f.ubah}`);
    const ms = Date.parse(f.ubah);
    if (ms > terbaru) terbaru = ms;
  }

  const totalByte = berkas.reduce((n, b) => n + b[1], 0);
  const hashSumber = createHash('sha256').update(potonganHash.join('\n')).digest('hex').slice(0, 16);
  const versi = {
    dihasilkan: new Date(terbaru || Date.now()).toISOString(),
    hashSumber,
    jumlahBerkas: berkas.length,
    jumlahBagian: bagian.length,
    totalByte,
  };
  return { berkas, bagian, versi };
}

const strs = (v) => JSON.stringify(v);

function tulis({ berkas, bagian, versi }) {
  const baris = [];
  baris.push('/* BERKAS HASIL GENERATE - jangan disunting tangan.');
  baris.push(' * Dihasilkan oleh scripts/gen-dokumen-bundel.mjs. Isinya:');
  baris.push(
    ` * ${versi.jumlahBerkas} berkas dokumen, ${versi.jumlahBagian} bagian, ${Math.round(versi.totalByte / 1024)} KB teks.`,
  );
  baris.push(' *');
  baris.push(' * Kenapa ada: aplikasi yang dipasang user tidak membawa folder `docs/`,');
  baris.push(' * `README`, atau `CHANGELOG` - ketiganya sengaja tidak ikut repo publik. Supaya');
  baris.push(' * Zeph bisa menjawab pertanyaan tentang isi dokumennya sendiri, isinya dipanen');
  baris.push(' * saat build dan IKUT BUNDEL; src/lib/zephyrDokumen.ts yang mencari di sini.');
  baris.push(' *');
  baris.push(' * Teks disimpan apa adanya (hanya CRLF -> LF), jadi potongan hasil pencarian');
  baris.push(' * bisa dicek balik ke berkas nyata pada nomor baris yang disebut.');
  baris.push(' *');
  baris.push(' * Nomor baris disimpan eksplisit: `barisJudul` (0 = bagian tanpa judul) dan');
  baris.push(' * `barisTeks` = baris pertama teks bagian. Sebagian judul tidak berbadan');
  baris.push(' * (mis. `## [Unreleased]` di CHANGELOG yang langsung disusul `### Security`):');
  baris.push(' * bagian itu tetap ada dengan `teks: ""` karena dia batas blok rilis - tanpa');
  baris.push(' * dia "apa yang baru" menunjuk rilis yang salah. Pencarian melewatinya.');
  baris.push(' *');
  baris.push(` * Versi sumber: hash ${versi.hashSumber} · mtime terbaru ${versi.dihasilkan}`);
  baris.push(' * Hasilkan ulang: node scripts/gen-dokumen-bundel.mjs');
  baris.push(' * Periksa sinkron: node scripts/gen-dokumen-bundel.mjs --check');
  baris.push(' */');
  baris.push('');
  baris.push('/**');
  baris.push(' * Satu bagian dokumen:');
  baris.push(' * [berkas, judul, barisJudul (0 = tanpa judul), barisTeks, teks].');
  baris.push(' */');
  baris.push(
    'export type DokumenBagian = readonly [berkas: string, judul: string, barisJudul: number, barisTeks: number, teks: string];',
  );
  baris.push('');
  baris.push('/** Satu berkas dokumen: [berkas, ukuran byte, waktu ubah ISO, jumlah bagian, jumlah baris]. */');
  baris.push('export type DokumenBerkas = readonly [berkas: string, ukuran: number, ubah: string, bagian: number, baris: number];');
  baris.push('');
  baris.push('/** Cap bundel: dipakai untuk menjawab "bundel ini basi atau tidak". */');
  baris.push('export const DOKUMEN_VERSI = {');
  baris.push(`  dihasilkan: ${strs(versi.dihasilkan)},`);
  baris.push(`  hashSumber: ${strs(versi.hashSumber)},`);
  baris.push(`  jumlahBerkas: ${versi.jumlahBerkas},`);
  baris.push(`  jumlahBagian: ${versi.jumlahBagian},`);
  baris.push(`  totalByte: ${versi.totalByte},`);
  baris.push('} as const;');
  baris.push('');
  baris.push('export const DOKUMEN_BERKAS: readonly DokumenBerkas[] = [');
  for (const b of berkas) {
    baris.push(`  [${strs(b[0])}, ${b[1]}, ${strs(b[2])}, ${b[3]}, ${b[4]}],`);
  }
  baris.push('];');
  baris.push('');
  baris.push('export const DOKUMEN_BAGIAN: readonly DokumenBagian[] = [');
  for (const b of bagian) {
    baris.push(`  [${strs(b[0])}, ${strs(b[1])}, ${b[2]}, ${b[3]}, ${strs(b[4])}],`);
  }
  baris.push('];');
  baris.push('');
  return baris.join('\n');
}

const hasil = bangun();
const teks = tulis(hasil);

if (CHECK) {
  let lama = null;
  try {
    lama = readFileSync(KELUARAN, 'utf8');
  } catch {
    console.log(`BASI: ${KELUARAN} belum ada.`);
    process.exit(1);
  }
  if (lama === teks) {
    console.log(
      `SINKRON: ${hasil.versi.jumlahBerkas} berkas / ${hasil.versi.jumlahBagian} bagian / ` +
        `${Math.round(hasil.versi.totalByte / 1024)} KB (hash ${hasil.versi.hashSumber}).`,
    );
    process.exit(0);
  }
  console.log(
    `BASI: ${KELUARAN} tidak sama dengan hasil panen sekarang ` +
      `(${hasil.versi.jumlahBerkas} berkas / ${hasil.versi.jumlahBagian} bagian). ` +
      'Jalankan: node scripts/gen-dokumen-bundel.mjs',
  );
  process.exit(1);
}

writeFileSync(KELUARAN, teks);
console.log(
  `TULIS: src/lib/zephyrDokumenData.ts - ${hasil.versi.jumlahBerkas} berkas, ` +
    `${hasil.versi.jumlahBagian} bagian, ${Math.round(hasil.versi.totalByte / 1024)} KB teks, ` +
    `hash ${hasil.versi.hashSumber} (tulis ulang = ${Math.round(teks.length / 1024)} KB TS).`,
);
for (const b of hasil.berkas) {
  console.log(`  ${String(b[3]).padStart(4)} bagian  ${String(b[1]).padStart(7)} B  ${b[0]}`);
}
