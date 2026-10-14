/*
 * UJI-UNDUH-INSTAL - membuktikan jalur "unduh -> periksa -> pasang" diuji,
 * bukan "panggil Install lalu bilang berhasil".
 *
 * Kenapa uji ini ada
 * ------------------
 * Sebelum ini tidak ada satu pun uji yang menyentuh jalur unduh: tidak ada uji
 * allowlist, tidak ada uji https, tidak ada pemeriksaan hash sama sekali, dan
 * tidak ada yang memeriksa bahwa paket yang "terpasang" benar-benar mengubah
 * sesuatu dengan ANGKA. Uji ini menjalankan enam kasus, tiap kasus menghitung
 * dirinya sendiri, dan keluar != 0 kalau ada satu yang lolos lewat gerbang yang
 * salah.
 *
 * Yang diuji (angka, bukan kata "berhasil")
 * -----------------------------------------
 *   1. host di luar allowlist  -> ditolak DI GERBANG URL, tanpa menyentuh jaringan;
 *   2. http (bukan https)      -> ditolak DI GERBANG URL, tanpa menyentuh jaringan;
 *   3. paket BERKODE           -> diunduh, hash cocok, lalu ditolak (tahap 'kode');
 *   4. hash tidak cocok        -> ditolak (tahap 'hash'), berkas sementara TIDAK ditulis;
 *   5. paket deklaratif sah    -> diterima, berkas sementara ada dan hash-nya
 *                                 dihitung ulang dari isi berkas itu;
 *   6. laporan bukti perubahan -> berisi ANGKA per jenis: tema (warna UI +
 *                                 token warna), ikon, snippet, keymap (pintasan),
 *                                 bahasa (mode aktif).
 *
 * Cara kerjanya (dan batasnya, jujur)
 * -----------------------------------
 * - Server HTTP LOKAL (`127.0.0.1:<port acak>`) menyajikan berkas .zext dari
 *   TMPDIR. Tidak ada permintaan ke internet.
 * - Gerbang URL memakai allowlist ASLI (`IZIN_HOST` di `unduhInstal.ts` =
 *   `open-vsx.org`, `www.open-vsx.org`, https saja). Untuk kasus 3-6 URL-nya
 *   memang `https://open-vsx.org/...` supaya lolos gerbang asli, lalu transport
 *   yang disuntik memetakannya ke server lokal - jadi byte-nya tetap datang dari
 *   HTTP nyata, hanya tujuannya lokal.
 * - `.zext` di sini ditulis/dibaca sebagai zip "stored" (tanpa kompresi) oleh
 *   uji ini sendiri. Ekstraksi sungguhan ada di Rust (`unzip_zext`) dan diuji
 *   terpisah oleh `cargo test --lib`; di sini pengekstrak disuntik lewat
 *   `bongkar`, yang memang pintu yang sama dipakai aplikasi.
 * - `VERSI_ZEPHYR` diperiksa sama dengan `package.json`.
 *
 * Jalan: node scripts/uji-unduh-instal.mjs
 *        node scripts/uji-unduh-instal.mjs --rinci
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const AKAR = path.resolve(import.meta.dirname, '..');
const RINCI = process.argv.includes('--rinci');
const GARIS_MIRING = String.fromCharCode(92);

/* TMPDIR: Hermes menunjuknya ke direktori scratch. Uji tidak menulis apa pun
   ke dalam repo selain berkasnya sendiri. */
const TMP = process.env.TMPDIR && existsSync(process.env.TMPDIR) ? process.env.TMPDIR : os.tmpdir();
const KERJA = path.join(TMP, `uji-unduh-instal-${process.pid}`);
rmSync(KERJA, { recursive: true, force: true });
mkdirSync(KERJA, { recursive: true });
const SERVE = path.join(KERJA, 'serve');
mkdirSync(SERVE, { recursive: true });
const BUNDEL = path.join(KERJA, 'unduhInstal.bundle.mjs');

let gagal = 0;
const baris = [];
function ok(label, detail) {
  baris.push(`  OK    ${label} :: ${detail}`);
}
function ko(label, detail) {
  gagal += 1;
  baris.push(`  GAGAL ${label} :: ${detail}`);
}

/* ------------------------------------------------------------------ */
/* Zip "stored" - cukup untuk berkas di uji ini, tanpa dependensi baru */
/* ------------------------------------------------------------------ */
function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}

function buatZipStore(entri) {
  const lokal = [];
  const sentral = [];
  let offset = 0;
  for (const e of entri) {
    const nama = Buffer.from(e.nama, 'utf8');
    const data = Buffer.from(e.isi, 'utf8');
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nama.length, 26);
    lokal.push(lh, nama, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nama.length, 28);
    ch.writeUInt32LE(offset, 42);
    sentral.push(ch, nama);

    offset += lh.length + nama.length + data.length;
  }
  const isiLokal = Buffer.concat(lokal);
  const isiSentral = Buffer.concat(sentral);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entri.length, 8);
  eocd.writeUInt16LE(entri.length, 10);
  eocd.writeUInt32LE(isiSentral.length, 12);
  eocd.writeUInt32LE(isiLokal.length, 16);
  return Buffer.concat([isiLokal, isiSentral, eocd]);
}

function bacaZipStore(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('bukan zip: EOCD tidak ditemukan');
  const jumlah = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const keluar = new Map();
  for (let i = 0; i < jumlah; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('central directory rusak');
    const ukuran = buf.readUInt32LE(p + 20);
    const namaLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const komentarLen = buf.readUInt16LE(p + 32);
    const nama = buf.toString('utf8', p + 46, p + 46 + namaLen);
    const lokal = buf.readUInt32LE(p + 42);
    const namaLenLokal = buf.readUInt16LE(lokal + 26);
    const extraLenLokal = buf.readUInt16LE(lokal + 28);
    const awal = lokal + 30 + namaLenLokal + extraLenLokal;
    keluar.set(nama, buf.toString('utf8', awal, awal + ukuran));
    p += 46 + namaLen + extraLen + komentarLen;
  }
  return keluar;
}

/* ------------------------------------------------------------------ */
/* Berkas uji                                                          */
/* ------------------------------------------------------------------ */
const MANIFEST_DEKLARATIF = JSON.stringify({
  name: 'paket-deklaratif',
  publisher: 'acme',
  version: '1.0.0',
  contributes: {
    themes: [{ label: 'Malam', path: './themes/malam.json' }],
    iconThemes: [{ label: 'Ikon', path: './icons/ikon.json' }],
    snippets: [{ language: 'go', path: './snippets/go.json' }],
    keymaps: [{ label: 'Pintasan', path: './keymaps/p.json' }],
    languages: [{ id: 'go', label: 'Go', extensions: ['go'], cmLang: 'go' }],
  },
});

const MANIFEST_BERKODE = JSON.stringify({
  name: 'paket-berkode',
  publisher: 'acme',
  version: '1.0.0',
  main: './extension.js',
  activationEvents: ['onCommand:acme.halo'],
  contributes: { commands: [{ command: 'acme.halo', title: 'Halo' }] },
});

const ZIP_DEKLARATIF = buatZipStore([
  { nama: 'zephyr-extension.json', isi: MANIFEST_DEKLARATIF },
  {
    nama: 'themes/malam.json',
    isi: JSON.stringify({
      colors: { 'editor.background': '#111111', 'editor.foreground': '#eeeeee', 'statusBar.background': '#222222' },
      tokenColors: [{ scope: 'a' }, { scope: 'b' }, { scope: 'c' }, { scope: 'd' }],
    }),
  },
  { nama: 'icons/ikon.json', isi: JSON.stringify({ iconDefinitions: { f1: {}, f2: {}, f3: {}, f4: {}, f5: {} } }) },
  { nama: 'snippets/go.json', isi: JSON.stringify({}) },
  { nama: 'keymaps/p.json', isi: JSON.stringify({ keybindings: [{ key: 'ctrl+k' }, { key: 'ctrl+j' }, { key: 'ctrl+l' }] }) },
]);

const ZIP_BERKODE = buatZipStore([
  { nama: 'zephyr-extension.json', isi: MANIFEST_BERKODE },
  { nama: 'extension.js', isi: 'module.exports = {};' },
]);

writeFileSync(path.join(SERVE, 'deklaratif.zext'), ZIP_DEKLARATIF);
writeFileSync(path.join(SERVE, 'berkode.zext'), ZIP_BERKODE);

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const HASH_DEKLARATIF = sha256(ZIP_DEKLARATIF);
const HASH_BERKODE = sha256(ZIP_BERKODE);

/* ------------------------------------------------------------------ */
/* Server berkas lokal                                                 */
/* ------------------------------------------------------------------ */
const dipanggil = [];
let permintaanDilayani = 0;

const server = http.createServer((req, res) => {
  permintaanDilayani += 1;
  const nama = path.basename(new URL(req.url, 'http://127.0.0.1').pathname);
  const p = path.join(SERVE, nama);
  if (!existsSync(p)) {
    res.writeHead(404).end('tidak ada');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(readFileSync(p));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const dasar = `http://127.0.0.1:${port}`;

/* Transport yang disuntik: URL resmi -> server lokal. Dipakai HANYA setelah
   gerbang URL lolos, dan hitungannya dilaporkan. */
const transport = async (url) => {
  dipanggil.push(url);
  const nama = path.basename(new URL(url).pathname);
  const r = await fetch(`${dasar}/${nama}`);
  return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
};

/* ------------------------------------------------------------------ */
/* Bundel modul yang diuji (bukan salinan logika)                      */
/* ------------------------------------------------------------------ */
function shimEsbuild() {
  const js = path.join(AKAR, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(js)) return { mode: 'node', jalan: js };
  for (const k of [path.join(AKAR, 'node_modules', '.bin', 'esbuild.cmd'), path.join(AKAR, 'node_modules', '.bin', 'esbuild')]) {
    if (existsSync(k)) return { mode: 'shell', jalan: k };
  }
  throw new Error('esbuild tidak ditemukan di node_modules - uji ini butuh esbuild untuk membundel unduhInstal.ts');
}

function bundel() {
  const { mode, jalan } = shimEsbuild();
  const arg = [
    path.join('src', 'lib', 'unduhInstal.ts'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--log-level=warning',
    `--outfile=${BUNDEL.split(GARIS_MIRING).join('/')}`,
  ];
  const keluar =
    mode === 'node'
      ? execFileSync(process.execPath, [jalan, ...arg], { cwd: AKAR, encoding: 'utf8' })
      : execFileSync(jalan, arg, { cwd: AKAR, encoding: 'utf8', shell: true });
  if (keluar && keluar.trim()) console.log(keluar.trim());
}

bundel();
const M = await import(pathToFileURL(BUNDEL).href);
if (typeof M.alurUnduhInstal !== 'function') {
  console.error('bundel tidak mengekspor alurUnduhInstal - batal');
  process.exit(2);
}

/* Pengekstrak uji: zip stored -> pembaca berkas. Ini pintu yang sama (`bongkar`)
   yang di aplikasi diisi oleh perintah Tauri yang memanggil `unzip_zext`. */
function bongkarZip(bytes) {
  const isi = bacaZipStore(Buffer.from(bytes));
  return { baca: (rel) => isi.get(String(rel).replace(/^\.\//, '')) };
}

const bacaBerkasSementara = (nama, bytes) => {
  const p = path.join(KERJA, nama);
  writeFileSync(p, bytes);
  return p;
};

/* ------------------------------------------------------------------ */
/* Kasus 1: host di luar allowlist                                     */
/* ------------------------------------------------------------------ */
{
  const sebelum = dipanggil.length;
  const r = await M.unduhKeSementara({ url: 'https://evil.example.com/paket.zext', id: 'paket-deklaratif', transport });
  if (r.ok === false && r.tahap === 'url' && r.alasan === 'HOST_TIDAK_DIIZINKAN' && dipanggil.length === sebelum) {
    ok('1 host di luar allowlist', `ditolak di gerbang url, 0 panggilan jaringan (alasan=${r.alasan})`);
  } else {
    ko('1 host di luar allowlist', `hasil=${JSON.stringify(r)} jaringan=${dipanggil.length - sebelum}`);
  }
}

/* ------------------------------------------------------------------ */
/* Kasus 2: bukan https                                                */
/* ------------------------------------------------------------------ */
{
  const sebelum = dipanggil.length;
  const r = await M.unduhKeSementara({ url: 'http://open-vsx.org/paket.zext', id: 'paket-deklaratif', transport });
  if (r.ok === false && r.tahap === 'url' && r.alasan === 'BUKAN_HTTPS' && dipanggil.length === sebelum) {
    ok('2 http (bukan https)', `ditolak di gerbang url, 0 panggilan jaringan (alasan=${r.alasan})`);
  } else {
    ko('2 http (bukan https)', `hasil=${JSON.stringify(r)} jaringan=${dipanggil.length - sebelum}`);
  }
}

/* ------------------------------------------------------------------ */
/* Kasus 3: paket berkode ditolak                                      */
/* ------------------------------------------------------------------ */
{
  const tujuan = path.join(KERJA, 'tak-boleh-ada.zext');
  const r = await M.alurUnduhInstal({
    url: 'https://open-vsx.org/berkode.zext',
    id: 'paket-berkode',
    sha256: HASH_BERKODE,
    transport,
    bongkar: bongkarZip,
    tulisBerkasSementara: (nama, bytes) => {
      writeFileSync(tujuan, bytes);
      return tujuan;
    },
  });
  const unduhanTerjadi = dipanggil.some((u) => u.endsWith('berkode.zext'));
  if (r.ok === false && r.tahap === 'kode' && r.alasan === 'PAKET_BERKODE' && unduhanTerjadi && r.pesan.includes('extension host')) {
    ok('3 paket berkode', `diunduh+hash cocok, lalu ditolak di tahap kode (sebab disebut: ${/^\s+- .*$/m.test(r.pesan) ? 'ya' : 'tidak'})`);
  } else {
    ko('3 paket berkode', `hasil=${JSON.stringify(r)} unduhan=${unduhanTerjadi}`);
  }
}

/* ------------------------------------------------------------------ */
/* Kasus 4: hash tidak cocok                                           */
/* ------------------------------------------------------------------ */
{
  const tujuan = path.join(KERJA, 'hash-salah.zext');
  const r = await M.alurUnduhInstal({
    url: 'https://open-vsx.org/deklaratif.zext',
    id: 'paket-deklaratif',
    sha256: sha256(Buffer.from('paket lain')),
    transport,
    bongkar: bongkarZip,
    tulisBerkasSementara: (nama, bytes) => {
      writeFileSync(tujuan, bytes);
      return tujuan;
    },
  });
  if (r.ok === false && r.tahap === 'hash' && r.alasan === 'HASH_TIDAK_COCOK' && !existsSync(tujuan)) {
    ok('4 hash tidak cocok', `ditolak di tahap hash (alasan=${r.alasan}), berkas sementara tidak ditulis`);
  } else {
    ko('4 hash tidak cocok', `hasil=${JSON.stringify(r)} berkasDitulis=${existsSync(tujuan)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Kasus 5 + 6: paket deklaratif sah, laporan bukti berangka           */
/* ------------------------------------------------------------------ */
{
  const r = await M.alurUnduhInstal({
    url: 'https://open-vsx.org/deklaratif.zext',
    id: 'paket-deklaratif',
    sha256: `sha256:${HASH_DEKLARATIF}`,
    transport,
    bongkar: bongkarZip,
    tulisBerkasSementara: bacaBerkasSementara,
  });

  if (r.ok === true && r.berkas && existsSync(r.berkas) && sha256(readFileSync(r.berkas)) === r.hash) {
    ok('5 paket deklaratif sah', `diterima; berkas sementara ${path.basename(r.berkas)} ${r.byte} byte, sha256 ${r.hash.slice(0, 12)}... dihitung ulang dari isi berkas = sama`);
  } else {
    ko('5 paket deklaratif sah', `hasil=${JSON.stringify(r && { ok: r.ok, tahap: r.tahap, alasan: r.alasan, pesan: r.pesan })}`);
  }

  const l = r.ok === true ? r.laporan : undefined;
  const angkaBenar =
    l !== undefined &&
    l.tema.jumlahTema === 1 &&
    l.tema.warnaUI === 3 &&
    l.tema.tokenWarna === 4 &&
    l.ikon.jumlahIkonTheme === 1 &&
    l.ikon.jumlahIkon === 5 &&
    l.snippet.jumlahSnippet === 1 &&
    l.keymap.jumlahKeymap === 1 &&
    l.keymap.jumlahPintasan === 3 &&
    l.bahasa.jumlahBahasa === 1 &&
    l.bahasa.modeAktif.length === 1 &&
    l.bahasa.modeAktif[0] === 'go';
  if (angkaBenar) {
    ok(
      '6 laporan bukti perubahan',
      `tema=${l.tema.warnaUI} warna UI + ${l.tema.tokenWarna} token warna | ikon=${l.ikon.jumlahIkon} | snippet=${l.snippet.jumlahSnippet} | keymap=${l.keymap.jumlahPintasan} pintasan | bahasa=${l.bahasa.modeAktif.join(',')}`,
    );
    for (const s of l.ringkasan) baris.push(`        ringkasan: ${s}`);
  } else if (l === undefined) {
    ko('6 laporan bukti perubahan', 'tidak ada laporan (kasus 5 gagal)');
  } else {
    ko('6 laporan bukti perubahan', JSON.stringify(l));
  }

  /* Paket deklaratif yang isinya nol kontribusi yang bisa dipakai tetap
     ditolak, bukan "terpasang tanpa efek". */
  const kosong = buatZipStore([
    {
      nama: 'zephyr-extension.json',
      isi: JSON.stringify({
        name: 'paket-kosong',
        publisher: 'acme',
        version: '1.0.0',
        contributes: { themes: [{ label: 'Tanpa Warna UI', path: './themes/t.json' }] },
      }),
    },
    { nama: 'themes/t.json', isi: JSON.stringify({ tokenColors: [{ scope: 'a' }] }) },
  ]);
  const r2 = await M.alurUnduhInstal({
    url: 'https://open-vsx.org/deklaratif.zext',
    id: 'paket-deklaratif',
    sha256: sha256(kosong),
    transport: async () => ({ status: 200, bytes: new Uint8Array(kosong) }),
    bongkar: bongkarZip,
  });
  if (r2.ok === false && r2.tahap === 'pasang' && r2.alasan === 'TIDAK_ADA_KONTRIBUSI' && r2.pesan.startsWith(M.TOLAK_PENANDA)) {
    ok('6b tema tanpa warna UI', 'ditolak (TIDAK_ADA_KONTRIBUSI) - tidak dipasang lalu diam');
  } else {
    ko('6b tema tanpa warna UI', JSON.stringify(r2));
  }
}

/* ------------------------------------------------------------------ */
/* Konsistensi konstanta dengan aplikasi                               */
/* ------------------------------------------------------------------ */
{
  const pkg = JSON.parse(readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
  const rust = readFileSync(path.join(AKAR, 'src-tauri', 'src', 'ext_pkg.rs'), 'utf8');
  const izinRust = (rust.match(/pub const IZIN_UNDUH: &\[&str\] = &\[([^\]]+)\]/) || [, ''])[1];
  const hostRust = izinRust.split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
  const samaIzin = hostRust.length === M.IZIN_HOST.length && hostRust.every((h) => M.IZIN_HOST.includes(h));
  const versiSama = M.VERSI_ZEPHYR === pkg.version;
  const shaDiRust = /pub fn hash_sha256/.test(rust) && /hash_cocok/.test(rust);
  if (samaIzin && versiSama && shaDiRust) {
    ok(
      '7 konstanta sinkron',
      `allowlist TS == allowlist Rust [${hostRust.join(', ')}] | VERSI_ZEPHYR == package.json (${pkg.version}) | Rust punya hash_sha256/hash_cocok`,
    );
  } else {
    ko('7 konstanta sinkron', `samaIzin=${samaIzin} versiSama=${versiSama} shaDiRust=${shaDiRust} rust=[${hostRust.join(', ')}] ts=[${M.IZIN_HOST.join(', ')}]`);
  }
}

server.close();

const kasus = 8;
console.log('UJI UNDUH-INSTAL (unduh -> periksa -> pasang, server berkas lokal di TMPDIR)');
console.log(`  server: ${dasar} | berkas: ${SERVE}`);
console.log(`  modul: src/lib/unduhInstal.ts (dibundel apa adanya) | TMPDIR kerja: ${KERJA}`);
console.log(`  dipanggil jaringan: ${dipanggil.length} (${dipanggil.map((u) => path.basename(u)).join(', ') || '-'}) | permintaan dilayani server: ${permintaanDilayani}`);
if (RINCI || gagal) console.log(baris.join('\n'));
else console.log(baris.filter((b) => b.includes('OK ') || b.includes('GAGAL')).join('\n'));
console.log(`  kasus: ${kasus - gagal}/${kasus} lulus`);
console.log(`  VERDICT: ${gagal === 0 ? 'LULUS' : 'GAGAL'}`);
process.exit(gagal === 0 ? 0 : 1);
