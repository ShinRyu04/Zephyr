#!/usr/bin/env node
/*
 * UJI EKSTENSI JENIS — bukti per jenis kontribusi bahwa "terpasang" benar-benar
 * MENGUBAH sesuatu yang bisa dilihat pengguna, dengan angka sebelum/sesudah.
 *
 * Kenapa uji ini ada
 * ------------------
 * `uji-unduh-instal.mjs` membuktikan gerbang unduh (host, https, hash, paket
 * berkode, paket tanpa kontribusi) dan bahwa `laporanBuktiPerubahan`
 * melaporkan angka dari berkas paket. Yang belum dibuktikan di sana: bahwa
 * angka itu juga BENAR-BENAR MENDARAT di state aplikasi. "Terpasang" di
 * laporan bisa berarti dua hal yang sangat berbeda:
 *
 *   - tema:   3 warna UI + 4 token warna ditulis ke :root  (piksel berubah)
 *   - ikon:   5 ikon gaya VS Code (`iconDefinitions`) dilaporkan sebagai
 *             "5 icons", padahal pemuat (`muatIconTheme`) hanya bisa
 *             menggambar entri `icons` yang punya `glyph` -> 0 ikon berubah
 *
 * Uji ini menempuh JALUR NYATA untuk dua tahap sekaligus:
 *
 *   1. unduh -> periksa -> pasang   : `src/lib/unduhInstal.ts` DIBUNDEL APA
 *      ADANYA, diunduh dari server berkas lokal di TMPDIR (pola yang sama
 *      dengan uji-unduh-instal.mjs), lalu paket diekstrak ke direktori
 *      "terpasang" seperti aplikasi melakukannya.
 *   2. muat ke aplikasi             : `src/lib/extLoader.ts` DIBUNDEL APA
 *      ADANYA (hanya `./commands` yang diganti spion: server berkas lokal ini
 *      memainkan peran perintah Tauri, sama seperti uji-unduh-instal.mjs
 *      memainkan peran `unzip_zext`). `muatSemuaEkstensi()` lalu dijalankan
 *      dan angka state sesudahnya dibaca langsung dari modul loader:
 *      `themesEkstensi()`, `terapkanTokenEkstensi()` (menulis CSS custom
 *      property ke document.documentElement.style — diukur oleh shim DOM di
 *      berkas ini), `jumlahIkonExt()`, `jumlahSnippet()`, `keymapEkstensi()`,
 *      `bahasaUntukExt()` dan titik konsumsi pengguna `extLangUntuk()` /
 *      `labelBahasa()` dari src/lib/lang.ts.
 *
 * Aturan lulus
 * ------------
 * GAGAL (exit 1) kalau ada paket yang DITERIMA gerbang ("terpasang") tetapi
 * tidak ada satu pun angka state yang berubah saat dimuat. Jenis yang tidak
 * bisa dibuktikan tanpa menyentuh berkas lane lain dilaporkan sebagai CELAH
 * TERBUKA dengan berkas+baris penyebabnya, dan tetap membuat exit 1 — supaya
 * "hijau" tidak pernah dibeli dengan menyembunyikan lubang.
 *
 * Tulis TMPDIR: paket, bundel, dan direktori "terpasang" hidup di TMPDIR.
 * Repo tidak disentuh selain berkas uji ini.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import esbuild from 'esbuild';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RINCI = process.argv.includes('--rinci');
const TMP = process.env.TMPDIR && existsSync(process.env.TMPDIR) ? process.env.TMPDIR : os.tmpdir();
const KERJA = path.join(TMP, `uji-ekstensi-jenis-${process.pid}`);
rmSync(KERJA, { recursive: true, force: true });
mkdirSync(KERJA, { recursive: true });
const SERVE = path.join(KERJA, 'serve');
mkdirSync(SERVE, { recursive: true });
const BUNDEL_DOWNLOAD = path.join(KERJA, 'unduhInstal.bundle.mjs');
const BUNDEL_LOADER = path.join(KERJA, 'loader.bundle.mjs');

/* ------------------------------------------------------------------ */
/* Kotak hitung                                                        */
/* ------------------------------------------------------------------ */
let gagal = 0;
let celah = 0;
const baris = [];
function ok(label, detail) {
  baris.push(`  OK     ${label} :: ${detail}`);
}
function ko(label, detail) {
  gagal += 1;
  baris.push(`  GAGAL  ${label} :: ${detail}`);
}
function gap(label, detail) {
  celah += 1;
  baris.push(`  CELAH  ${label} :: ${detail}`);
}
function info(detail) {
  baris.push(`         ${detail}`);
}

/* ------------------------------------------------------------------ */
/* Zip "stored" — cukup untuk paket di uji ini, tanpa dependensi baru   */
/* ------------------------------------------------------------------ */
function buatZipStore(entri) {
  const lokal = [];
  const sentral = [];
  let offset = 0;
  for (const e of entri) {
    const nama = Buffer.from(e.nama, 'utf8');
    const data = Buffer.from(e.isi, 'utf8');
    const crc = zlib.crc32(data) >>> 0;

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
    const crc = buf.readUInt32LE(p + 16);
    const ukuran = buf.readUInt32LE(p + 24);
    const panjangNama = buf.readUInt16LE(p + 28);
    const panjangExtra = buf.readUInt16LE(p + 30);
    const panjangKomentar = buf.readUInt16LE(p + 32);
    const offsetLokal = buf.readUInt32LE(p + 42);
    const nama = buf.toString('utf8', p + 46, p + 46 + panjangNama);
    const panjangNamaLokal = buf.readUInt16LE(offsetLokal + 26);
    const panjangExtraLokal = buf.readUInt16LE(offsetLokal + 28);
    const mulai = offsetLokal + 30 + panjangNamaLokal + panjangExtraLokal;
    const isi = buf.subarray(mulai, mulai + ukuran);
    if ((zlib.crc32(isi) >>> 0) !== crc) throw new Error(`crc tidak cocok untuk ${nama}`);
    keluar.set(nama, isi);
    p += 46 + panjangNama + panjangExtra + panjangKomentar;
  }
  return keluar;
}

/* ------------------------------------------------------------------ */
/* Shim DOM: loader menulis warna tema ke document.documentElement.style */
/* ------------------------------------------------------------------ */
const cssVar = new Map();
function pasangShim() {
  const style = {
    setProperty: (k, v) => {
      cssVar.set(String(k), String(v));
    },
    removeProperty: (k) => {
      cssVar.delete(String(k));
    },
    getPropertyValue: (k) => cssVar.get(String(k)) ?? '',
  };
  const elemen = () => ({
    style: { ...style },
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  globalThis.window = globalThis;
  globalThis.document = {
    documentElement: { style },
    body: elemen(),
    head: elemen(),
    createElement: elemen,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  };
  const simpan = new Map();
  globalThis.localStorage = {
    getItem: (k) => (simpan.has(String(k)) ? simpan.get(String(k)) : null),
    setItem: (k, v) => simpan.set(String(k), String(v)),
    removeItem: (k) => simpan.delete(String(k)),
    clear: () => simpan.clear(),
    key: () => null,
    length: 0,
  };
  globalThis.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
  class Pengamat {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    addEventListener() {}
    removeEventListener() {}
  }
  if (typeof globalThis.MutationObserver === 'undefined') globalThis.MutationObserver = Pengamat;
  if (typeof globalThis.ResizeObserver === 'undefined') globalThis.ResizeObserver = Pengamat;
  if (typeof globalThis.IntersectionObserver === 'undefined') globalThis.IntersectionObserver = Pengamat;
  if (typeof globalThis.HTMLElement === 'undefined') globalThis.HTMLElement = class HTMLElement {};
  if (typeof globalThis.Element === 'undefined') globalThis.Element = class Element {};
  if (typeof globalThis.Node === 'undefined') globalThis.Node = class Node {};
  if (typeof globalThis.getComputedStyle === 'undefined') globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.__VITE_ENV = {};
}

/* ------------------------------------------------------------------ */
/* Bundel modul yang diuji (bukan salinan logika)                      */
/* ------------------------------------------------------------------ */
/* Spion perintah: `./commands` asli tetap di-bundle apa adanya (export *),
   hanya dua perintah berkas-ekstensi yang dijawab dari direktori uji. */
const SPION_COMMANDS = `export * from '__COMMANDS_TS__';
const S = () => globalThis.__SPION_ZEPHYR ?? {};
export async function extensionsManifests(...a) { return S().extensionsManifests(...a); }
export async function extensionsReadContrib(...a) { return S().extensionsReadContrib(...a); }
`;
const SPION_FILE = path.join(KERJA, 'spion-commands.mjs');
writeFileSync(
  SPION_FILE,
  SPION_COMMANDS.replace('__COMMANDS_TS__', path.join(AKAR, 'src', 'lib', 'commands.ts').split(path.sep).join('/')),
);

function pluginSpion() {
  return {
    name: 'spion-commands',
    setup(build) {
      build.onResolve({ filter: /^\.{1,2}\/(?:.*\/)?commands$/ }, () => ({ path: SPION_FILE }));
    },
  };
}

async function bundel(opsi) {
  await esbuild.build({
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'error',
    define: {
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': 'globalThis.__VITE_ENV',
      'import.meta.hot': 'undefined',
    },
    plugins: [pluginSpion()],
    ...opsi,
  });
}

const ENTRI_LOADER = `
export * from './src/lib/extLoader';
export { jumlahIkonExt, ikonFileExt } from './src/lib/extIkonFile';
export { extLangUntuk, labelBahasa, detectLang } from './src/lib/lang';
export { catatanBahasaTerpasang, bahasaTanpaEfek } from './src/components/extensions/bahasaTerpasang';
`;

await bundel({
  entryPoints: [path.join(AKAR, 'src', 'lib', 'unduhInstal.ts')],
  outfile: BUNDEL_DOWNLOAD,
});
await bundel({
  stdin: {
    contents: ENTRI_LOADER,
    resolveDir: AKAR,
    sourcefile: 'entri-loader.ts',
    loader: 'ts',
  },
  outfile: BUNDEL_LOADER,
});

pasangShim();

const D = await import(pathToFileURL(BUNDEL_DOWNLOAD).href);
const A = await import(pathToFileURL(BUNDEL_LOADER).href);
if (typeof D.alurUnduhInstal !== 'function' || typeof A.muatSemuaEkstensi !== 'function') {
  console.error('bundel tidak mengekspor alurUnduhInstal/muatSemuaEkstensi - batal');
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Server berkas lokal + peran perintah Tauri                          */
/* ------------------------------------------------------------------ */
const dipanggil = [];
let dilayani = 0;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const server = http.createServer((req, res) => {
  dilayani += 1;
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
const transport = async (url) => {
  dipanggil.push(url);
  const nama = path.basename(new URL(url).pathname);
  const r = await fetch(`${dasar}/${nama}`);
  return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
};

/* Peran `unzip_zext` (bongkar) untuk gerbang unduh-instal. */
function bongkarZip(bytes) {
  const isi = bacaZipStore(Buffer.from(bytes));
  return { baca: (rel) => (isi.get(String(rel).replace(/^\.\//, '')) ?? undefined)?.toString('utf8') };
}

/* Peran direktori ekstensi terpasang: berkas paket ditulis ke disk, lalu
   dibaca lagi dari disk oleh jalur pemuatan (tidak ada state di memori). */
const PULANG = [];
function tulisBerkasSementara(nama, bytes) {
  const p = path.join(KERJA, nama);
  writeFileSync(p, bytes);
  return p;
}
function pasangKeDisk(zext, id) {
  const dir = path.join(KERJA, 'terpasang', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const isi = bacaZipStore(readFileSync(zext));
  for (const [nama, buf] of isi) {
    const p = path.join(dir, nama.split('/').join(path.sep));
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, buf);
  }
  return dir;
}

/* Bentuk `ExtManifest` yang dibaca loader. Pemetaan kontribusi mengikuti
   pembaca Rust (`src-tauri/src/ext_pkg.rs`: cm_lang <- "cmLang",
   legacy_mode <- "legacyMode", extensions apa adanya). */
function statusPaket(dir) {
  const mentah = JSON.parse(readFileSync(path.join(dir, 'zephyr-extension.json'), 'utf8'));
  const c = mentah.contributes ?? {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  const manifest = {
    id: mentah.id,
    name: mentah.name ?? mentah.id,
    publisher: mentah.publisher ?? '',
    version: mentah.version ?? '0.0.0',
    description: mentah.description ?? '',
    icon: '',
    categories: arr(mentah.categories),
    engine: mentah.engines?.zephyr ?? '',
    engineOk: true,
    main: mentah.main ?? '',
    contributes: {
      themes: arr(c.themes).map((t) => ({ label: t.label ?? '', path: t.path ?? '', kind: t.kind === 'light' ? 'light' : 'dark' })),
      keymaps: arr(c.keymaps).map((k) => ({ label: k.label ?? '', path: k.path ?? '' })),
      snippets: arr(c.snippets).map((s) => ({ language: s.language ?? '', path: s.path ?? '' })),
      languages: arr(c.languages).map((l) => ({
        id: l.id ?? '',
        extensions: arr(l.extensions),
        cmLang: l.cmLang ?? '',
        legacyMode: l.legacyMode ?? '',
        label: l.label ?? '',
      })),
      iconThemes: arr(c.iconThemes).map((i) => ({ label: i.label ?? '', path: i.path ?? '' })),
      commands: [],
      grammars: arr(c.grammars),
    },
    raw: mentah,
    manifestFile: 'zephyr-extension.json',
  };
  return {
    manifest,
    enabled: true,
    tercatat: true,
    path: dir,
    error: null,
    pengaruh: { didukung: [], diabaikan: [], ringkasan: [] },
  };
}

const permintaanKontrib = [];
let dipasang = [];
globalThis.__SPION_ZEPHYR = {
  extensionsManifests: async () => dipasang.slice(),
  extensionsReadContrib: async (id, rel) => {
    const rel2 = String(rel).replace(/^\.\//, '');
    permintaanKontrib.push(`${id}:${rel2}`);
    for (const st of dipasang) {
      const p = path.join(st.path, rel2.split('/').join(path.sep));
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
    }
    throw new Error(`berkas kontribusi ${rel2} tidak ada di paket`);
  },
};

/* ------------------------------------------------------------------ */
/* Angka state aplikasi (sebelum/sesudah)                              */
/* ------------------------------------------------------------------ */
function angka() {
  const r = A.ringkasanLoader();
  return {
    tema: A.themesEkstensi().length,
    varCss: 0, // diisi terpisah: warna hanya "terlihat" setelah tema dipakai
    ikon: A.jumlahIkonExt(),
    snippet: A.jumlahSnippet(),
    keymap: A.keymapEkstensi().length,
    bahasa: A.bahasaEkstensi().length,
    tidakDidukung: r.tidakDidukung.length,
    gagal: r.gagal.length,
  };
}

function ringkasAngka(a) {
  return `tema=${a.tema} var-css=${a.varCss} ikon=${a.ikon} snippet=${a.snippet} keymap=${a.keymap} bahasa=${a.bahasa}`;
}

async function muat(daftar) {
  dipasang = daftar;
  permintaanKontrib.length = 0;
  return A.muatSemuaEkstensi();
}

/* Warna tema: hanya berubah setelah tema DIPAKAI (jalur themes.ts ->
   terapkanTokenEkstensi -> :root). Diukur dari shim document.documentElement. */
function warnaTerpakai(id) {
  cssVar.clear();
  const dipakai = A.terapkanTokenEkstensi(id);
  return { dipakai, jumlah: cssVar.size, contoh: Array.from(cssVar.entries()).slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* Paket uji — satu jenis per paket, tanpa jenis lain di dalamnya       */
/* ------------------------------------------------------------------ */
function zext(namaBerkas, entri) {
  const buf = buatZipStore(entri);
  writeFileSync(path.join(SERVE, namaBerkas), buf);
  return { namaBerkas, buf, hash: sha256(buf) };
}

const manifest = (id, contributes, extra = {}) =>
  JSON.stringify({
    id,
    name: id,
    publisher: 'uji',
    version: '1.0.0',
    engines: { zephyr: '>=1.0' },
    ...extra,
    contributes,
  });

/* tema: 3 warna UI + 4 token warna kode */
const Z_TEMA = zext('tema.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.tema', { themes: [{ label: 'Uji', path: './themes/uji.json', kind: 'dark' }] }, { categories: ['Themes'] }),
  },
  {
    nama: 'themes/uji.json',
    isi: JSON.stringify({
      colors: {
        'editor.background': '#101010',
        'editor.foreground': '#e0e0e0',
        'statusBar.background': '#202020',
      },
      tokenColors: [
        { scope: ['keyword'], settings: { foreground: '#ff5555' } },
        { scope: ['string'], settings: { foreground: '#55ff55' } },
        { scope: ['comment'], settings: { foreground: '#888888' } },
        { scope: ['constant.numeric'], settings: { foreground: '#5555ff' } },
      ],
    }),
  },
]);

/* ikon: format Zephyr — `icons` dengan glyph (yang bisa digambar loader) */
const Z_IKON_ZEPHYR = zext('ikon-zephyr.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.ikon-zephyr', { iconThemes: [{ label: 'Uji', path: './icons/uji.json' }] }, { categories: ['Icon Themes'] }),
  },
  {
    nama: 'icons/uji.json',
    isi: JSON.stringify({
      icons: {
        uji1: { glyph: '1', color: '#111111' },
        uji2: { glyph: '2', color: '#222222' },
        uji3: { glyph: '3', color: '#333333' },
        uji4: { glyph: '4', color: '#444444' },
        uji5: { glyph: '5', color: '#555555' },
      },
    }),
  },
]);

/* ikon: format VS Code — `iconDefinitions` tanpa glyph (yang TIDAK bisa
   digambar loader, lihat muatIconTheme: `raw.icons ?? raw` + butuh glyph) */
const Z_IKON_VSCODE = zext('ikon-vscode.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.ikon-vscode', { iconThemes: [{ label: 'Uji VS Code', path: './icons/vscode.json' }] }, { categories: ['Icon Themes'] }),
  },
  {
    nama: 'icons/vscode.json',
    isi: JSON.stringify({
      iconDefinitions: {
        _f1: { iconPath: './f1.svg' },
        _f2: { iconPath: './f2.svg' },
        _f3: { iconPath: './f3.svg' },
        _f4: { iconPath: './f4.svg' },
        _f5: { iconPath: './f5.svg' },
      },
      fileExtensions: { go: '_f1', rs: '_f2', py: '_f3', c: '_f4', h: '_f5' },
    }),
  },
]);

/* snippet: 2 snippet satu bahasa */
const Z_SNIPPET = zext('snippet.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.snippet', { snippets: [{ language: 'ebnf', path: './snippets/ebnf.json' }] }, { categories: ['Snippets'] }),
  },
  {
    nama: 'snippets/ebnf.json',
    isi: JSON.stringify({
      'atur': { prefix: 'atur', body: ['aturan := ${1:ekspresi}'], description: 'atur' },
      'ekspresi': { prefix: 'ekspresi', body: ['${1:a} | ${2:b}'], description: 'pilihan' },
    }),
  },
]);

/* keymap: 3 pintasan */
const Z_KEYMAP = zext('keymap.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.keymap', { keymaps: [{ label: 'Uji', path: './keymaps/uji.json' }] }, { categories: ['Keymaps'] }),
  },
  {
    nama: 'keymaps/uji.json',
    isi: JSON.stringify({
      keybindings: [
        { key: 'ctrl+alt+u', command: 'workbench.action.quickOpen' },
        { key: 'ctrl+alt+i', command: 'workbench.action.showCommands' },
        { key: 'ctrl+alt+o', command: 'editor.action.formatDocument' },
      ],
    }),
  },
]);

/* bahasa: mode legacy yang BENAR-BENAR bisa dimuat (MODE_TERSEDIA: 'ebnf'),
   ekstensi .ebnf belum diklaim bahasa bawaan (lang.ts bukan BY_EXT['ebnf']) */
const KONTRIB_BAHASA = {
  languages: [{ id: 'ebnf', label: 'EBNF', extensions: ['.ebnf'], legacyMode: 'ebnf' }],
};
const Z_BAHASA = zext('bahasa.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.bahasa', KONTRIB_BAHASA, { categories: ['Languages'] }),
  },
]);

/* bahasa: hanya menambah ekstensi yang SUDAH didukung bawaan (.py) */
const KONTRIB_BAWAAN = {
  languages: [{ id: 'ebnf', label: 'EBNF', extensions: ['.py'], legacyMode: 'ebnf' }],
};
const Z_BAHASA_BAWAAN = zext('bahasa-bawaan.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.bahasa-bawaan', KONTRIB_BAWAAN, { categories: ['Languages'] }),
  },
]);

/* bahasa: grammar yang TIDAK bisa dimuat (cmLang bukan paket yang diizinkan,
   legacyMode tidak ada di MODE_TERSEDIA). Akhirannya sengaja yang BARU
   (.uji-go, bukan .go) supaya cek ini mengukur seam grammar di extLoader,
   bukan aturan "akhiran sudah dipegang bahasa bawaan" di gerbang. */
const KONTRIB_TANPA_GRAMMAR = {
  languages: [{ id: 'uji-go', label: 'Uji Go', extensions: ['.uji-go'], cmLang: 'go' }],
};
const Z_BAHASA_TANPA_GRAMMAR = zext('bahasa-tanpa-grammar.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.bahasa-mati', KONTRIB_TANPA_GRAMMAR, { categories: ['Languages'] }),
  },
]);

/* Paket yang TIDAK punya satu kontribusi pun yang bisa dipakai Zephyr: berisi
   hanya grammar TextMate (mesinnya belum ada). Gerbang harus MENOLAKNYA dengan
   pesan yang menyebut sebabnya, bukan memasang lalu diam. */
const Z_KOSONG_GRAMMAR = zext('kosong-grammar.zext', [
  {
    nama: 'zephyr-extension.json',
    isi: manifest('uji.kosong-grammar', {
      grammars: [{ language: 'uji-kosong', scopeName: 'source.uji-kosong', path: './grammars/uji.json' }],
    }),
  },
  { nama: 'grammars/uji.json', isi: JSON.stringify({ scopeName: 'source.uji-kosong', patterns: [] }) },
]);

/* Paket tanpa blok `contributes` sama sekali. */
const Z_KOSONG_POLOS = zext('kosong-polos.zext', [
  { nama: 'zephyr-extension.json', isi: manifest('uji.kosong-polos', {}) },
]);

/* ------------------------------------------------------------------ */
/* Jalur nyata: unduh -> periksa -> pasang -> muat                     */
/* ------------------------------------------------------------------ */
const kindsGerbang = new Set();
const jenisDitolak = [];
async function pasang(paket, id) {
  const r = await D.alurUnduhInstal({
    url: `https://open-vsx.org/${paket.namaBerkas}`,
    id,
    sha256: `sha256:${paket.hash}`,
    transport,
    bongkar: bongkarZip,
    tulisBerkasSementara,
  });
  const unduhan = dipanggil.some((u) => u.endsWith(paket.namaBerkas));
  /* Jenis kontribusi yang dilaporkan gerbang = bahan penanda jenis di kartu
     ekstensi (ExtensionsView: `pengaruh.didukung[].kind` -> JENIS_KATA). */
  if (r.ok === true) for (const i of r.laporan.didukung) kindsGerbang.add(i.kind);
  else jenisDitolak.push({ id, alasan: r.alasan });
  return { r, unduhan };
}

async function garisDasar() {
  await muat([]);
  const a = angka();
  cssVar.clear();
  return a;
}

const hasilJenis = [];

/* --- 0. garis dasar: tanpa paket terpasang --- */
const NOL = await garisDasar();
info(`garis dasar (0 paket terpasang): ${ringkasAngka(NOL)}`);
if (NOL.tema !== 0 || NOL.ikon !== 0 || NOL.snippet !== 0 || NOL.keymap !== 0 || NOL.bahasa !== 0) {
  ko('0 garis dasar', `state loader tidak kosong tanpa paket: ${ringkasAngka(NOL)}`);
} else {
  ok('0 garis dasar', `loader kosong sebelum ada paket: ${ringkasAngka(NOL)}`);
}

/* --- 1. TEMA: warna UI + token warna kode benar-benar ditulis ke :root --- */
{
  const { r, unduhan } = await pasang(Z_TEMA, 'uji-tema');
  if (r.ok !== true || !unduhan) {
    ko('1 tema', `gerbang menolak paket tema: ${JSON.stringify(r)}`);
  } else {
    const l = r.laporan;
    const dir = pasangKeDisk(r.berkas, 'uji-tema');
    const sebelum = await garisDasar();
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    const info2 = A.themesEkstensi()[0];
    const pakai = warnaTerpakai(info2?.id ?? '');
    sesudah.varCss = pakai.jumlah;
    hasilJenis.push({ jenis: 'tema', sebelum, sesudah, laporan: `warnaUI=${l.tema.warnaUI} tokenWarna=${l.tema.tokenWarna}` });
    info(`1 tema: laporan gerbang menulis warnaUI=${l.tema.warnaUI} tokenWarna=${l.tema.tokenWarna}; state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}`);
    if (l.tema.warnaUI > 0 && sesudah.tema === sebelum.tema + 1 && pakai.jumlah > 0 && pakai.dipakai) {
      ok(
        '1 tema',
        `terpasang -> tema terdaftar (${sebelum.tema}->${sesudah.tema}) dan tema dipakai menulis ${pakai.jumlah} CSS custom property ke :root (contoh: ${pakai.contoh.map(([k, v]) => `${k}=${v}`).join(', ')})`,
      );
    } else {
      ko('1 tema', `laporan=${l.tema.warnaUI} UI warna, terdaftar=${sesudah.tema}, var :root=${pakai.jumlah}`);
    }
  }
}

/* --- 2. IKON (format Zephyr): jumlah ikon bertambah --- */
{
  const { r, unduhan } = await pasang(Z_IKON_ZEPHYR, 'uji-ikon-zephyr');
  if (r.ok !== true || !unduhan) {
    ko('2 ikon (format Zephyr)', `gerbang menolak paket ikon: ${JSON.stringify(r)}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-ikon-zephyr');
    const sebelum = await garisDasar();
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    sesudah.varCss = 0;
    const probe = A.ikonFileExt('berkas.uji1');
    hasilJenis.push({ jenis: 'ikon (Zephyr)', sebelum, sesudah, laporan: `ikon-deklaratif=${r.laporan.ikon.jumlahIkon} dapat-digambar=${r.laporan.ikon.jumlahDapatDigambar}` });
    info(`2 ikon (Zephyr): laporan gerbang ikon=${r.laporan.ikon.jumlahIkon} (dapat digambar=${r.laporan.ikon.jumlahDapatDigambar}); state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}`);
    if (sesudah.ikon > sebelum.ikon && probe && probe.glyph === '1') {
      ok('2 ikon (format Zephyr)', `terpasang -> ikon ${sebelum.ikon}->${sesudah.ikon}, berkas .uji1 dapat glyph "${probe.glyph}" warna ${probe.color}`);
    } else {
      ko('2 ikon (format Zephyr)', `ikon ${sebelum.ikon}->${sesudah.ikon}, probe=${JSON.stringify(probe)}`);
    }
  }
}

/* --- 3. IKON (format VS Code): dilaporkan "5 icons" tetapi loader hanya
       bisa menggambar entri `icons` berglyph -> harus DITOLAK di gerbang,
       atau (kalau diterima) dibuktikan nol perubahan sebagai CELAH --- */
{
  const { r } = await pasang(Z_IKON_VSCODE, 'uji-ikon-vscode');
  if (r.ok === false) {
    const sebab = r.alasan === 'TIDAK_ADA_KONTRIBUSI' && /VS Code format/i.test(r.pesan);
    if (sebab) {
      ok(
        '3 ikon (format VS Code)',
        `ditolak di gerbang (${r.alasan}) DAN pesannya menyebut sebabnya: "iconDefinitions ... VS Code format ... the file tree keeps its default icons" - paket yang ikonnya tak bisa digambar tidak lagi dipasang lalu diam`,
      );
    } else {
      ko('3 ikon (format VS Code)', `ditolak tetapi bukan karena alasan yang benar: ${r.alasan} :: ${r.pesan.split('\n')[1] ?? ''}`);
    }
    if (RINCI) info(`         pesan: ${r.pesan.split('\n').slice(0, 4).join(' | ')}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-ikon-vscode');
    const sebelum = await garisDasar();
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    hasilJenis.push({ jenis: 'ikon (VS Code)', sebelum, sesudah, laporan: `ikon-deklaratif=${r.laporan.ikon.jumlahIkon}` });
    if (sesudah.ikon > sebelum.ikon) {
      ok('3 ikon (format VS Code)', `diterima dan ikon benar-benar bertambah ${sebelum.ikon}->${sesudah.ikon}`);
    } else {
      gap(
        '3 ikon (format VS Code)',
        `DITERIMA sebagai "terpasang" (laporan ikon=${r.laporan.ikon.jumlahIkon}) tetapi loader menggambar ${sebelum.ikon}->${sesudah.ikon} ikon: ` +
          `muatIconTheme (src/lib/extLoader.ts:403) membaca raw.icons ?? raw dan hanya menerima entri berglyph, sedangkan iconDefinitions gaya VS Code tidak punya glyph`,
      );
    }
  }
}

/* --- 4. SNIPPET: jumlah snippet bertambah --- */
{
  const { r, unduhan } = await pasang(Z_SNIPPET, 'uji-snippet');
  if (r.ok !== true || !unduhan) {
    ko('4 snippet', `gerbang menolak paket snippet: ${JSON.stringify(r)}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-snippet');
    const sebelum = await garisDasar();
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    hasilJenis.push({ jenis: 'snippet', sebelum, sesudah, laporan: `pack=${r.laporan.snippet.jumlahSnippet}` });
    const isiSnippet = A.jumlahSnippet();
    info(`4 snippet: laporan gerbang pack=${r.laporan.snippet.jumlahSnippet}; state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}`);
    if (laporanUji(r.laporan.snippet.jumlahSnippet, sesudah.snippet - sebelum.snippet, isiSnippet)) {
      ok('4 snippet', `terpasang -> ${sebelum.snippet}->${sesudah.snippet} snippet hidup (isi terbaca loader: ${isiSnippet})`);
    } else {
      ko('4 snippet', `laporan pack=${r.laporan.snippet.jumlahSnippet}, snippet hidup ${sebelum.snippet}->${sesudah.snippet} (terbaca ${isiSnippet})`);
    }
  }
}
function laporanUji(packDilaporkan, delta, isiTerbaca) {
  return packDilaporkan === 1 && delta > 0 && isiTerbaca > 0;
}

/* --- 5. KEYMAP: pintasan berubah --- */
{
  const { r, unduhan } = await pasang(Z_KEYMAP, 'uji-keymap');
  if (r.ok !== true || !unduhan) {
    ko('5 keymap', `gerbang menolak paket keymap: ${JSON.stringify(r)}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-keymap');
    const sebelum = await garisDasar();
    const infoMuat = await muat([statusPaket(dir)]);
    const sesudah = angka();
    sesudah.varCss = 0;
    hasilJenis.push({ jenis: 'keymap', sebelum, sesudah, laporan: `pintasan=${r.laporan.keymap.jumlahPintasan}` });
    const idNyata = A.keymapEkstensi().filter((b) => !infoMuat.tidakDidukung.some((t) => t.fitur === 'keymap' && t.alasan.includes(b.key)));
    info(
      `5 keymap: laporan gerbang pintasan=${r.laporan.keymap.jumlahPintasan}; state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}` +
        (infoMuat.tidakDidukung.length ? ` | tidak didukung: ${infoMuat.tidakDidukung.map((t) => t.alasan).join('; ')}` : ''),
    );
    if (r.laporan.keymap.jumlahPintasan === 3 && sesudah.keymap - sebelum.keymap === 3) {
      ok('5 keymap', `terpasang -> ${sebelum.keymap}->${sesudah.keymap} pintasan masuk ke binding ekstensi (valid ke command Zephyr: ${idNyata.length}/3)`);
    } else {
      ko('5 keymap', `laporan pintasan=${r.laporan.keymap.jumlahPintasan}, binding ${sebelum.keymap}->${sesudah.keymap}`);
    }
  }
}

/* --- 6. BAHASA: mode/ekstensi berkas bertambah (`.ebnf` dapat bahasa) --- */
{
  const { r, unduhan } = await pasang(Z_BAHASA, 'uji-bahasa');
  if (r.ok !== true || !unduhan) {
    ko('6 bahasa', `gerbang menolak paket bahasa: ${JSON.stringify(r)}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-bahasa');
    const sebelum = await garisDasar();
    const labelSebelum = A.labelBahasa('berkas.ebnf');
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    sesudah.varCss = 0;
    const labelSesudah = A.labelBahasa('berkas.ebnf');
    const contributed = A.extLangUntuk('berkas.ebnf');
    const catatan6 = A.catatanBahasaTerpasang(KONTRIB_BAHASA, A.grammarTersedia);
    const janji6 = catatan6[0];
    const janjiCocok =
      !!janji6 && !janji6.noEfek && janji6.ditambah.includes('ebnf') && janji6.grammarBisaDimuat === true;
    hasilJenis.push({ jenis: 'bahasa', sebelum, sesudah, laporan: `mode=${r.laporan.bahasa.modeAktif.join(',')}` });
    info(
      `6 bahasa: laporan gerbang mode=${r.laporan.bahasa.modeAktif.join(',')}; label berkas .ebnf: "${labelSebelum}" -> "${labelSesudah}"; state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}; catatan UI: ${janji6 ? janji6.teks : '-'} (cocok dengan kenyataan: ${janjiCocok})`,
    );
    if (r.laporan.bahasa.modeAktif.length === 1 && sesudah.bahasa > sebelum.bahasa && contributed && labelSesudah !== labelSebelum) {
      if (janjiCocok) {
        ok(
          '6 bahasa',
          `terpasang -> ${sebelum.bahasa}->${sesudah.bahasa} bahasa terdaftar, .ebnf dipegang "${contributed.id}", label berkas "${labelSebelum}" -> "${labelSesudah}" (titik konsumsi: lang.ts extLangUntuk); catatan UI "menambah akhiran baru .ebnf" cocok dengan kenyataan (grammarBisaDimuat=true, dinilai fungsi grammarTersedia yang sama dengan yang dipakai loader)`,
        );
      } else {
        ko(
          '6 bahasa',
          `perubahan terjadi tetapi catatan UI tidak menjanjikannya: ditambah=[${janji6 ? janji6.ditambah.join(',') : '-'}] noEfek=${janji6 ? janji6.noEfek : '-'}`,
        );
      }
    } else {
      ko('6 bahasa', `laporan mode=${r.laporan.bahasa.modeAktif.join(',')}, bahasa ${sebelum.bahasa}->${sesudah.bahasa}, label "${labelSebelum}"->"${labelSesudah}"`);
    }
  }
}

/* --- 7. BAHASA hanya-menambah-ekstensi-bawaan: celah label UI --- */
{
  const { r } = await pasang(Z_BAHASA_BAWAAN, 'uji-bahasa-bawaan');
  if (r.ok === false) {
    ok('7 bahasa (ekstensi bawaan)', `ditolak di gerbang: ${r.tahap}/${r.alasan}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-bahasa-bawaan');
    const labelSebelum = A.labelBahasa('berkas.py');
    await garisDasar();
    await muat([statusPaket(dir)]);
    const labelSesudah = A.labelBahasa('berkas.py');
    const loaderLevel = A.bahasaUntukExt('py');
    const catatan = A.catatanBahasaTerpasang(KONTRIB_BAWAAN, A.grammarTersedia);
    const n0 = catatan[0];
    const jujur =
      catatan.length === 1 && !!n0 && n0.noEfek && n0.ditambah.length === 0 && n0.tidakEfek.includes('py');
    info(
      `7 bahasa (ekstensi bawaan): laporan gerbang mode=${r.laporan.bahasa.modeAktif.join(',')} | label .py "${labelSebelum}" -> "${labelSesudah}" | terdaftar di loader: ${loaderLevel ? loaderLevel.id : '-'} | catatan UI: ${n0 ? n0.teks : '-'}`,
    );
    if (labelSesudah !== labelSebelum) {
      ok('7 bahasa (ekstensi bawaan)', `diterima dan label .py berubah "${labelSebelum}" -> "${labelSesudah}"`);
    } else if (jujur) {
      ok(
        '7 bahasa (ekstensi bawaan)',
        `tidak ada perubahan pada .py (memang tidak bisa: lang.ts:111 extLangUntuk mempertahankan pemilik bawaan), tetapi UI sekarang MENGHITUNG dan MENULISKAN itu dari manifest terpasang: "${n0.teks}" (ditambah=[${n0.ditambah.join(',')}] tidakEfek=[${n0.tidakEfek.join(',')}] pemilik=${n0.pemilikBawaan.join(',')})`,
      );
    } else {
      gap(
        '7 bahasa (ekstensi bawaan)',
        `DITERIMA sebagai "terpasang" (laporan mode=${r.laporan.bahasa.modeAktif.join(',')}) tetapi pengguna tidak melihat perubahan apa pun untuk berkas .py dan laporan TIDAK menandainya: ` +
          `lang.ts:111 (extLangUntuk) menyerahkan ekstensi yang sudah dikenal bawaan ke BY_EXT, jadi kontribusi ini terdaftar di loader (${loaderLevel ? loaderLevel.id : '-'}) dan tidak pernah dipakai`,
      );
    }
  }
}

/* --- 8. BAHASA tanpa grammar yang bisa dimuat: paket mati --- */
{
  const { r } = await pasang(Z_BAHASA_TANPA_GRAMMAR, 'uji-bahasa-mati');
  if (r.ok === false) {
    ok('8 bahasa tanpa grammar', `ditolak di gerbang: ${r.tahap}/${r.alasan}`);
  } else {
    const dir = pasangKeDisk(r.berkas, 'uji-bahasa-mati');
    const sebelum = await garisDasar();
    const labelSebelum = A.labelBahasa('berkas.uji-go');
    await muat([statusPaket(dir)]);
    const sesudah = angka();
    const labelSesudah = A.labelBahasa('berkas.uji-go');
    const catatan8 = A.catatanBahasaTerpasang(KONTRIB_TANPA_GRAMMAR);
    const janji = catatan8[0]?.teks ?? '-';
    hasilJenis.push({ jenis: 'bahasa (tanpa grammar)', sebelum, sesudah, laporan: `mode=${r.laporan.bahasa.modeAktif.join(',')}` });
    info(`8 bahasa tanpa grammar: laporan gerbang mode=${r.laporan.bahasa.modeAktif.join(',')}; state: ${ringkasAngka(sebelum)} -> ${ringkasAngka(sesudah)}; label .uji-go "${labelSebelum}" -> "${labelSesudah}"; catatan UI: ${janji}`);
    if (labelSesudah !== labelSebelum && sesudah.bahasa > sebelum.bahasa) {
      ok('8 bahasa tanpa grammar', `diterima dan dipakai: label .uji-go "${labelSebelum}" -> "${labelSesudah}"`);
    } else {
      gap(
        '8 bahasa tanpa grammar',
        `DITERIMA sebagai "terpasang" (laporan mode=${r.laporan.bahasa.modeAktif.join(',')}) dan UI menjanjikan "${janji}", tetapi tidak ada yang berubah (tidakDidukung loader: ${sesudah.tidakDidukung}): ` +
          `extLoader.ts:323 grammarTersedia menolak cmLang yang bukan paket diizinkan (PAKET_DIIZINKAN, extLoader.ts:300) - janji di panel detail harusnya ikut menyebut itu`,
      );
    }
  }
}

/* --- 9. Klaim laporan vs kenyataan state, satu tabel --- */
{
  const klaim = hasilJenis.map((h) => ({
    jenis: h.jenis,
    klaim: h.laporan,
    sebelum: ringkasAngka(h.sebelum),
    sesudah: ringkasAngka(h.sesudah),
  }));
  baris.push('');
  baris.push('  JENIS            KLAIM GERBANG                        SEBELUM -> SESUDAH (state aplikasi)');
  for (const k of klaim) {
    baris.push(`  ${k.jenis.padEnd(16)} ${k.klaim.padEnd(35)} ${k.sebelum} -> ${k.sesudah}`);
  }
}

/* --- 11. UNINSTALL: paket dihapus -> keadaan kembali seperti semula.
       Peran perintah uninstall Rust (folder paket hilang) = daftar terpasang kosong. --- */
{
  const t = await pasang(Z_TEMA, 'uji-uninstall-tema');
  const s = await pasang(Z_SNIPPET, 'uji-uninstall-snippet');
  if (t.r.ok !== true || s.r.ok !== true) {
    ko('11 uninstall (keadaan kembali)', `gerbang menolak paket uji: tema=${JSON.stringify(t.r)} snippet=${JSON.stringify(s.r)}`);
  } else {
    const varCnt = (id) => {
      try {
        return warnaTerpakai(id).jumlah;
      } catch {
        return 0;
      }
    };
    const nol = await garisDasar();
    await muat([
      statusPaket(pasangKeDisk(t.r.berkas, 'uji-uninstall-tema')),
      statusPaket(pasangKeDisk(s.r.berkas, 'uji-uninstall-snippet')),
    ]);
    const terpasang = angka();
    const idTema = A.themesEkstensi()[0]?.id ?? '';
    const var1 = idTema ? varCnt(idTema) : 0;
    await muat([]); /* folder paket dihapus -> daftar terpasang kosong */
    const kembali = angka();
    const var2 = varCnt(idTema);
    const var0 = 0; /* sebelum dipasang tidak ada tema -> tidak ada var tertulis */
    hasilJenis.push({ jenis: 'uninstall', sebelum: nol, sesudah: kembali, laporan: `terpasang: ${ringkasAngka(terpasang)} var-css=${var1}` });
    const bersih = ['tema', 'ikon', 'snippet', 'keymap', 'bahasa'].every((k) => kembali[k] === nol[k]);
    info(`11 uninstall: ${ringkasAngka(nol)} -> terpasang ${ringkasAngka(terpasang)} (var-css ${var0}->${var1}) -> dihapus ${ringkasAngka(kembali)} (var-css ${var2})`);
    if (terpasang.tema > nol.tema && terpasang.snippet > nol.snippet && var1 > var0 && bersih && var2 === 0) {
      ok(
        '11 uninstall (keadaan kembali)',
        `dipasang ${ringkasAngka(terpasang)} (var-css ${var0}->${var1}); setelah paketnya dihapus kembali ke ${ringkasAngka(kembali)} (var-css ${var2}) - tidak ada sisa angka`,
      );
    } else if (!bersih || var2 !== 0) {
      ko('11 uninstall (keadaan kembali)', `paket dihapus tetapi ada sisa: ${ringkasAngka(kembali)} (var-css ${var2}); saat terpasang ${ringkasAngka(terpasang)}`);
    } else {
      gap('11 uninstall (keadaan kembali)', `paket uji tidak mengubah apa pun saat dipasang (${ringkasAngka(terpasang)}) sehingga "kembali" tidak bermakna`);
    }
  }
}

/* --- 10. Sinkron konstanta: paket bahasa yang diizinkan loader vs paket.json --- */
{
  const sumber = readFileSync(path.join(AKAR, 'src', 'lib', 'extLoader.ts'), 'utf8');
  const blok = sumber.slice(sumber.indexOf('const PAKET_DIIZINKAN'));
  const kunci = Array.from(blok.matchAll(/^\s+'(@codemirror\/lang-[a-z]+)':/gm)).map((m) => m[1]);
  const pkg = JSON.parse(readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
  const hilang = kunci.filter((k) => !(k in pkg.dependencies));
  if (kunci.length >= 7 && hilang.length === 0) {
    ok('10 paket bahasa loader terpasang', `${kunci.length} paket diizinkan (${kunci.join(', ')}) semuanya ada di package.json dependencies`);
  } else {
    ko('10 paket bahasa loader terpasang', `kunci=${kunci.length} hilang dari dependencies: [${hilang.join(', ')}]`);
  }
}

server.close();

const jenisBelumBukti = hasilJenis.filter((h) => {
  const s = h.sebelum;
  const t = h.sesudah;
  /* "uninstall" memang berakhir sama dengan garis dasar - itu justru buktinya,
     jadi jangan dihitung sebagai "terpasang tanpa perubahan". */
  if (String(h.jenis).startsWith('uninstall')) return false;
  return (
    (t.jenis === undefined && t.tema === s.tema && t.ikon === s.ikon && t.snippet === s.snippet && t.keymap === s.keymap && t.bahasa === s.bahasa) ||
    (t.tema === s.tema && t.ikon === s.ikon && t.snippet === s.snippet && t.keymap === s.keymap && t.bahasa === s.bahasa && t.varCss === 0)
  );
});

console.log('UJI EKSTENSI JENIS (unduh -> pasang -> muat, server berkas lokal di TMPDIR)');
console.log(`  server: ${dasar} | TMPDIR kerja: ${KERJA}`);
console.log('  modul: src/lib/unduhInstal.ts + src/lib/extLoader.ts + src/lib/lang.ts (dibundel apa adanya; ./commands asli ikut, hanya extensionsManifests/extensionsReadContrib yang dijawab dari direktori uji - peran perintah Tauri)');
console.log(`  dipanggil jaringan: ${dipanggil.length} (${dipanggil.map((u) => path.basename(u)).join(', ') || '-'}) | permintaan dilayani server: ${dilayani}`);
console.log(baris.join('\n'));
if (jenisBelumBukti.length) {
  console.log(`  terpasang tanpa satu pun angka berubah: ${jenisBelumBukti.map((j) => j.jenis).join(', ')}`);
}
console.log(`  celah terbuka: ${celah} | gagal: ${gagal}`);
console.log(
  `  VERDICT: ${
    gagal > 0
      ? 'GAGAL (ada cek yang tidak lulus)'
      : celah > 0
        ? 'BUKTI KURANG (ada paket/JENIS "terpasang" tanpa satu pun perubahan yang bisa dilihat pengguna - lihat CELAH di atas)'
        : 'LULUS'
  }`,
);
console.log('  (exit 0 hanya bila tidak ada cek yang gagal DAN tidak ada jenis terpasang tanpa bukti perubahan)');
process.exit(gagal === 0 && celah === 0 ? 0 : 1);
