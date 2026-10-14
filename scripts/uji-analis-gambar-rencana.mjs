#!/usr/bin/env node
/**
 * uji-analis-gambar-rencana.mjs — harness bukti "analisis gambar" (ZEPH-ANALIS-GAMBAR).
 *
 * Yang dibuktikan (semuanya dengan fungsi NYATA dari `src/lib/analisGambar.ts`,
 * diimpor langsung ke node - modul itu murni, tanpa DOM):
 *   1. jenis berkas yang didukung adalah allow-list tertutup (png/jpeg/webp/gif),
 *      dan mime yang DIDEKLARASIKAN harus cocok dengan byte-nya;
 *   2. batas ukuran per gambar & per pesan SAMA dengan yang dipakai `aiStore`
 *      (3.500.000 byte, 10 gambar) - dua langit-langit berbeda adalah cara
 *      sebuah gambar lolos panel lalu dibuang store;
 *   3. gambar raksasa DIPERKECIL (rencana langkah nyata) atau DITOLAK (GIF),
 *      tidak pernah dibuang diam-diam, dan tidak pernah DIBESARKAN;
 *   4. keluaran/jejak analisis tidak pernah membawa payload base64, dan tidak
 *      pernah membawa jalur absolut di luar repo tanpa penanda.
 *
 * Catatan jujur: nomor 4 (penanda jalur luar-repo) adalah BAGIAN RANCANGAN. Ia
 * belum ada di produk. Harness ini memakukan (a) blok bangun NYATA yang dipakai
 * rancangan itu - `sensorBase64` (analisGambar.ts) dan `normJalur`
 * (alurVerifikasi.ts) - dan (b) perilaku fungsi penanda sesuai spesifikasi, plus
 * membuktikan KENAPA penanda harus berjangkar ke akar repo: `normJalur` saja
 * salah mengklasifikasi `C:\...\docs\a.md` sebagai jalur dalam repo.
 *
 * Jalan: node scripts/uji-analis-gambar-rencana.mjs   (keluar 0 kalau semua lulus)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

const G = await import(pathToFileURL(join(AKAR, 'src', 'lib', 'analisGambar.ts')).href);
const V = await import(pathToFileURL(join(AKAR, 'src', 'lib', 'alurVerifikasi.ts')).href);

/* Konstanta yang HARUS cocok, dibaca dari sumbernya (bukan disalin tangan). */
const aiStoreSrc = baca('src/lib/aiStore.ts');
const clipboardSrc = baca('src/lib/clipboard.ts');
const angkaDari = (teks, nama) => {
  const m = teks.match(new RegExp(`${nama}\\s*=\\s*([0-9_]+)`));
  return m ? Number(m[1].replace(/_/g, '')) : NaN;
};
const IMAGE_MAX_BYTES_STORE = angkaDari(aiStoreSrc, 'IMAGE_MAX_BYTES');
const MAX_IMAGES_STORE = angkaDari(aiStoreSrc, 'MAX_IMAGES');

/* ---- pelaporan ---- */
let lulus = 0;
const gagal = [];
function cek(id, nama, kondisi, detail) {
  if (kondisi) {
    lulus++;
    console.log(`PASS  ${id.padEnd(4)} ${nama.padEnd(52)} ${detail}`);
  } else {
    gagal.push(`${id} ${nama}: ${detail}`);
    console.log(`FAIL  ${id.padEnd(4)} ${nama.padEnd(52)} ${detail}`);
  }
}

/* ---- byte gambar nyata (magic betul, dibaca oleh tebakMimeDariBase64) ---- */
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const GIF = Buffer.from('GIF89a', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'latin1')]);
/** PNG berukuran PERSIS `byte` byte, untuk menguji batas tepat di garis. */
function pngSebesar(byte) {
  const kepala = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b64(Buffer.concat([kepala, Buffer.alloc(Math.max(0, byte - kepala.length))]));
}

/* ---- rancangan: penanda jalur absolut di luar repo ---- */
const AKAR_REPO = AKAR.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
const PENANDA_LUAR = '<jalur-luar-repo>';
/**
 * Sapu tiap jalur absolut (drive `X:\` / `X:/` atau UNC `\\host`) dari teks
 * analisis. Jalur yang berada DI DALAM akar repo ditulis ulang jadi relatif
 * (tanpa penanda, karena memang milik pengguna); yang di luar ditandai.
 * Diasumsikan `akar` sudah ternormalisasi (`/` ke bawah).
 */
function sensorJalurLuar(teks, akar = AKAR_REPO) {
  return String(teks ?? '').replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'`<>|]*/g, (m) => {
    const n = m.replace(/\\/g, '/');
    const a = akar.toLowerCase().replace(/\/+$/, '');
    if (n.toLowerCase() === a) return '.';
    if (n.toLowerCase().startsWith(`${a}/`)) return n.slice(a.length + 1);
    return PENANDA_LUAR;
  });
}

console.log('UJI ANALIS GAMBAR (fungsi nyata dari src/lib/analisGambar.ts + alurVerifikasi.ts)');
console.log(
  `      konstanta: ANALIS_MAKS_BYTE=${G.ANALIS_MAKS_BYTE} ANALIS_MAKS_GAMBAR=${G.ANALIS_MAKS_GAMBAR} ANALIS_SISI_MAKS=${G.ANALIS_SISI_MAKS} | store: IMAGE_MAX_BYTES=${IMAGE_MAX_BYTES_STORE} MAX_IMAGES=${MAX_IMAGES_STORE}`,
);
console.log('');

/* ------------------------------------------------------------------ */
/* 1. Jenis berkas yang didukung                                       */
/* ------------------------------------------------------------------ */

{
  const harap = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const sama = G.MIME_DIIZINKAN.length === 4 && harap.every((m, i) => G.MIME_DIIZINKAN[i] === m);
  cek('G1', 'MIME_DIIZINKAN = allow-list tertutup 4 format', sama, `[${G.MIME_DIIZINKAN.join(', ')}]`);
}

{
  const kasus = [
    ['k.png', 'image/png', pngSebesar(64)],
    ['k.jpg', 'image/jpeg', b64(JPEG)],
    ['k.webp', 'image/webp', b64(WEBP)],
    ['k.gif', 'image/gif', b64(GIF)],
  ];
  const hasil = kasus.map(([nama, mime, base64]) => {
    const r = G.gambarDariBerkas({ nama, mime, base64 });
    return { nama, ok: r.ok, mime: r.ok ? r.nilai.mime : r.kode };
  });
  const semuaOk = hasil.every((h) => h.ok === true);
  cek('G2', '4 format nyata DITERIMA (mime cocok byte)', semuaOk, hasil.map((h) => `${h.nama}=${h.ok ? h.mime : h.mime}`).join(' '));
}

{
  const ditolak = [
    ['k.svg', 'image/svg+xml', b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'latin1'))],
    ['k.bmp', 'image/bmp', b64(Buffer.from('BM', 'latin1'))],
    ['k.tiff', 'image/tiff', b64(Buffer.from([0x49, 0x49, 0x2a, 0x00]))],
    ['k.pdf', 'application/pdf', b64(Buffer.from('%PDF-1.7', 'latin1'))],
    ['k.txt', 'text/plain', b64(Buffer.from('halo', 'latin1'))],
    ['k.png', 'image/png', b64(Buffer.from('bukan gambar samasekali', 'latin1'))],
  ];
  const hasil = ditolak.map(([nama, mime, base64]) => {
    const r = G.gambarDariBerkas({ nama, mime, base64 });
    return { nama, mime, ok: r.ok, kode: r.ok ? '-' : r.kode };
  });
  const semuaDitolak = hasil.every((h) => h.ok === false);
  cek(
    'G3',
    'format tak didukung / byte salah DITOLAK',
    semuaDitolak,
    hasil.map((h) => `${h.nama}(${h.mime})=${h.kode}`).join(' '),
  );
}

/* ------------------------------------------------------------------ */
/* 2. Batas ukuran & jumlah sama dengan aiStore                         */
/* ------------------------------------------------------------------ */

{
  const sama = G.ANALIS_MAKS_BYTE === 3_500_000 && G.ANALIS_MAKS_BYTE === IMAGE_MAX_BYTES_STORE;
  cek(
    'G4',
    'ANALIS_MAKS_BYTE == aiStore.IMAGE_MAX_BYTES',
    sama,
    `panel=${G.ANALIS_MAKS_BYTE}, store=${IMAGE_MAX_BYTES_STORE} (sumber aiStore.ts)`,
  );
}

{
  const periksa = G.periksaJumlah(Array.from({ length: 11 }, (_, i) => ({ mime: 'image/png', byte: 1, sumber: 'berkas' })));
  const batasLolos = G.periksaJumlah(Array.from({ length: 10 }, (_, i) => ({ mime: 'image/png', byte: 1, sumber: 'berkas' })));
  const sama = G.ANALIS_MAKS_GAMBAR === 10 && G.ANALIS_MAKS_GAMBAR === MAX_IMAGES_STORE;
  cek(
    'G5',
    'ANALIS_MAKS_GAMBAR == aiStore.MAX_IMAGES & tolak ke-11',
    sama && periksa.ok === false && batasLolos.ok === true,
    `panel=${G.ANALIS_MAKS_GAMBAR}, store=${MAX_IMAGES_STORE}; 11->${periksa.ok ? 'ok' : periksa.kode}, 10->${batasLolos.ok ? 'ok' : batasLolos.kode}`,
  );
}

{
  const adaDiClipboard = /1600/.test(clipboardSrc);
  cek(
    'G6',
    'ANALIS_SISI_MAKS == 1600 (sisi paling panjang)',
    G.ANALIS_SISI_MAKS === 1600 && adaDiClipboard,
    `ANALIS_SISI_MAKS=${G.ANALIS_SISI_MAKS}; literal 1600 ada di clipboard.ts=${adaDiClipboard}`,
  );
}

/* ------------------------------------------------------------------ */
/* 3. Perilaku di & di atas garis batas                                 */
/* ------------------------------------------------------------------ */

{
  const tepat = G.gambarDariBerkas({ nama: 'k.png', mime: 'image/png', base64: pngSebesar(3_500_000) });
  const lewat = G.gambarDariBerkas({ nama: 'k.png', mime: 'image/png', base64: pngSebesar(3_500_001) });
  const okTepat = tepat.ok === true && tepat.nilai.byte === 3_500_000;
  const ditolak = lewat.ok === false && lewat.kode === 'terlalu_besar';
  const pesanNyata = ditolak && /3\.500\.001/.test(lewat.pesan) && /3\.500\.000/.test(lewat.pesan);
  cek(
    'G7',
    'tepat di batas LOLOS, +1 byte DITOLAK (pesan berangka)',
    okTepat && ditolak && pesanNyata,
    `tepat(3.500.000)=${tepat.ok ? 'ok' : tepat.kode}; +1=(${lewat.ok ? 'ok' : lewat.kode}) pesan-memuat-angka=${pesanNyata}`,
  );
}

{
  const raksasa = G.rencanaPerkecil({ mime: 'image/png', byte: 12_000_000, lebar: 8000, tinggi: 6000 });
  const takMembesarkan = raksasa.langkah.every((l) => l.skala > 0 && l.skala <= raksasa.skalaAwal && raksasa.skalaAwal <= 1);
  cek(
    'G8',
    'gambar raksasa DIPERKECIL, tak pernah dibesarkan',
    raksasa.aksi === 'kecilkan' && raksasa.skalaAwal === Math.min(1, 1600 / 8000) && raksasa.langkah.length === 4 && takMembesarkan,
    `aksi=${raksasa.aksi} skalaAwal=${raksasa.skalaAwal} langkah=[${raksasa.langkah.map((l) => `${l.skala}/${l.kualitas}`).join(', ')}]`,
  );
}

{
  const gif = G.rencanaPerkecil({ mime: 'image/gif', byte: 9_000_000, lebar: 4000, tinggi: 4000 });
  cek(
    'G9',
    'GIF raksasa DITOLAK (tak bisa diperkecil tanpa merusak animasi)',
    gif.aksi === 'tolak' && gif.kode === 'terlalu_besar' && gif.skalaAwal === 1,
    `aksi=${gif.aksi} kode=${gif.kode} skalaAwal=${gif.skalaAwal}`,
  );
}

{
  const tanpaDim = G.rencanaPerkecil({ mime: 'image/png', byte: 5_000_000 });
  cek(
    'G10',
    'dimensi tak diketahui -> skalaAwal=1 (tidak dikarang)',
    tanpaDim.aksi === 'kecilkan' && tanpaDim.skalaAwal === 1 && tanpaDim.langkah.every((l) => l.skala <= 1),
    `aksi=${tanpaDim.aksi} skalaAwal=${tanpaDim.skalaAwal}`,
  );
}

/* ------------------------------------------------------------------ */
/* 4. Keluaran analisis: jalur luar-repo & payload                      */
/* ------------------------------------------------------------------ */

{
  const dalamRepo = 'D:\\Zephyr\\src\\lib\\analisGambar.ts';
  const luarRepo = 'C:\\Users\\Zyrex\\rahasia\\kunci-privat.png';
  const teks = `OCR: "lihat ${luarRepo} lalu ${dalamRepo}"`;
  const bersih = sensorJalurLuar(teks);
  const luarDitandai = bersih.includes(PENANDA_LUAR) && !bersih.includes('Users\\Zyrex');
  const dalamRelatif = bersih.includes('src/lib/analisGambar.ts') && !/[A-Za-z]:\\/.test(bersih);
  cek(
    'G11',
    'keluaran analisis: jalur luar repo BERPENANDA, jalur repo relatif',
    luarDitandai && dalamRelatif,
    `masuk -> "${bersih}"`,
  );
}

{
  /* Kenapa penanda harus berjangkar di akar repo: `normJalur` nyata mencari
     POTONGAN 'docs/' di mana saja, jadi jalur LUAR repo yang kebetulan memuat
     'docs/' diklaim repo-relatif - persis kesalahan yang penanda ini hindari. */
  const jebakan = 'C:\\Users\\Zyrex\\docs\\catatan.md';
  const norm = V.normJalur(jebakan);
  const normSalahKlasifikasi = norm === 'docs/catatan.md' && !/^[A-Za-z]:/.test(norm);
  const scrubbed = sensorJalurLuar(jebakan);
  const penandaBenar = scrubbed === PENANDA_LUAR;
  /* Payload base64 di teks analisis wajib disapu oleh fungsi NYATA. */
  const bocor = `lampiran: data:image/png;base64,${'A'.repeat(80)}`;
  const disapu = G.sensorBase64(bocor);
  const payloadDisapu = disapu.includes('<gambar-disenyapkan>') && !disapu.includes('A'.repeat(40));
  cek(
    'G12',
    'scrubber tak tertipu substring; sensorBase64 menyapu payload',
    normSalahKlasifikasi && penandaBenar && payloadDisapu,
    `normJalur("${jebakan}")="${norm}" (salah klasifikasi=${normSalahKlasifikasi}); scrubber="${scrubbed}"; payload disapu=${payloadDisapu}`,
  );
}

/* ------------------------------------------------------------------ */
/* ringkasan                                                           */
/* ------------------------------------------------------------------ */
console.log('');
console.log(`ringkasan: ${lulus} lulus, ${gagal.length} gagal (${lulus + gagal.length} pemeriksaan)`);
if (gagal.length) {
  for (const g of gagal) console.log(`  - ${g}`);
  process.exit(1);
}
console.log('analisis gambar: format, batas, perkecil, dan keamanan keluaran terbukti dengan fungsi nyata');
process.exit(0);
