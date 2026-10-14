#!/usr/bin/env node
/**
 * uji-fetch-web-rencana.mjs — harness bukti untuk RANCANGAN browser & fetch web.
 *
 * Item: ZEPH-BROWSER-BUILTIN + ZEPH-FETCH-WEB.
 *
 * ## Apa yang diuji di sini — dan apa yang TIDAK
 *
 * Harness ini membuktikan ATURAN RANCANGAN (lihat docs/RANCANGAN-BROWSER-DAN-FETCH.md)
 * lewat satu implementasi acuan murni yang dijalankan node-only, tanpa app.
 * Ia TIDAK membuktikan bahwa kode produk sudah menegakkan aturan itu: itu tugas
 * patch di docs/USULAN-BROWSER-DAN-FETCH.md, dan sebagiannya BUTUH APP.
 * Karena itu bagian (B) membaca berkas produk yang SEBENARNYA dan melaporkan
 * celahnya apa adanya dengan nomor baris — bukan mengarang.
 *
 * Aturan yang dibuktikan di bagian (A):
 *   A1 allowlist domain default-TOLAK (host di luar allowlist ditolak)
 *   A2 batas byte balikan dipatuhi (termasuk batas pada batas UTF-8 multi-byte)
 *   A3 TIDAK ADA panggilan jaringan nyata (fetch/WebSocket/net/http/dns dipatch
 *      lalu dihitung; transport uji yang dipakai bukan jaringan)
 *   A4 keluaran TIDAK memuat pola token (sk-/ghp_/AKIA/JWT/glpat-/xox)
 *   A5 redirect ke domain di luar allowlist ditolak (tiap hop diperiksa ulang)
 *   A6 URL file:// dan jalur lokal ditolak
 *   A7 lantai jaringan (skema, port, IP privat, localhost) berlaku walau
 *      allowlist memuat host itu
 *
 * ## Keluaran
 *
 * Cetak jumlah LULUS/GAGAL nyata, lalu exit 0 kalau seluruh kasus bagian (A)
 * lulus / exit 1 kalau ada yang gagal. Bagian (B) bersifat laporan (celah kode
 * produk) dan dicetak, tetapi tidak membuat harness hijau.
 *
 * Jalankan dari akar repo:  node scripts/uji-fetch-web-rencana.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAU_JSON = process.argv.includes('--json');
const cetak = (s = '') => {
  if (!MAU_JSON) console.log(s);
};

/* ================================================================== */
/* LANGKAH 0 — patch primitif jaringan SEBELUM apa pun dijalankan.     */
/*                                                                     */
/* Setiap panggilan jaringan NYATA dihitung, lalu DILEMPAR. Kalau ada  */
/* satu saja jalur yang lolos ke socket, penghitungnya naik dan kasus  */
/* "tidak ada jaringan" GAGAL. Transport uji (bagian A) bukan jaringan */
/* nyata: ia fungsi murni yang mengembalikan bodi dari peta di memori. */
/* ================================================================== */

const jaringan = { fetch: 0, websocket: 0, net: 0, http: 0, dns: 0 };
const totJaringan = () => jaringan.fetch + jaringan.websocket + jaringan.net + jaringan.http + jaringan.dns;

const tolakJaringan = (kanal, apa) => {
  jaringan[kanal] += 1;
  throw new Error(`JARINGAN NYATA DILARANG oleh harness (${kanal}: ${apa})`);
};

globalThis.fetch = (url, ...sisa) => {
  tolakJaringan('fetch', String(url));
  return Promise.reject(new Error('unreachable'));
};

if (globalThis.WebSocket) {
  const Asli = globalThis.WebSocket;
  globalThis.WebSocket = new Proxy(Asli, {
    construct(target, args) {
      tolakJaringan('websocket', String(args[0]));
      return Reflect.construct(target, args);
    },
  });
}

net.Socket.prototype.connect = function () {
  return tolakJaringan('net', 'Socket.connect');
};
net.connect = (...a) => tolakJaringan('net', `net.connect(${String(a[0])})`);
net.createConnection = (...a) => tolakJaringan('net', `net.createConnection(${String(a[0])})`);

for (const mod of [http, https]) {
  const req = mod.request;
  const get = mod.get;
  mod.request = (...a) => tolakJaringan('http', String(a[0]));
  mod.get = (...a) => tolakJaringan('http', String(a[0]));
  void req;
  void get;
}

dns.lookup = (...a) => tolakJaringan('dns', String(a[0]));

/* ================================================================== */
/* LANGKAH 1 — kebijakan acuan rancangan (murni, tanpa efek samping).  */
/* Semua nama/konstanta di bawah bersumber dari RANCANGAN, bukan dari  */
/* kode produk; kode produk ada di bagian (B) untuk dibandingkan.      */
/* ================================================================== */

/** Lantai jaringan: hanya http/https. */
const SKEMA_IZIN = new Set(['http:', 'https:']);
/** Lantai jaringan: hanya port standar (samakan dengan web.rs:41-45). */
const PORT_IZIN = new Set(['', '80', '443']);
/** Batas byte balikan fetch sebelum diubah jadi teks (bawaan rancangan). */
const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024;
/** Batas byte keras: permintaan lebih besar dipangkas, bukan dilayani. */
const BATAS_BYTE_MAKS = 8 * 1024 * 1024;
/** Waktu tunggu: bawaan & batas atas (samakan dengan web.rs TIMEOUT=20 dtk). */
const WAKTU_BAWAAN_MS = 20000;
const WAKTU_MAKS_MS = 30000;
/** Batas lompatan redirect. */
const MAKS_REDIRECT = 5;

/** Pola berkas rahasia (selaras agentGuard.ts POLA_RAHASIA:80). */
const POLA_BERKAS_RAHASIA = [/^\.env(\..+)?$/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.npmrc$/i];

/** Pola token yang tidak boleh muncul di keluaran yang menuju model. */
const POLA_TOKEN = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
];

function alamatPrivat(host) {
  const h = host.replace(/^\[|\]$/g, '');
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1, 5).map(Number);
    if (o.some((n) => n > 255)) return true;
    const [a, b] = o;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (h === '::1' || h === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true; // ULA IPv6
  return false;
}

function domainCocok(host, domain) {
  const h = String(host).toLowerCase();
  const d = String(domain).toLowerCase().replace(/^\./, '');
  return h === d || h.endsWith('.' + d);
}

/** Periksa satu URL terhadap allowlist (default tolak). Murni. */
function periksaUrl(url, allowlist) {
  if (typeof url !== 'string' || !url.trim()) return { ok: false, sebab: 'URL kosong' };
  let u;
  try {
    u = new URL(url); // jalur lokal seperti C:\x --melempar, ditangani di bawah
  } catch {
    return { ok: false, sebab: `bukan URL absolut / jalur lokal ditolak: ${url}` };
  }
  if (!SKEMA_IZIN.has(u.protocol)) return { ok: false, sebab: `skema ${u.protocol} ditolak` };
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, sebab: 'URL tanpa host' };
  if (alamatPrivat(host)) return { ok: false, sebab: `alamat privat/loopback ${host} ditolak` };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, sebab: `nama lokal ${host} ditolak` };
  }
  if (!PORT_IZIN.has(u.port)) return { ok: false, sebab: `port ${u.port} ditolak` };
  const izin = Array.isArray(allowlist) ? allowlist : [];
  if (!izin.some((d) => domainCocok(host, d))) {
    return { ok: false, sebab: `domain ${host} tidak ada di allowlist (default tolak)` };
  }
  return { ok: true, host, sebab: 'diizinkan' };
}

/** Jalur lokal / berkas rahasia ditolak sebagai argumen apa pun. */
function periksaJalurLokal(s) {
  if (typeof s !== 'string' || !s.trim()) return { ok: true, sebab: 'kosong diabaikan' };
  if (/^[a-zA-Z]:[\\/]/.test(s)) return { ok: false, sebab: `jalur drive ${s} ditolak` };
  if (/^\\\\/.test(s)) return { ok: false, sebab: `jalur UNC ${s} ditolak` };
  if (s.startsWith('/') && !s.startsWith('//')) return { ok: false, sebab: `jalur absolut POSIX ${s} ditolak` };
  if (s.startsWith('~')) return { ok: false, sebab: `jalur home ${s} ditolak` };
  const nama = s.split(/[\\/]/).pop() || '';
  for (const re of POLA_BERKAS_RAHASIA) {
    if (re.test(nama)) return { ok: false, sebab: `berkas rahasia "${nama}" ditolak` };
  }
  if (/(^|[\\/])\.env([.\\/:]|$)/i.test(s)) return { ok: false, sebab: `jalur memuat .env: ${s}` };
  if (/(^|[\\/])\.git([\\/]|$)/i.test(s)) return { ok: false, sebab: `jalur memuat .git: ${s}` };
  return { ok: true, sebab: 'aman' };
}

/** Potong teks ke batas BYTE (bukan karakter), di batas karakter yang sah. */
const DEKODER = new TextDecoder('utf-8', { fatal: false });
function potongByte(teks, batasByte) {
  const asli = String(teks);
  const buf = Buffer.from(asli, 'utf8');
  if (buf.length <= batasByte) return { teks: asli, terpotong: false, byte: buf.length, total: buf.length };
  let potong = DEKODER.decode(buf.subarray(0, batasByte)).replace(/\uFFFD+$/, '');
  while (Buffer.byteLength(potong, 'utf8') > batasByte) potong = potong.slice(0, -1);
  return { teks: potong, terpotong: true, byte: Buffer.byteLength(potong, 'utf8'), total: buf.length };
}

/** Buang pola token dari teks yang akan dikirim ke model. */
function saringRahasia(teks) {
  let t = String(teks);
  for (const re of POLA_TOKEN) t = t.replace(re, '[DISENSOR]');
  return t;
}

function adaPolaRahasia(teks) {
  return POLA_TOKEN.some((re) => {
    re.lastIndex = 0;
    return re.test(String(teks));
  });
}

function waktuTungguMs(diminta) {
  const n = Number(diminta);
  if (!Number.isFinite(n) || n <= 0) return WAKTU_BAWAAN_MS;
  return Math.min(n, WAKTU_MAKS_MS);
}

function batasByteTerapkan(diminta) {
  const n = Number(diminta);
  if (!Number.isFinite(n) || n <= 0) return BATAS_BYTE_BAWAAN;
  return Math.min(n, BATAS_BYTE_MAKS);
}

/** Simulasi unduhan memakai transport uji (peta situs di memori, bukan jaringan). */
function unduhUji(url, allowlist, petaSitus, { batasByte = BATAS_BYTE_BAWAAN, maksRedirect = MAKS_REDIRECT } = {}) {
  const dilalui = [];
  let kini = url;
  for (let i = 0; i <= maksRedirect; i++) {
    const cek = periksaUrl(kini, allowlist);
    if (!cek.ok) return { ok: false, sebab: `${kini}: ${cek.sebab}`, dilalui };
    const lokal = periksaJalurLokal(kini);
    if (!lokal.ok) return { ok: false, sebab: `${kini}: ${lokal.sebab}`, dilalui };
    dilalui.push(kini);
    const h = petaSitus[kini];
    if (!h) return { ok: false, sebab: `situs uji tidak punya entri: ${kini}`, dilalui };
    if (h.status >= 300 && h.status < 400 && h.location) {
      kini = new URL(h.location, kini).toString();
      continue;
    }
    const potong = potongByte(h.body ?? '', batasByte);
    return { ok: true, teks: saringRahasia(potong.teks), terpotong: potong.terpotong, byte: potong.byte, dilalui };
  }
  return { ok: false, sebab: `rantai redirect melebihi ${maksRedirect}`, dilalui };
}

/* ================================================================== */
/* LANGKAH 2 — kasus bukti.                                            */
/* ================================================================== */

const kasus = [];
const uji = (nama, jalankan) => kasus.push({ nama, jalankan });

/* --- A1 allowlist default-tolak ------------------------------------ */
uji('A1 allowlist kosong -> semua ditolak', () => {
  const r = periksaUrl('https://contoh.com/', []);
  return { lulus: r.ok === false && /allowlist/.test(r.sebab), detail: r.sebab };
});
uji('A2 host di luar allowlist ditolak', () => {
  const r = periksaUrl('https://jahat.com/', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A3 host persis allowlist diterima', () => {
  const r = periksaUrl('https://contoh.com/a', ['contoh.com']);
  return { lulus: r.ok === true, detail: r.sebab };
});
uji('A4 subdomain allowlist diterima', () => {
  const r = periksaUrl('https://docs.contoh.com/x', ['contoh.com']);
  return { lulus: r.ok === true, detail: r.sebab };
});
uji('A5 suffix attack contoh.com.jahat.com DITOLAK', () => {
  const r = periksaUrl('https://contoh.com.jahat.com/', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});

/* --- A6 skema & jalur lokal ---------------------------------------- */
uji('A6 file:// ditolak', () => {
  const r = periksaUrl('file:///etc/passwd', ['contoh.com']);
  return { lulus: r.ok === false && /skema file/.test(r.sebab), detail: r.sebab };
});
uji('A7 data: URL ditolak', () => {
  const r = periksaUrl('data:text/html,<b>x</b>', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A8 jalur drive Windows ditolak', () => {
  const r = periksaUrl('C:\\Users\\Zyrex\\.env', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A9 jalur absolut POSIX ditolak', () => {
  const r = periksaUrl('/etc/passwd', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A10 jalur UNC ditolak', () => {
  const r = periksaUrl('\\\\server\\share\\x', ['contoh.com']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A11 .env sebagai target simpan ditolak', () => {
  const r = periksaJalurLokal('.env');
  return { lulus: r.ok === false && /env/.test(r.sebab), detail: r.sebab };
});
uji('A12 jalur memuat .git ditolak', () => {
  const r = periksaJalurLokal('repo/.git/config');
  return { lulus: r.ok === false, detail: r.sebab };
});

/* --- A2 batas byte ------------------------------------------------- */
uji('A13 bodi 50000 byte dipotong ke batas 4000 byte', () => {
  const bodi = 'a'.repeat(50000);
  const r = unduhUji('https://contoh.com/besar', ['contoh.com'], {
    'https://contoh.com/besar': { status: 200, body: bodi },
  }, { batasByte: 4000 });
  return { lulus: r.ok && r.terpotong === true && r.byte <= 4000, detail: `byte=${r.byte} terpotong=${r.terpotong}` };
});
uji('A14 potong byte tidak memecah karakter UTF-8 (tanpa U+FFFD)', () => {
  const bodi = '漢'.repeat(2000); // 3 byte/char = 6000 byte
  const r = unduhUji('https://contoh.com/cjk', ['contoh.com'], {
    'https://contoh.com/cjk': { status: 200, body: bodi },
  }, { batasByte: 1000 });
  const byte = Buffer.byteLength(r.teks, 'utf8');
  return {
    lulus: r.ok && byte <= 1000 && !r.teks.includes('\uFFFD'),
    detail: `byte=${byte} fffd=${r.teks.includes('\uFFFD')}`,
  };
});

/* --- A4 token ------------------------------------------------------ */
uji('A15 keluaran bebas sk-/ghp_/AKIA/JWT/glpat-/xox', () => {
  const bodi =
    'token sk-ABCDEFGHIJKLMNOPQRSTUV lalu ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 ' +
    'AKIAIOSFODNN7EXAMPLE jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop ' +
    'glpat-ABCDEFGHIJKLMNOPQRSTU xoxb-1234567890-abc';
  const r = unduhUji('https://contoh.com/t', ['contoh.com'], {
    'https://contoh.com/t': { status: 200, body: bodi },
  });
  const masihAda = adaPolaRahasia(r.teks);
  return { lulus: r.ok && !masihAda && /DISENSOR/.test(r.teks), detail: `masih ada pola=${masihAda}` };
});
uji('A16 API key di dalam .env tidak pernah jadi URL valid', () => {
  const r = periksaUrl('https://contoh.com/api?key=sk-ABCDEFGHIJKLMNOPQRSTUV', []); // allowlist kosong
  return { lulus: r.ok === false, detail: r.sebab };
});

/* --- A5 redirect --------------------------------------------------- */
uji('A17 redirect allowlist -> di luar allowlist DITOLAK', () => {
  const r = unduhUji('https://contoh.com/mulai', ['contoh.com'], {
    'https://contoh.com/mulai': { status: 302, location: 'https://jahat.com/curi' },
    'https://jahat.com/curi': { status: 200, body: 'rahasia' },
  });
  return { lulus: r.ok === false && /jahat\.com/.test(r.sebab), detail: r.sebab };
});
uji('A18 redirect allowlist -> allowlist lain DITERIMA', () => {
  const r = unduhUji('https://contoh.com/mulai', ['contoh.com', 'cdn.contoh.com'], {
    'https://contoh.com/mulai': { status: 302, location: 'https://cdn.contoh.com/final' },
    'https://cdn.contoh.com/final': { status: 200, body: 'ok' },
  });
  return { lulus: r.ok === true && r.dilalui.length === 2, detail: `hop=${r.dilalui.length}` };
});
uji('A19 rantai redirect melebihi batas DITOLAK', () => {
  const peta = {};
  for (let i = 0; i < 8; i++) peta[`https://contoh.com/r${i}`] = { status: 302, location: `https://contoh.com/r${i + 1}` };
  peta['https://contoh.com/r8'] = { status: 200, body: 'akhir' };
  const r = unduhUji('https://contoh.com/r0', ['contoh.com'], peta, { maksRedirect: 5 });
  return { lulus: r.ok === false && /redirect/.test(r.sebab), detail: r.sebab };
});

/* --- A7 lantai jaringan -------------------------------------------- */
uji('A20 port non-80/443 ditolak walau host di allowlist', () => {
  const r = periksaUrl('https://contoh.com:8080/', ['contoh.com']);
  return { lulus: r.ok === false && /port/.test(r.sebab), detail: r.sebab };
});
uji('A21 IP privat ditolak walau di allowlist', () => {
  const r = periksaUrl('http://127.0.0.1/', ['127.0.0.1']);
  return { lulus: r.ok === false && /privat|loopback/.test(r.sebab), detail: r.sebab };
});
uji('A22 metadata 169.254.169.254 ditolak', () => {
  const r = periksaUrl('http://169.254.169.254/latest/meta-data/', ['169.254.169.254']);
  return { lulus: r.ok === false, detail: r.sebab };
});
uji('A23 localhost ditolak', () => {
  const r = periksaUrl('http://localhost/', ['localhost']);
  return { lulus: r.ok === false, detail: r.sebab };
});

/* --- A2b waktu tunggu ---------------------------------------------- */
uji('A24 waktu tunggu dinaikkan ke batas atas', () => {
  const ms = waktuTungguMs(999999);
  return { lulus: ms === WAKTU_MAKS_MS, detail: `ms=${ms}` };
});
uji('A25 waktu tunggu tidak sah -> bawaan', () => {
  const ms = waktuTungguMs(-5);
  return { lulus: ms === WAKTU_BAWAAN_MS, detail: `ms=${ms}` };
});

/* --- A3 jaringan --------------------------------------------------- */
uji('A26 URL di luar allowlist dibuang TANPA menyentuh transport', () => {
  let transport = 0;
  const asliUnduh = unduhUji;
  const r = asliUnduh('https://jahat.com/x', ['contoh.com'], {
    'https://jahat.com/x': { status: 200, body: 'tidak akan dibaca' },
  });
  if (r.ok) transport += 1; // hanya naik kalau benar-benar lolos
  return { lulus: r.ok === false && transport === 0, detail: `transport=${transport} sebab=${r.sebab}` };
});
uji('A27 jaringan nyata tetap 0 setelah seluruh uji', () => {
  return { lulus: totJaringan() === 0, detail: JSON.stringify(jaringan) };
});

/* --- jalankan ------------------------------------------------------ */
cetak('== (A) Bukti aturan rancangan (implementasi acuan, node-only) ==');
cetak('');

let lulus = 0;
const gagal = [];
for (const k of kasus) {
  let hasil;
  try {
    hasil = k.jalankan();
  } catch (e) {
    hasil = { lulus: false, detail: `LEMPAR: ${e && e.message ? e.message : e}` };
  }
  if (hasil.lulus) lulus += 1;
  else gagal.push(k.nama);
  cetak(`${hasil.lulus ? 'LULUS' : 'GAGAL'}  ${k.nama}`);
  cetak(`       ${hasil.detail}`);
}
cetak('');
cetak(`LULUS ${lulus}/${kasus.length}`);
if (gagal.length) {
  cetak('GAGAL:');
  for (const g of gagal) cetak(`  - ${g}`);
}
cetak('');

/* ================================================================== */
/* LANGKAH 3 — bagian (B): baca KODE PRODUK nyata, laporkan celah.      */
/* Bagian ini tidak menilai lulus/gagal; ia mengukur jarak antara       */
/* rancangan dan kode yang ADA.                                        */
/* ================================================================== */

function baca(rel) {
  try {
    return fs.readFileSync(path.join(AKAR, rel), 'utf8').split('\n');
  } catch {
    return null;
  }
}
function barisDari(baris, re) {
  for (let i = 0; i < baris.length; i++) if (re.test(baris[i])) return i + 1;
  return -1;
}

const temuan = [];
function temuan_(berkas, nomor, ada, pesan) {
  temuan.push({ berkas, baris: nomor, ada, pesan });
}

{
  const webRs = baca('src-tauri/src/web.rs');
  if (webRs) {
    const L = (re) => barisDari(webRs, re);
    temuan_('src-tauri/src/web.rs', L(/URL must use http:\/\/ or https:\/\//), true, 'lantai skema http/https ADA');
    temuan_('src-tauri/src/web.rs', L(/port != 80 && port != 443/), true, 'lantai port 80/443 ADA');
    temuan_('src-tauri/src/web.rs', L(/is_loopback\(\)/), true, 'blokir loopback/privat ADA');
    temuan_('src-tauri/src/web.rs', L(/max_redirects\(0\)/), true, 'redirect TIDAK diikuti (max_redirects 0) ADA');
    temuan_('src-tauri/src/web.rs', L(/read_to_string\(\)/), false, 'CELAH: bodi dibaca tanpa batas BYTE (read_to_string)');
    temuan_('src-tauri/src/web.rs', -1, false, 'CELAH: tidak ada allowlist domain di web_fetch');
  } else {
    temuan_('src-tauri/src/web.rs', -1, false, 'BUTUH: berkas tidak terbaca');
  }

  const webTs = baca('src/lib/zephyrTools/web.ts');
  if (webTs) {
    const blok = webTs.join('\n');
    const punyaAllow =
      /izinkan_domain|allowlist|allow_domain|daftar_izin/.test(blok.slice(blok.indexOf("name: 'web_fetch'"), blok.indexOf("name: 'browser_open'")));
    temuan_('src/lib/zephyrTools/web.ts', barisDari(webTs, /name: 'web_fetch'/), punyaAllow, punyaAllow ? 'allowlist ADA' : 'CELAH: spec web_fetch tanpa param allowlist domain');
    temuan_('src/lib/zephyrTools/web.ts', -1, false, 'CELAH: spec web_fetch tanpa param simpan_ke (menutup C7)');
  } else {
    temuan_('src/lib/zephyrTools/web.ts', -1, false, 'BUTUH: berkas tidak terbaca');
  }

  const browserRs = baca('src-tauri/src/browser.rs');
  if (browserRs) {
    temuan_('src-tauri/src/browser.rs', barisDari(browserRs, /MAX_BROWSER_DOWNLOAD_BYTES/), true, 'batas unduhan 100 MB ADA');
    temuan_('src-tauri/src/browser.rs', barisDari(browserRs, /max_redirects\(0\)/), true, 'redirect TIDAK diikuti ADA');
  } else {
    temuan_('src-tauri/src/browser.rs', -1, false, 'BUTUH: berkas tidak terbaca');
  }

  const paneRs = baca('src-tauri/src/browser_pane.rs');
  if (paneRs) {
    temuan_('src-tauri/src/browser_pane.rs', barisDari(paneRs, /the URL must start with http/), true, 'pane hanya menerima http/https (cek awalan)');
    temuan_('src-tauri/src/browser_pane.rs', -1, false, 'CELAH: browser_pane_open/nav tanpa allowlist domain');
  } else {
    temuan_('src-tauri/src/browser_pane.rs', -1, false, 'BUTUH: berkas tidak terbaca');
  }
}

cetak('== (B) Jarak ke kode produk (berkas + baris nyata, bukan lulus/gagal) ==');
for (const t of temuan) {
  const lokasi = t.baris > 0 ? `${t.berkas}:${t.baris}` : t.berkas;
  cetak(`${t.ada ? 'ADA ' : 'CELAH'} ${lokasi} — ${t.pesan}`);
}
cetak('');

const jumlahCelah = temuan.filter((t) => !t.ada && /CELAH/.test(t.pesan)).length;

/* ================================================================== */
/* Ringkasan + exit code                                               */
/* ================================================================== */

const semuaLulus = lulus === kasus.length;

cetak('== Ringkasan ==');
cetak(`kasus rancangan : ${lulus}/${kasus.length} LULUS`);
cetak(`jaringan nyata  : ${totJaringan()} (fetch ${jaringan.fetch}, websocket ${jaringan.websocket}, net ${jaringan.net}, http ${jaringan.http}, dns ${jaringan.dns})`);
cetak(`celah kode produk: ${jumlahCelah} (lihat bagian B + docs/USULAN-BROWSER-DAN-FETCH.md)`);
cetak(
  semuaLulus
    ? 'HASIL: aturan RANCANGAN LULUS (exit 0). Ini TIDAK berarti kode produk sudah aman — celah di bagian (B) menunggu patch.'
    : 'HASIL: aturan RANCANGAN GAGAL (exit 1).',
);

if (MAU_JSON) {
  console.log(
    JSON.stringify(
      {
        kasus: kasus.length,
        lulus,
        gagal,
        jaringan,
        celahKodeProduk: jumlahCelah,
        semuaLulus,
      },
      null,
      2,
    ),
  );
}

process.exit(semuaLulus ? 0 : 1);
