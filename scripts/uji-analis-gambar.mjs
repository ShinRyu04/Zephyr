/**
 * uji-analis-gambar.mjs — bukti jalur gambar (vision) untuk item ZEPH-ANALIS-GAMBAR.
 *
 * Apa yang dibuktikan (semua offline, tanpa jaringan sama sekali):
 *   1. gambar tiruan 1x1 PNG dibuat SENDIRI di TMPDIR dan divalidasi (tanda PNG,
 *      IHDR 1x1, CRC tiap chunk, IDAT bisa di-inflate) — fixture-nya nyata,
 *      bukan base64 yang dipercaya begitu saja;
 *   2. mime: png/jpeg/webp/gif diterima, yang lain ditolak dengan pesan jelas;
 *      mime yang tidak cocok dengan BYTE-nya ditolak (teks bernama .png);
 *   3. batas ukuran: angka batas diuji di kedua sisi (tepat batas lolos,
 *      lebih 1 byte ditolak), dan penghitungan byte base64 diuji terhadap
 *      Buffer untuk 300 ukuran;
 *   4. pengubahan ke bentuk provider: data URL (panjang + awalan) dan bentuk
 *      bagian per provider (openai/anthropic/gemini) sama persis dengan yang
 *      dibangun adapter Rust;
 *   5. terlalu besar -> diperkecil lewat tangga murni (planner) dengan adapter
 *      palsu, atau ditolak dengan pesan yang menyebut angka nyatanya;
 *   6. log: tidak ada satu pun baris log / pesan galat yang memuat payload.
 *
 * Jaringan diblokir SEBELUM modul diimpor: fetch/XHR/WebSocket diganti dengan
 * penghitung yang melempar. Kalau ada satu saja jalur jaringan di dalam modul,
 * harness ini mati dengan error, bukan lulus diam-diam.
 *
 * Jalan: node scripts/uji-analis-gambar.mjs      (keluar 0 kalau semua lulus)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = process.env.TMPDIR || os.tmpdir();
mkdirSync(TMP, { recursive: true });

/* ------------------------------------------------------------------ *
 * pagar jaringan (dipasang sebelum import)
 * ------------------------------------------------------------------ */
const jaringan = { fetch: 0, xhr: 0, ws: 0 };
globalThis.fetch = () => {
  jaringan.fetch++;
  throw new Error('fetch dilarang: jalur gambar harus murni dan tanpa jaringan');
};
globalThis.XMLHttpRequest = class {
  constructor() {
    jaringan.xhr++;
    throw new Error('XMLHttpRequest dilarang di jalur gambar');
  }
};
globalThis.WebSocket = class {
  constructor() {
    jaringan.ws++;
    throw new Error('WebSocket dilarang di jalur gambar');
  }
};

const G = await import(pathToFileURL(path.join(AKAR, 'src', 'lib', 'analisGambar.ts')).href);

/* ------------------------------------------------------------------ *
 * pelaporan
 * ------------------------------------------------------------------ */
let lulus = 0;
const gagal = [];
const pesanYangDilihat = [];
function cek(id, nama, kondisi, detail) {
  if (kondisi) {
    lulus++;
    console.log(`PASS  ${id.padEnd(4)} ${nama.padEnd(46)} ${detail}`);
  } else {
    gagal.push(`${id} ${nama}: ${detail}`);
    console.log(`FAIL  ${id.padEnd(4)} ${nama.padEnd(46)} ${detail}`);
  }
}
const ADA_BASE64 = /[A-Za-z0-9+/]{32,}/;
function catatPesan(hasil) {
  if (hasil && hasil.ok === false) pesanYangDilihat.push({ kode: hasil.kode, pesan: hasil.pesan });
  return hasil;
}

/* ------------------------------------------------------------------ *
 * fixture: PNG 1x1 asli, dibuat lalu divalidasi
 * ------------------------------------------------------------------ */
function chunkPng(tipe, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(tipe, 4, 'latin1');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipe, 'latin1'), data])) >>> 0, 8 + data.length);
  return buf;
}

function buatPng1x1(rgba = [255, 0, 0, 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(Buffer.from([0, ...rgba])); // filter byte 0 + 1 piksel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    chunkPng('IDAT', idat),
    chunkPng('IEND', Buffer.alloc(0)),
  ]);
}

const PIXEL = [255, 0, 0, 255];
const png = buatPng1x1(PIXEL);
const berkasPng = path.join(TMP, 'analis-gambar-1x1.png');
writeFileSync(berkasPng, png);
const pngDibaca = readFileSync(berkasPng);

console.log('UJI ANALIS GAMBAR (jalur vision Zephyr, offline)');
console.log(
  `      fixture: ${berkasPng} (${pngDibaca.length} byte), batas ${G.fmtByte(G.ANALIS_MAKS_BYTE)}/gambar, maks ${G.ANALIS_MAKS_GAMBAR} gambar`,
);

/* --- F: fixture benar-benar PNG yang sah --- */
{
  const sig = pngDibaca.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  let off = 8;
  const chunk = [];
  let crcSemua = true;
  let lebar = 0;
  let tinggi = 0;
  let idat = null;
  while (off < pngDibaca.length) {
    const len = pngDibaca.readUInt32BE(off);
    const tipe = pngDibaca.subarray(off + 4, off + 8).toString('latin1');
    const data = pngDibaca.subarray(off + 8, off + 8 + len);
    const crc = pngDibaca.readUInt32BE(off + 8 + len);
    const hitung = crc32(Buffer.concat([pngDibaca.subarray(off + 4, off + 8), data])) >>> 0;
    if (crc !== hitung) crcSemua = false;
    if (tipe === 'IHDR') {
      lebar = data.readUInt32BE(0);
      tinggi = data.readUInt32BE(4);
    }
    if (tipe === 'IDAT') idat = Buffer.from(data);
    chunk.push(tipe);
    off += 12 + len;
  }
  const mentah = idat ? inflateSync(idat) : Buffer.alloc(0);
  cek('F1', 'fixture PNG 1x1 sah (tanda+CRC+IDAT)', sig && crcSemua && chunk.join('/') === 'IHDR/IDAT/IEND', `${pngDibaca.length} byte, ${chunk.join('+')}, CRC semua cocok=${crcSemua}`);
  cek('F2', 'IHDR 1x1 dan IDAT ter-inflate', lebar === 1 && tinggi === 1 && mentah.length === 5, `${lebar}x${tinggi}, scanline ${mentah.length} byte (1 filter + 4 RGBA)`);
  cek('F3', 'modul menebak mime dari byte fixture', G.tebakMimeDariBase64(pngDibaca.toString('base64')) === 'image/png', `tebak=${G.tebakMimeDariBase64(pngDibaca.toString('base64'))}`);

  /*
   * F4/F5: awalan base64 di modul dipaku ke byte magic yang dihitung DI SINI,
   * bukan dipercaya. Juga diuji bentuk yang paling mudah membuat deteksi gagal:
   * byte ke-9 bukan 0x00 (chunk PNG pertama yang panjangnya bukan 13 byte),
   * dan digit versi GIF. Keduanya harus tetap dikenali.
   */
  const uji = [
    ['png', pngDibaca.subarray(0, 8), 'image/png'], // 89 50 4E 47 0D 0A 1A 0A
    ['jpeg', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
    ['gif', Buffer.from('GIF', 'latin1'), 'image/gif'],
  ];
  let awalanSalah = 0;
  const rincian = [];
  for (const [label, magic, mime] of uji) {
    const berbuntut = Buffer.concat([magic, Buffer.alloc(40, 0x41)]);
    const dapat = G.tebakMimeDariBase64(berbuntut.toString('base64'));
    if (dapat !== mime) awalanSalah++;
    rincian.push(`${label}=${dapat}`);
  }
  cek('F4', 'awalan cocok dengan byte magic (ekor 0x41)', awalanSalah === 0, `${uji.length} magic dihitung dari byte, ${awalanSalah} salah: ${rincian.join(' ')}`);
  const pngEkori = Buffer.concat([pngDibaca.subarray(0, 8), Buffer.alloc(12, 0x41), pngDibaca.subarray(8)]);
  const gif87Ekori = Buffer.concat([Buffer.from('GIF87a', 'latin1'), Buffer.alloc(20, 0x42)]);
  const gif89Ekori = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(20, 0x42)]);
  cek('F5', 'byte ke-9 bukan 0x00 & digit versi GIF tetap dikenali', G.tebakMimeDariBase64(pngEkori.toString('base64')) === 'image/png' && G.tebakMimeDariBase64(gif87Ekori.toString('base64')) === 'image/gif' && G.tebakMimeDariBase64(gif89Ekori.toString('base64')) === 'image/gif', `png(byte9=0x41)=${G.tebakMimeDariBase64(pngEkori.toString('base64'))}, gif87a=${G.tebakMimeDariBase64(gif87Ekori.toString('base64'))}, gif89a=${G.tebakMimeDariBase64(gif89Ekori.toString('base64'))}`);
  cek('F6', 'pemisah ribuan tanpa locale', G.pemisah(3_500_001) === '3.500.001' && G.pemisah(70) === '70' && G.pemisah(1_600) === '1.600', `${G.pemisah(3_500_001)} / ${G.pemisah(70)} / ${G.pemisah(1_600)}`);
}

/* --- K: konstanta & daftar putih --- */
{
  cek('K1', 'daftar putih mime persis 4 format', G.MIME_DIIZINKAN.join(',') === 'image/png,image/jpeg,image/webp,image/gif', G.MIME_DIIZINKAN.join(' '));
  cek('K2', 'angka batas ukuran', G.ANALIS_MAKS_BYTE === 3_500_000 && G.ANALIS_MAKS_GAMBAR === 10 && G.ANALIS_SISI_MAKS === 1600, `${G.ANALIS_MAKS_BYTE} byte/gambar, ${G.ANALIS_MAKS_GAMBAR}/pesan, sisi<=${G.ANALIS_SISI_MAKS}px`);
  cek('K3', 'tangga perkecil (kualitas x skala)', G.KUALITAS_TANGGA.join('/') === '0.85/0.7/0.7/0.6' && G.SKALA_TANGGA.join('/') === '1/1/0.6/0.35', `${G.KUALITAS_TANGGA.join('/')} dan ${G.SKALA_TANGGA.join('/')}`);
}

/* ------------------------------------------------------------------ *
 * C: tiga jalur masuk, semua mime yang diizinkan
 * ------------------------------------------------------------------ */
const b64 = pngDibaca.toString('base64');
const dataUrlPng = `data:image/png;base64,${b64}`;

const dariTempel = G.gambarDariTempel(dataUrlPng);
cek('C1', 'jalur TEMPEL (data URL clipboard)', dariTempel.ok === true, dariTempel.ok ? `${dariTempel.nilai.mime} ${dariTempel.nilai.byte} byte sumber=${dariTempel.nilai.sumber}` : dariTempel.pesan);

const dariBerkas = G.gambarDariBerkas({ nama: 'tangkapan.png', base64: b64 });
cek('C2', 'jalur BERKAS (nama + base64)', dariBerkas.ok === true && dariBerkas.nilai.sumber === 'berkas' && dariBerkas.nilai.nama === 'tangkapan.png', dariBerkas.ok ? `${dariBerkas.nilai.byte} byte nama=${dariBerkas.nilai.nama}` : dariBerkas.pesan);

const dariLampiran = G.gambarDariLampiran({ nama: 'desain.png', dataUrl: dataUrlPng });
cek('C3', 'jalur LAMPIRAN (nama + data URL)', dariLampiran.ok === true && dariLampiran.nilai.sumber === 'lampiran', dariLampiran.ok ? `${dariLampiran.nilai.byte} byte sumber=${dariLampiran.nilai.sumber}` : dariLampiran.pesan);

cek('C4', 'byte sesuai isi berkas', dariTempel.ok && dariTempel.nilai.byte === pngDibaca.length, dariTempel.ok ? `${dariTempel.nilai.byte} byte == ukuran berkas ${pngDibaca.length}` : 'gagal terima');
cek('C5', 'data URL dibangun ulang & kanonik', dariTempel.ok && dariTempel.nilai.dataUrl === dataUrlPng, dariTempel.ok ? `panjang ${dariTempel.nilai.dataUrl.length} char, awalan "${dariTempel.nilai.dataUrl.slice(0, 24)}..."` : 'gagal');

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 0x11)]);
const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(20, 0x22)]);
const gif89 = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(30, 0x33)]);
const gif87 = Buffer.concat([Buffer.from('GIF87a', 'latin1'), Buffer.alloc(30, 0x34)]);

const cekMime = (label, buf, dikirimMime, mimeDiharap, id) => {
  const h = catatPesan(G.gambarDariBerkas({ nama: 'x', mime: dikirimMime, base64: buf.toString('base64') }));
  cek(id, `mime diterima: ${label}`, h.ok === true && h.nilai.mime === mimeDiharap, h.ok ? `${dikirimMime} -> ${h.nilai.mime} ${h.nilai.byte} byte` : `${h.kode}: ${h.pesan}`);
};
cekMime('jpeg', jpeg, 'image/jpeg', 'image/jpeg', 'C6');
cekMime('jpg (alias dinormalkan ke jpeg)', jpeg, 'image/jpg', 'image/jpeg', 'C7');
cekMime('webp (magic RIFF..WEBP)', webp, 'image/webp', 'image/webp', 'C8');
cekMime('gif89a', gif89, 'image/gif', 'image/gif', 'C9');
cekMime('gif87a', gif87, 'image/gif', 'image/gif', 'C10');
cekMime('png (diagnostik versi byte)', png, 'image/PNG', 'image/png', 'C11');

/* ------------------------------------------------------------------ *
 * B: penghitungan byte base64
 * ------------------------------------------------------------------ */
{
  let salah = 0;
  let diuji = 0;
  for (let n = 1; n <= 300; n++) {
    const buf = Buffer.alloc(n, 0x5a);
    const teks = buf.toString('base64');
    if (G.hitungByteBase64(teks) !== buf.length) salah++;
    if (G.hitungByteBase64(teks.replace(/=+$/, '')) !== buf.length) salah++; // tanpa padding
    if (G.hitungByteBase64(teks.replace(/(.{7})/g, '$1\n')) !== buf.length) salah++; // ada spasi/baris
    diuji += 3;
  }
  const besar = Buffer.alloc(2_500_000, 0x41);
  const besarOk = G.hitungByteBase64(besar.toString('base64')) === besar.length;
  cek('B1', 'hitungByteBase64 == Buffer (300 ukuran x 3 bentuk)', salah === 0 && besarOk, `${diuji + 1} kasus diperiksa, ${salah} salah (termasuk 2,5 MB)`);
  cek('B2', 'kandidat kosong ditolak', catatPesan(G.gambarDariTempel('')).kode === 'kosong', 'kode=kosong');
}

/* ------------------------------------------------------------------ *
 * R: penolakan — pesannya harus jelas dan tidak memuat payload
 * ------------------------------------------------------------------ */
const tolakMime = [
  ['svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'latin1')],
  ['bmp', 'image/bmp', Buffer.concat([Buffer.from('BM', 'latin1'), Buffer.alloc(30, 0x01)])],
  ['tiff', 'image/tiff', Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), Buffer.alloc(20, 0x02)])],
  ['pdf', 'application/pdf', Buffer.from('%PDF-1.7\n', 'latin1')],
  ['teks', 'text/plain', Buffer.from('catatan biasa', 'latin1')],
  ['oktet', 'application/octet-stream', Buffer.alloc(32, 0x03)],
];
for (const [label, mime, buf] of tolakMime) {
  const h = catatPesan(G.gambarDariBerkas({ nama: `x.${label}`, mime, base64: buf.toString('base64') }));
  const sebut = typeof h.pesan === 'string' && G.MIME_DIIZINKAN.every((m) => h.pesan.includes(m));
  cek(`R${tolakMime.findIndex((x) => x[0] === label) + 1}`, `mime ditolak: ${label}`, h.kode === 'mime_ditolak' && sebut, `${h.kode}: ${h.pesan}`);
}

const rusak = [
  ['tanpa data: prefix', 'image/png;base64,AAAA'],
  ['tanpa ;base64', 'data:image/png,AAAA'],
  ['payload kosong', 'data:image/png;base64,'],
  ['bukan base64', 'data:image/png;base64,???!!!'],
  ['bukan data URL sama sekali', 'https://contoh/gambar.png'],
];
for (const [label, isi] of rusak) {
  const h = catatPesan(G.gambarDariTempel(isi));
  cek('R7', `data URL rusak ditolak: ${label}`, h.ok === false && (h.kode === 'data_url_rusak' || h.kode === 'kosong'), `${h.kode}: ${h.pesan}`);
}

const cocokPalsu = catatPesan(G.gambarDariBerkas({ nama: 'palsu.jpg', mime: 'image/jpeg', base64: b64 }));
cek('R8', 'mime tidak cocok dengan byte ditolak', cocokPalsu.kode === 'mime_tidak_cocok', `${cocokPalsu.kode}: ${cocokPalsu.pesan}`);

const bukanGambar = catatPesan(G.gambarDariBerkas({ nama: 'catatan.png', mime: 'image/png', base64: Buffer.from('ini teks, bukan gambar sama sekali', 'latin1').toString('base64') }));
cek('R9', 'teks bernama .png ditolak', bukanGambar.kode === 'mime_tidak_cocok', `${bukanGambar.kode}: ${bukanGambar.pesan}`);

/* batas ukuran: tepat batas lolos, lebih 1 byte ditolak */
function gambarSeukuran(ukuran, mime = 'image/png') {
  /*
   * Kepala yang dipakai adalah gambar SUNGGUHAN (PNG 1x1 yang baru divalidasi,
   * atau kepala jpeg/gif yang sah), bukan 8 byte magic lalu sampah. Kalau
   * fixture-nya palsu, uji batas ukuran bisa gagal karena penolakan mime dan
   * terbaca seolah-olah batasnya yang salah.
   */
  const kepala = mime === 'image/png' ? png : mime === 'image/gif' ? gif89 : jpeg;
  if (ukuran < kepala.length) throw new Error(`ukuran fixture ${ukuran} lebih kecil dari kepala ${kepala.length}`);
  return Buffer.concat([kepala, Buffer.alloc(ukuran - kepala.length, 0x41)]);
}
{
  const gemuk = gambarSeukuran(G.ANALIS_MAKS_BYTE + 1);
  cek('R0', 'kepala fixture batas ukuran tetap gambar sah', gemuk.length === G.ANALIS_MAKS_BYTE + 1 && G.tebakMimeDariBase64(gemuk.toString('base64')) === 'image/png' && gemuk.subarray(0, 8).equals(png.subarray(0, 8)), `${gemuk.length} byte, kepala ${gemuk.subarray(0, 4).toString('hex')} (Png 1x1 asli)`);
}
const tepat = catatPesan(G.gambarDariBerkas({ nama: 'tepat.png', base64: gambarSeukuran(G.ANALIS_MAKS_BYTE).toString('base64') }));
cek('R10', 'tepat di batas ukuran diterima', tepat.ok === true && tepat.nilai.byte === G.ANALIS_MAKS_BYTE, tepat.ok ? `${tepat.nilai.byte} byte == batas ${G.ANALIS_MAKS_BYTE}` : `${tepat.kode}: ${tepat.pesan}`);

const lebih = catatPesan(G.gambarDariBerkas({ nama: 'besar.png', base64: gambarSeukuran(G.ANALIS_MAKS_BYTE + 1).toString('base64') }));
/* Pesan harus memuat angka NYATA (3.500.001 vs batas 3.500.000), bukan cuma "3,5 MB". */
const lebihSebutAngka =
  lebih.ok === false &&
  typeof lebih.pesan === 'string' &&
  lebih.pesan.includes(G.pemisah(G.ANALIS_MAKS_BYTE + 1)) &&
  lebih.pesan.includes(G.pemisah(G.ANALIS_MAKS_BYTE)) &&
  lebih.pesan.includes(G.fmtByte(G.ANALIS_MAKS_BYTE + 1));
cek('R11', 'lebih 1 byte ditolak, pesan menyebut angka', lebih.ok === false && lebih.kode === 'terlalu_besar' && lebihSebutAngka, `${lebih.kode}: ${lebih.pesan}`);

const gifBesar = catatPesan(G.gambarDariBerkas({ nama: 'animasi.gif', mime: 'image/gif', base64: gambarSeukuran(G.ANALIS_MAKS_BYTE + 1, 'image/gif').toString('base64') }));
cek('R12', 'GIF besar ditolak dengan alasan animasi', gifBesar.kode === 'terlalu_besar' && gifBesar.pesan.includes('animation'), `${gifBesar.kode}: ${gifBesar.pesan}`);

const sepuluh = Array.from({ length: G.ANALIS_MAKS_GAMBAR }, () => dariTempel.nilai);
const sebelas = Array.from({ length: G.ANALIS_MAKS_GAMBAR + 1 }, () => dariTempel.nilai);
const jumlah10 = G.periksaJumlah(sepuluh);
const jumlah11 = catatPesan(G.periksaJumlah(sebelas));
cek('R13', 'jumlah gambar: 10 lolos, 11 ditolak', jumlah10.ok === true && jumlah11.kode === 'terlalu_banyak' && jumlah11.pesan.includes('11'), `${jumlah11.kode}: ${jumlah11.pesan}`);

/* ------------------------------------------------------------------ *
 * S: perencana perkecil (murni, tanpa kanvas)
 * ------------------------------------------------------------------ */
{
  const kecil = G.rencanaPerkecil({ mime: 'image/jpeg', byte: 200_000, lebar: 800, tinggi: 600 });
  cek('S1', 'gambar kecil: tanpa langkah', kecil.aksi === 'tanpa' && kecil.langkah.length === 0, `aksi=${kecil.aksi}, langkah=${kecil.langkah.length}`);

  const besar = G.rencanaPerkecil({ mime: 'image/jpeg', byte: 9_000_000, lebar: 4000, tinggi: 3000 });
  const skala = besar.langkah.map((l) => `${l.skala}/${l.kualitas}`).join(' ');
  cek('S2', 'jpeg 4000x3000 9 MB: 4 langkah, skala 1600/4000', besar.aksi === 'kecilkan' && besar.skalaAwal === 0.4 && besar.langkah.length === 4 && skala === '0.4/0.85 0.4/0.7 0.24/0.7 0.14/0.6', `skalaAwal=${besar.skalaAwal} langkah: ${skala}`);

  const tanpaDim = G.rencanaPerkecil({ mime: 'image/png', byte: 5_000_000 });
  const skalaTanpaDim = tanpaDim.langkah.map((l) => l.skala).join('/');
  cek('S3', 'dimensi tak diketahui: tidak mengarang skala', tanpaDim.skalaAwal === 1 && skalaTanpaDim === '1/1/0.6/0.35', `skala: ${skalaTanpaDim}`);

  const gif = G.rencanaPerkecil({ mime: 'image/gif', byte: 5_000_000, lebar: 500, tinggi: 400 });
  cek('S4', 'gif besar: ditolak, bukan dikecilkan', gif.aksi === 'tolak' && gif.langkah.length === 0 && gif.kode === 'terlalu_besar', `${gif.kode}: ${gif.pesan}`);

  const opsiKecil = G.rencanaPerkecil({ mime: 'image/jpeg', byte: 200_000, lebar: 4000, tinggi: 3000 }, { maksByte: 100_000 });
  cek('S5', 'batas bisa diubah untuk uji negatif', opsiKecil.aksi === 'kecilkan' && opsiKecil.langkah.length === 4, `batas 100000 -> aksi=${opsiKecil.aksi}, langkah=${opsiKecil.langkah.length}`);
}

/* ------------------------------------------------------------------ *
 * P: eksekusi tangga dengan adapter palsu (tanpa kanvas, tanpa jaringan)
 * ------------------------------------------------------------------ */
function adaptorPalsu({ faktor, pesan }) {
  const jejak = [];
  return {
    jejak,
    ubah: async (dataUrl, langkah) => {
      jejak.push(langkah);
      const m = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      const asli = Buffer.from(m[2], 'base64');
      const kepala = asli.subarray(0, 8);
      const badan = Buffer.alloc(Math.max(1, Math.floor(asli.length * faktor)), 0x41);
      const baru = Buffer.concat([kepala, badan]);
      if (pesan) pesan.push(`${langkah.skala}/${langkah.kualitas}`);
      return {
        dataUrl: `data:${m[1]};base64,${baru.toString('base64')}`,
        lebar: Math.round(4000 * langkah.skala),
        tinggi: Math.round(3000 * langkah.skala),
      };
    },
  };
}

{
  const mentah = G.siapkanGambar(
    { sumber: 'berkas', nama: 'foto.jpg', dataUrl: `data:image/jpeg;base64,${gambarSeukuran(5_000_000, 'image/jpeg').toString('base64')}`, lebar: 4000, tinggi: 3000 },
    { maksByte: Number.POSITIVE_INFINITY },
  );
  const adaptor = adaptorPalsu({ faktor: 0.3 });
  const hasil = await G.perkecilGambar(mentah.nilai, adaptor);
  cek('P1', 'perkecil berhasil pada percobaan pertama', hasil.ok === true && adaptor.jejak.length === 1 && hasil.nilai.byte <= G.ANALIS_MAKS_BYTE, hasil.ok ? `${hasil.nilai.byte} byte setelah ${adaptor.jejak.length} percobaan (${G.fmtByte(hasil.nilai.byte)})` : hasil.pesan);
  cek('P2', 'hasil perkecil tetap gambar valid & mime terjaga', hasil.ok && hasil.nilai.mime === 'image/jpeg' && hasil.nilai.dataUrl.startsWith('data:image/jpeg;base64,') && G.hitungByteBase64(hasil.nilai.base64) === hasil.nilai.byte, hasil.ok ? `${hasil.nilai.dataUrl.slice(0, 24)}..., ${hasil.nilai.byte} byte konsisten` : 'gagal');
}

{
  const mentah = G.siapkanGambar(
    { sumber: 'berkas', dataUrl: `data:image/jpeg;base64,${gambarSeukuran(5_000_000, 'image/jpeg').toString('base64')}` },
    { maksByte: Number.POSITIVE_INFINITY },
  );
  const adaptor = adaptorPalsu({ faktor: 0.99 }); // hampir tidak mengecil
  const hasil = await G.perkecilGambar(mentah.nilai, adaptor);
  const jejak = adaptor.jejak.map((l) => `${l.skala}/${l.kualitas}`).join(' ');
  cek('P3', 'dikecilkan tapi tetap besar: ditolak setelah 4 percobaan', hasil.ok === false && hasil.kode === 'terlalu_besar' && adaptor.jejak.length === 4, `${hasil.ok ? 'ok' : hasil.kode}: ${hasil.pesan}`);
  cek('P4', 'pesan penolakan menyebut jumlah percobaan', typeof hasil.pesan === 'string' && hasil.pesan.includes('4 resize attempts'), `jejak: ${jejak}`);
}

{
  const gede = { sumber: 'tempel', dataUrl: `data:image/png;base64,${gambarSeukuran(G.ANALIS_MAKS_BYTE + 500_000).toString('base64')}` };
  const tanpaAdaptor = catatPesan(await G.terimaGambar(gede, null));
  cek('P5', 'tanpa adapter: terlalu besar ditolak (bukan hilang diam-diam)', tanpaAdaptor.ok === false && tanpaAdaptor.kode === 'terlalu_besar', `${tanpaAdaptor.kode}: ${tanpaAdaptor.pesan}`);

  const adaptor = adaptorPalsu({ faktor: 0.4 });
  const denganAdaptor = catatPesan(await G.terimaGambar({ ...gede, nama: 'layar.png' }, adaptor));
  cek('P6', 'dengan adapter: perkecil lalu lolos', denganAdaptor.ok === true && adaptor.jejak.length === 1, denganAdaptor.ok ? `${denganAdaptor.nilai.byte} byte, ${adaptor.jejak.length} percobaan, sumber=${denganAdaptor.nilai.sumber}, nama=${denganAdaptor.nilai.nama}` : denganAdaptor.pesan);

  const adaptorDiam = adaptorPalsu({ faktor: 0.4 });
  const sudahKecil = await G.terimaGambar({ sumber: 'tempel', dataUrl: dataUrlPng }, adaptorDiam);
  cek('P7', 'gambar yang sudah kecil tidak menyentuh adapter', sudahKecil.ok === true && adaptorDiam.jejak.length === 0, `percobaan=${adaptorDiam.jejak.length}, ${sudahKecil.ok ? sudahKecil.nilai.byte + ' byte' : ''}`);
}

/* ------------------------------------------------------------------ *
 * M: bentuk yang dikirim ke provider
 * ------------------------------------------------------------------ */
{
  const g = dariTempel.nilai;
  const bagian = G.kontenOpenAI('lihat ini', [g]);
  const diharapOpenAI = [
    { type: 'text', text: 'lihat ini' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
  ];
  cek('M1', 'konten OpenAI: teks lalu image_url berisi data URL', JSON.stringify(bagian) === JSON.stringify(diharapOpenAI), `${bagian.length} bagian, url panjang ${bagian[1].image_url.url.length} char, awalan "${bagian[1].image_url.url.slice(0, 20)}"`);

  const blok = G.blokAnthropic(g);
  const diharapAnthro = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } };
  cek('M2', 'blok Anthropic: source base64 + media_type', JSON.stringify(blok) === JSON.stringify(diharapAnthro), `media_type=${blok.source.media_type}, data ${blok.source.data.length} char`);

  const part = G.partGemini(g);
  const diharapGemini = { inline_data: { mime_type: 'image/png', data: b64 } };
  cek('M3', 'part Gemini: inline_data mime_type + data', JSON.stringify(part) === JSON.stringify(diharapGemini), `mime_type=${part.inline_data.mime_type}, data ${part.inline_data.data.length} char`);

  const dua = G.daftarDataUrl([g, dariLampiran.nilai]);
  cek('M4', 'daftar images: urutan data URL dipertahankan', dua.length === 2 && dua[0] === g.dataUrl && dua[1] === dariLampiran.nilai.dataUrl, `${dua.length} data URL, sama dengan ${2 * g.dataUrl.length} char`);
}

/* ------------------------------------------------------------------ *
 * L: tidak ada payload di log / pesan
 * ------------------------------------------------------------------ */
{
  const g = dariTempel.nilai;
  const baris = G.barisLog(g);
  cek('L1', 'barisLog memuat angka, tanpa payload', !ADA_BASE64.test(baris) && !baris.includes(b64.slice(0, 32)) && baris.includes(String(g.byte)), `"${baris}"`);

  const ringkas = JSON.stringify(G.ringkasGambar({ ...g, nama: 'layar.png', lebar: 1, tinggi: 1 }));
  cek('L2', 'ringkasGambar: tidak ada kunci base64', !ringkas.includes('base64') && !ringkas.includes(b64.slice(0, 32)), ringkas);

  const kotor = `gagal mengirim data:image/png;base64,${b64} (${b64.length} char)`;
  const bersih = G.sensorBase64(kotor);
  cek('L3', 'sensorBase64 menyapu payload, menyisakan angka', !ADA_BASE64.test(bersih) && bersih.includes(String(b64.length)) && bersih.includes('<gambar-disenyapkan>'), `panjang ${kotor.length} -> ${bersih.length} char: "${bersih.slice(0, 60)}"`);

  const bocor = pesanYangDilihat.filter((p) => ADA_BASE64.test(p.pesan));
  cek('L4', 'semua pesan galat bebas payload', pesanYangDilihat.length > 0 && bocor.length === 0, `${pesanYangDilihat.length} pesan diperiksa, ${bocor.length} memuat base64`);
  const kodeDilihat = [...new Set(pesanYangDilihat.map((p) => p.kode))].sort().join(',');
  cek('L5', 'kode penolakan terpakai', kodeDilihat.includes('mime_ditolak') && kodeDilihat.includes('terlalu_besar') && kodeDilihat.includes('mime_tidak_cocok'), kodeDilihat);
}

/* ------------------------------------------------------------------ *
 * N: tidak ada jalur jaringan
 * ------------------------------------------------------------------ */
{
  const jumlah = `${jaringan.fetch + jaringan.xhr + jaringan.ws}`;
  cek('N1', 'pagar jaringan tidak pernah tersentuh', jaringan.fetch === 0 && jaringan.xhr === 0 && jaringan.ws === 0, `fetch=${jaringan.fetch} xhr=${jaringan.xhr} ws=${jaringan.ws} (total ${jumlah})`);

  const sumber = readFileSync(path.join(AKAR, 'src', 'lib', 'analisGambar.ts'), 'utf8');
  const terlarang = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'invoke(', 'require(', 'console.'];
  const ketemu = terlarang.filter((t) => sumber.includes(t));
  cek('N2', 'sumber modul bebas panggilan jaringan & console', ketemu.length === 0, `${sumber.split('\n').length} baris, terlarang ketemu: ${ketemu.length ? ketemu.join(',') : 'tidak ada'}`);

  const impor = [...sumber.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1]);
  cek('N3', 'modul tanpa impor sama sekali', impor.length === 0, impor.length ? impor.join(', ') : '0 impor (murni, tanpa dependensi)');
}

/* ------------------------------------------------------------------ *
 * ringkasan
 * ------------------------------------------------------------------ */
console.log('');
console.log(`ringkasan: ${lulus} lulus, ${gagal.length} gagal (${lulus + gagal.length} pemeriksaan)`);
if (gagal.length) {
  for (const g of gagal) console.log(`  - ${g}`);
  process.exit(1);
}
console.log('semua jalur gambar lolos: mime, batas ukuran, data URL, bentuk provider, tanpa jaringan');
process.exit(0);
