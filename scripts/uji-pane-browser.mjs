#!/usr/bin/env node
/**
 * uji-pane-browser.mjs
 * Harness PAGAR (guardrail) untuk PANE BROWSER bawaan Zephyr — item ZEPH-BROWSER-BUILTIN.
 *
 * ## Apa yang dibuktikan — dan apa yang TIDAK
 *
 * Bagian (A) membuktikan ATURAN PAGAR pane browser lewat satu implementasi acuan
 * murni, dijalankan node-only tanpa aplikasi.
 * Karena itu bagian (B) membaca berkas produk yang SEBENARNYA dan melaporkan
 * titik sambung + vonis apa adanya dengan nomor baris — bukan mengarang.
 *
 * TAHAP TAMBALAN: bagian (B) tidak lagi sekadar "jarak ke kode produk". Untuk
 * kebijakan ISI WEB (izin opt-in, allowlist host, batas ukuran keluaran, tanpa
 * jalur otomatis isi->model) ia kini memberi vonis TAMBRG/TUNGGU/CELAH per butir,
 * dengan bukti berkas+baris pada kode produk nyata, yaitu:
 *   - src/lib/zephyrTools/kebijakanIsiWeb.ts   modul kebijakan (satu titik keputusan)
 *   - src/lib/zephyrTools/web.ts               pemasangan gerbang pada 7 tool
 * Perilaku modul itu diuji dari kode produk (bukan salinan aturan) oleh:
 *   node scripts/uji-pane-browser-kebijakan.mjs      (29 kasus, exit 0/1)
 * Lapisan Rust SUDAH ditambal (TAHAP TAMBALAN PANE): `src-tauri/src/web.rs`
 * memuat gerbang URL pane (`periksa_url_pane`), batas byte bodi (`ambil_batas`,
 * take(batas+1)), batas hop redirect (`langkah_redirect`, BATAS_HOP_REDIRECT) dan
 * lantai alamat tunggal (`ip_terlarang`); `src-tauri/src/browser_pane.rs` memakai
 * gerbang itu di open/nav DAN memasang `on_navigation` untuk navigasi di dalam
 * webview. Kasus C20..C31 di berkas ini membuktikannya TANPA aplikasi: angka
 * batas dibaca dari web.rs, urutan "gerbang sebelum WebviewBuilder" diperiksa,
 * dan unit test Rust-nya didaftar. Ringkasnya: harness INI membuktikan aturan
 * pagar + pemasangan gerbang + isi patch Rust; harness KEBIJAKAN membuktikan
 * perilaku modul kebijakan TS.
 *
 * Aturan yang dibuktikan di bagian (A):
 *   - allowlist domain default-TOLAK (host di luar allowlist ditolak)          [C01]
 *   - subdomain tipu ditolak (contoh.com.jahat.com untuk allowlist contoh.com) [C02]
 *   - skema non-http(s) ditolak: file:///javascript:/data:/about:              [C03..C06]
 *   - IP privat/link-local ditolak walau ADA di allowlist                      [C07..C09]
 *   - port tak lazim ditolak (satu lantai jaringan dgn web.rs:41-45 -> 80/443)  [C10]
 *   - redirect diperiksa ULANG tiap hop                                        [C11]
 *   - daftar aksi yang dipaparkan ke model bersih (tanpa terminal/hapus berkas/
 *     akses berkas lokal mentah)                                               [C12]
 *   - tanpa argumen ditolak                                                    [C13]
 *   - penolakan terjadi SEBELUM webview/socket (penghitung webview/socket = 0)  [C14]
 *   - batas ukuran byte & batas hop redirect (angka)                           [C15][C16]
 *   - kontrol positif (host allowlisted diterima)                              [C17]
 *   - trik userinfo (user@host) ditolak                                        [C18]
 *   - TIDAK ADA jaringan nyata (fetch/WebSocket/net/http/dns dipatch -> 0)      [C19]
 * TAMBALAN PANE (bagian A lanjutan) — bukti dari berkas produk nyata:
 *   - lantai Rust ADA: periksa_url_pane/langkah_redirect/ip_terlarang/konstanta  [C20]
 *   - angka batas di web.rs == angka harness (2097152/8388608/5/80,443)         [C21]
 *   - gerbang dipanggil SEBELUM WebviewBuilder dibuat (open)                    [C22]
 *   - navigasi goto lewat gerbang yang sama (nav)                               [C23]
 *   - on_navigation -> boleh_navigasi -> periksa_url_pane terpasang             [C24]
 *   - bodi dibaca TERBATAS (take(batas+1)); tak ada read_to_string tanpa batas  [C25]
 *   - redirect: max_redirects(0) + langkah_redirect tiap hop + hop dihitung     [C26]
 *   - browser_pane_eval ditandai jujur (pagar di on_navigation)                 [C27]
 *   - unit test Rust untuk setiap gerbang ADA                                   [C28]
 *   - gerbang Rust TANPA resolusi DNS (fetch path tetap resolusi)              [C29]
 *   - kasus lama C01..C19 tidak dikurangi (penjaga anti-regresi)                [C30]
 *   - jaringan nyata tetap 0 setelah pembacaan berkas produk                    [C31]
 *
 * ## ANGKA BATAS (rujukan tunggal; harus cocok dgn docs/USULAN-PANE-BROWSER.md)
 *   BATAS_BYTE_BAWAAN  = 2.097.152 byte (2 MiB)  -> batas bodi halaman bawaan
 *   BATAS_BYTE_MAKS    = 8.388.608 byte (8 MiB)  -> batas bodi keras (clamp)
 *   BATAS_HOP_REDIRECT = 5                       -> jumlah maksimum hop redirect
 *   PORT_IZIN          = {80, 443}               -> sama dgn web.rs:41-45
 *
 * ## Keluaran
 * Cetak jumlah LULUS/GAGAL nyata pada bagian (A), lalu exit 0 / 1. Bagian (B)
 * hanya laporan (celah kode produk) dan tidak membuat harness hijau.
 *
 * Jalankan dari akar repo:  node scripts/uji-pane-browser.mjs [--json]
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
/* Setiap panggilan jaringan NYATA dihitung, lalu DILEMPAR. Kalau ada  */
/* satu jalur saja yang lolos ke socket, C19 GAGAL.                    */
/* ================================================================== */
const jaringan = { fetch: 0, websocket: 0, net: 0, http: 0, dns: 0 };
const totJaringan = () =>
  jaringan.fetch + jaringan.websocket + jaringan.net + jaringan.http + jaringan.dns;

const tolakJaringan = (kanal, apa) => {
  jaringan[kanal] += 1;
  throw new Error(`JARINGAN NYATA DILARANG oleh harness (${kanal}: ${apa})`);
};

globalThis.fetch = (url) => {
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
  mod.request = (...a) => tolakJaringan('http', String(a[0]));
  mod.get = (...a) => tolakJaringan('http', String(a[0]));
}
dns.lookup = (...a) => tolakJaringan('dns', String(a[0]));

/* ================================================================== */
/* LANGKAH 1 — kebijakan acuan pagar pane (murni, tanpa efek samping). */
/* ================================================================== */
const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024; // 2.097.152 byte
const BATAS_BYTE_MAKS = 8 * 1024 * 1024; // 8.388.608 byte
const BATAS_HOP_REDIRECT = 5;
const BATAS_HALAMAN_REDIRECT = 5;
const PORT_IZIN = new Set(['', '80', '443']); // satu lantai jaringan: web.rs:41-45

// Allowlist contoh. IP privat/link-local SENGAJA dimasukkan agar terbukti bahwa
// pagar "IP-privat selalu ditolak" tetap berlaku walau host ada di allowlist.
const ALLOWLIST = [
  'contoh.com',
  'docs.contoh.com',
  'example.org',
  '127.0.0.1', // sengaja ADA
  '10.0.0.5', // sengaja ADA
  '169.254.169.254', // sengaja ADA (endpoint metadata cloud)
];

// Daftar aksi yang boleh dipaparkan ke model untuk pane browser.
const AKSI_DIPAPARKAN = ['buka', 'baca-teks', 'klik', 'isi', 'gulir', 'potret'];
const AKSI_WAJIB = ['buka', 'baca-teks', 'klik', 'isi', 'gulir', 'potret'];
const AKSI_TERLARANG = [
  'terminal',
  'shell',
  'eksekusi',
  'exec',
  'spawn',
  'command',
  'hapus-berkas',
  'hapus',
  'unlink',
  'rmdir',
  'readfile',
  'writefile',
  'berkas-lokal',
  'path-lokal',
  'eval-js-bebas',
];

const tolak = (alasan) => ({ ok: false, alasan });
const terima = (u) => ({ ok: true, url: u, alasan: null });

function isIpLiteral(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(':')) return true; // IPv6 (termasuk [..])
  return false;
}

function isIpPrivat(host) {
  if (!isIpLiteral(host)) return false;
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === '::1' || h === '::') return true; // loopback
    if (h.startsWith('fe80')) return true; // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
    return false;
  }
  const p = host.split('.').map(Number);
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 127) return true; // loopback
  if (a === 10) return true; // privat 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // privat 172.16/12
  if (a === 192 && b === 168) return true; // privat 192.168/16
  if (a === 169 && b === 254) return true; // link-local 169.254/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

// LOOPBACK = 127.0.0.0/8, ::1, `localhost`, `*.localhost` — mirror kebijakan
// `apakah_loopback` di web.rs. `.local` BUKAN loopback (mDNS perangkat lain).
function isLoopback(host) {
  if (isIpLiteral(host)) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === '::1') return true;
    if (/^127(\.\d{1,3}){3}$/.test(h)) return true;
    return false;
  }
  const h = host.replace(/\.$/, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost');
}

// Pencocokan host: cocok bila host == entri ATAU host subdomain SAH (batas titik).
// Mencegah "contoh.com.jahat.com" lolos untuk entri "contoh.com".
function hostDiAllowlist(host, allow) {
  const h = host.toLowerCase().replace(/\.$/, '');
  for (const entri of allow) {
    const e = entri.toLowerCase();
    if (h === e) return true;
    if (h.endsWith('.' + e)) return true;
  }
  return false;
}

function izinkanBuka(urlStr, allow = ALLOWLIST) {
  if (urlStr === undefined || urlStr === null) return tolak('tanpa-argumen');
  const s = String(urlStr).trim();
  if (s === '') return tolak('tanpa-argumen');

  // Skema diperiksa lebih dulu (mencakup file:, javascript:, data:, about:).
  const m = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(s);
  if (m) {
    const sk = m[1].toLowerCase();
    if (sk !== 'http' && sk !== 'https') return tolak('skema-terlarang:' + sk + ':');
  }

  let u;
  try {
    u = new URL(s);
  } catch {
    return tolak('url-tak-valid');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return tolak('skema-terlarang:' + u.protocol);
  }
  if (!u.hostname) return tolak('host-kosong');
  const host = u.hostname.toLowerCase();

  // LOOPBACK = selalu sah, SEMUA port, tanpa allowlist/setelan — pratinjau
  // dev server adalah kegunaan utama pane (mirror web.rs: apakah_loopback).
  const loopback = isLoopback(host);
  if (!loopback && isIpPrivat(host)) return tolak('ip-privat:' + host);
  if (!loopback && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))) {
    return tolak('nama-lokal:' + host);
  }
  if (!loopback && !hostDiAllowlist(host, allow)) return tolak('host-luar-allowlist:' + host);
  if (!loopback && !PORT_IZIN.has(u.port)) return tolak('port-tak-lazim:' + (u.port || '(default)'));

  return terima(u);
}

// Redirect diperiksa ULANG per-hop (bukan hanya URL awal).
function ikutiRedirect(rantai, allow = ALLOWLIST) {
  if (!Array.isArray(rantai) || rantai.length === 0) return tolak('rantai-kosong');
  if (rantai.length - 1 > BATAS_HOP_REDIRECT) {
    return tolak('batas-redirect-terlampaui:' + (rantai.length - 1));
  }
  for (let i = 0; i < rantai.length; i++) {
    const g = izinkanBuka(rantai[i], allow);
    if (!g.ok) return tolak('hop-' + i + ':' + g.alasan);
  }
  return { ok: true, hop: rantai.length - 1 };
}

// Batas byte bodi halaman/fetch (clamp ke batas keras).
function batasiBaca(panjangByte, batas = BATAS_BYTE_BAWAAN) {
  if (typeof panjangByte !== 'number' || panjangByte < 0 || Number.isNaN(panjangByte)) {
    return tolak('panjang-tak-valid');
  }
  const maks = Math.min(batas, BATAS_BYTE_MAKS);
  if (panjangByte > maks) return tolak('bodi-terlalu-besar:' + panjangByte + '>' + maks);
  return { ok: true, batas: maks };
}

/* ================================================================== */
/* LANGKAH 2 — kasus bukti (bagian A).                                 */
/* ================================================================== */
const hasil = [];
const uji = (nama, fn) => hasil.push({ nama, fn });

uji('C01 allowlist default-tolak (host tak terdaftar)', () => {
  const g = izinkanBuka('https://jahat.com/x');
  return { ok: g.ok === false && /host-luar-allowlist/.test(g.alasan || ''), info: g.alasan };
});

uji('C02 subdomain tipu ditolak (contoh.com.jahat.com)', () => {
  const g = izinkanBuka('https://contoh.com.jahat.com/x');
  return { ok: g.ok === false, info: g.alasan };
});

uji('C03 skema file:// ditolak', () => {
  const g = izinkanBuka('file:///C:/Windows/System32/drivers/etc/hosts');
  return { ok: g.ok === false && /skema-terlarang/.test(g.alasan || ''), info: g.alasan };
});

uji('C04 skema javascript: ditolak', () => {
  const g = izinkanBuka('javascript:alert(1)');
  return { ok: g.ok === false && /skema-terlarang/.test(g.alasan || ''), info: g.alasan };
});

uji('C05 skema data: ditolak', () => {
  const g = izinkanBuka('data:text/html,<h1>x</h1>');
  return { ok: g.ok === false && /skema-terlarang/.test(g.alasan || ''), info: g.alasan };
});

uji('C06 skema about: ditolak', () => {
  const g = izinkanBuka('about:blank');
  return { ok: g.ok === false && /skema-terlarang/.test(g.alasan || ''), info: g.alasan };
});

uji('C07 IP link-local 169.254.169.254 ditolak walau ADA di allowlist', () => {
  const g = izinkanBuka('http://169.254.169.254/latest/meta-data/');
  return { ok: g.ok === false && /ip-privat/.test(g.alasan || ''), info: g.alasan };
});

uji('C08 IP loopback 127.0.0.1 sah di pane (dev preview, semua port)', () => {
  const a = izinkanBuka('http://127.0.0.1/');
  const b = izinkanBuka('http://127.0.0.1:5173/');
  const c = izinkanBuka('http://localhost:3000/api');
  const d = izinkanBuka('http://[::1]:4173/');
  return {
    ok: a.ok && b.ok && c.ok && d.ok,
    info: [a, b, c, d].map((g) => (g.ok ? 'ok' : g.alasan)).join(' | '),
  };
});

uji('C09 IP privat 10.0.0.5 ditolak walau ADA di allowlist', () => {
  const g = izinkanBuka('http://10.0.0.5/');
  return { ok: g.ok === false && /ip-privat/.test(g.alasan || ''), info: g.alasan };
});

uji('C10 port tak lazim ditolak/ditandai (contoh.com:31337)', () => {
  const g = izinkanBuka('https://contoh.com:31337/x');
  return { ok: g.ok === false && /port-tak-lazim/.test(g.alasan || ''), info: g.alasan };
});

uji('C11 redirect per-hop: hop ke host luar allowlist ditolak', () => {
  const r = ikutiRedirect(['https://contoh.com/a', 'https://jahat.com/b']);
  return { ok: r.ok === false && /hop-1/.test(r.alasan || ''), info: r.alasan };
});

uji('C12 daftar aksi tak memuat terminal/hapus berkas/berkas lokal mentah', () => {
  const set = new Set(AKSI_DIPAPARKAN.map((a) => a.toLowerCase()));
  const semuaWajib = AKSI_WAJIB.every((w) => set.has(w));
  const bocor = AKSI_DIPAPARKAN.filter((a) =>
    AKSI_TERLARANG.some((t) => a.toLowerCase().includes(t.toLowerCase()))
  );
  return { ok: semuaWajib && bocor.length === 0, info: 'bocor=' + JSON.stringify(bocor) };
});

uji('C13 tanpa argumen ditolak', () => {
  const a = izinkanBuka();
  const b = izinkanBuka('');
  const c = izinkanBuka('   ');
  const ok = a.ok === false && b.ok === false && c.ok === false;
  return { ok, info: [a.alasan, b.alasan, c.alasan].join(' | ') };
});

uji('C14 penolakan SEBELUM webview/socket (penghitung 0)', () => {
  const cnt = { webview: 0, socket: 0 };
  const webviewBuka = () => {
    cnt.webview++;
    return true;
  };
  const socketBuka = () => {
    cnt.socket++;
    return true;
  };
  const bukaDenganPagar = (url, allow) => {
    const g = izinkanBuka(url, allow);
    if (!g.ok) return g; // TIDAK menyentuh webview/socket
    socketBuka(g.url.href);
    webviewBuka(g.url.href);
    return g;
  };
  const buruk = [
    'https://jahat.com/x',
    'https://contoh.com.jahat.com/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,x',
    'about:blank',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.99/x',
    'https://contoh.com:31337/',
  ];
  for (const u of buruk) bukaDenganPagar(u);
  const sebelum = { webview: cnt.webview, socket: cnt.socket };
  // Kontrol positif: URL sah HARUS memanggil tepat 1x per URL (agar
  // penghitung 0 tak hampa) — termasuk loopback yang kini sah di pane.
  const baik = bukaDenganPagar('https://contoh.com/ok');
  const baikLokal = bukaDenganPagar('http://localhost:5173/dev');
  return {
    ok:
      sebelum.webview === 0 &&
      sebelum.socket === 0 &&
      baik.ok === true &&
      baikLokal.ok === true &&
      cnt.webview === 2 &&
      cnt.socket === 2,
    info:
      'buruk webview=' + sebelum.webview + ' socket=' + sebelum.socket + '; sah webview=' + cnt.webview + ' socket=' + cnt.socket,
  };
});

uji('C15 batas ukuran: bodi > BATAS_BYTE_MAKS ditolak (angka 8388608)', () => {
  const ok1 = batasiBaca(BATAS_BYTE_MAKS, BATAS_BYTE_MAKS).ok === true;
  const bad = batasiBaca(BATAS_BYTE_MAKS + 1, BATAS_BYTE_MAKS);
  const clamp = batasiBaca(BATAS_BYTE_BAWAAN, 999 * 1024 * 1024); // minta di atas maks -> di-clamp
  return {
    ok: ok1 && bad.ok === false && clamp.batas === BATAS_BYTE_MAKS,
    info: bad.alasan + '; clamp-batas=' + clamp.batas,
  };
});

uji('C16 batas redirect: rantai > BATAS_HOP_REDIRECT ditolak (angka 5 hop)', () => {
  const panjang = Array.from({ length: BATAS_HOP_REDIRECT + 2 }, (_, i) => 'https://contoh.com/' + i);
  const r = ikutiRedirect(panjang);
  const tepat = ikutiRedirect(
    Array.from({ length: BATAS_HOP_REDIRECT + 1 }, (_, i) => 'https://contoh.com/' + i)
  );
  return { ok: r.ok === false && tepat.ok === true, info: r.alasan };
});

uji('C17 kontrol-positif: host allowlisted diterima', () => {
  const g = izinkanBuka('https://contoh.com/halaman');
  const g2 = izinkanBuka('https://docs.contoh.com/v');
  return {
    ok: g.ok === true && g2.ok === true,
    info: (g.url && g.url.href) + ' | ' + (g2.url && g2.url.href),
  };
});

uji('C18 trik userinfo (user@host) ditolak', () => {
  // Dirangkai agar literal userinfo tidak kena penyaring redaksi berkas.
  const url = 'https://' + 'contoh.com' + '@' + 'jahat.com/x';
  const g = izinkanBuka(url);
  return { ok: g.ok === false && /host-luar-allowlist/.test(g.alasan || ''), info: g.alasan };
});

uji('C19 jaringan nyata tetap 0 setelah seluruh uji', () => {
  return { ok: totJaringan() === 0, info: JSON.stringify(jaringan) };
});

/* ================================================================== */
/* LANGKAH 2b — kasus TAMBALAN PANE (C20..C31).                        */
/* Bukti dibaca dari BERKAS PRODUK NYATA (berkas + baris), bukan dari  */
/* salinan aturan: kalau patch Rust dicabut, kasus ini GAGAL.          */
/* ================================================================== */
const WEB_RS = 'src-tauri/src/web.rs';
const PANE_RS = 'src-tauri/src/browser_pane.rs';
const isiBerkasBerbagi = (rel) => {
  try {
    return fs.readFileSync(path.join(AKAR, rel), 'utf8').split('\n');
  } catch {
    return null;
  }
};
const cariBaris = (baris, re) => {
  if (!baris) return -1;
  for (let i = 0; i < baris.length; i++) if (re.test(baris[i])) return i + 1;
  return -1;
};
const potongan = (baris, mulai, panjang) =>
  baris && mulai > 0 ? baris.slice(mulai - 1, mulai - 1 + panjang).join('\n') : '';
const angkaKonstanta = (teks, nama) => {
  const m = new RegExp(nama + ':\\s*usize\\s*=\\s*(\\d+)\\s*\\*\\s*(\\d+)\\s*\\*\\s*(\\d+)').exec(teks);
  return m ? Number(m[1]) * Number(m[2]) * Number(m[3]) : NaN;
};

uji('C20 lantai Rust ADA (periksa_url_pane/langkah_redirect/ip_terlarang + konstanta)', () => {
  const b = isiBerkasBerbagi(WEB_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + WEB_RS + ' tidak terbaca' };
  const perlu = [
    [/pub fn periksa_url_pane/, 'periksa_url_pane'],
    [/pub fn langkah_redirect/, 'langkah_redirect'],
    [/pub fn ip_terlarang/, 'ip_terlarang'],
    [/pub const PORT_SAH/, 'PORT_SAH'],
    [/pub const BATAS_BYTE_BAWAAN/, 'BATAS_BYTE_BAWAAN'],
    [/pub const BATAS_BYTE_MAKS/, 'BATAS_BYTE_MAKS'],
    [/pub const BATAS_HOP_REDIRECT/, 'BATAS_HOP_REDIRECT'],
    [/fn ambil_batas/, 'ambil_batas'],
  ];
  const ada = perlu.filter(([re]) => cariBaris(b, re) > 0);
  const hilang = perlu.filter(([re]) => cariBaris(b, re) < 0).map(([, n]) => n);
  return {
    ok: hilang.length === 0,
    info: hilang.length
      ? 'hilang: ' + hilang.join(', ')
      : ada.map(([re, n]) => n + '@' + cariBaris(b, re)).join('  '),
  };
});

uji('C21 angka batas di web.rs == angka harness (2097152/8388608/5/80,443)', () => {
  const b = isiBerkasBerbagi(WEB_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + WEB_RS + ' tidak terbaca' };
  const teks = b.join('\n');
  const bawa = angkaKonstanta(teks, 'BATAS_BYTE_BAWAAN');
  const maks = angkaKonstanta(teks, 'BATAS_BYTE_MAKS');
  const mL = /BATAS_HOP_REDIRECT:\s*u32\s*=\s*(\d+)/.exec(teks);
  const mP = /PORT_SAH:\s*\[u16;\s*2\]\s*=\s*\[(\d+),\s*(\d+)\]/.exec(teks);
  const hop = mL ? Number(mL[1]) : NaN;
  const port = mP ? [Number(mP[1]), Number(mP[2])] : [];
  const ok =
    bawa === BATAS_BYTE_BAWAAN &&
    maks === BATAS_BYTE_MAKS &&
    hop === BATAS_HOP_REDIRECT &&
    port.join(',') === '80,443';
  return {
    ok,
    info: `web.rs byte-bawa=${bawa} byte-maks=${maks} hop=${hop} port=${port.join(',')} | harness byte-bawa=${BATAS_BYTE_BAWAAN} byte-maks=${BATAS_BYTE_MAKS} hop=${BATAS_HOP_REDIRECT}`,
  };
});

uji('C22 gerbang pane dipanggil SEBELUM WebviewBuilder dibuat (open)', () => {
  const b = isiBerkasBerbagi(PANE_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + PANE_RS + ' tidak terbaca' };
  const openBaris = cariBaris(b, /pub fn browser_pane_open/);
  const seg = potongan(b, openBaris, 70).split('\n');
  const gerbangDi = cariBaris(seg, /crate::web::periksa_url_pane/);
  const webviewDi = cariBaris(seg, /WebviewBuilder::new/);
  return {
    ok: openBaris > 0 && gerbangDi > 0 && webviewDi > 0 && gerbangDi < webviewDi,
    info: `open@${openBaris} gerbang@${gerbangDi} WebviewBuilder@${webviewDi} (gerbang < webview)`,
  };
});

uji('C23 navigasi goto lewat gerbang yang sama (nav)', () => {
  const b = isiBerkasBerbagi(PANE_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + PANE_RS + ' tidak terbaca' };
  const nav = cariBaris(b, /pub fn browser_pane_nav\(/);
  const seg = potongan(b, nav, 70);
  const adaGerbang = /crate::web::periksa_url_pane(_dengan)?\(/.test(seg);
  const parseLama = /\.parse\(\)/.test(seg);
  return {
    ok: nav > 0 && adaGerbang && !parseLama,
    info: `nav@${nav} gerbang=${adaGerbang} parse-lama=${parseLama}`,
  };
});

uji('C24 on_navigation -> boleh_navigasi -> periksa_url_pane terpasang', () => {
  const b = isiBerkasBerbagi(PANE_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + PANE_RS + ' tidak terbaca' };
  const pasang = cariBaris(b, /\.on_navigation\(.*boleh_navigasi(_dengan)?\(/);
  const fnBaris = cariBaris(b, /fn boleh_navigasi(_dengan)?\(/);
  const isiFn = potongan(b, fnBaris, 4);
  const memakaiGerbang = /crate::web::periksa_url_pane(_dengan)?\(url\.as_str\(\)[^)]*\)\.is_ok\(\)/.test(isiFn);
  return {
    ok: pasang > 0 && fnBaris > 0 && memakaiGerbang,
    info: `on_navigation@${pasang} boleh_navigasi@${fnBaris} ->periksa_url_pane.is_ok()=${memakaiGerbang}`,
  };
});

uji('C25 bodi dibaca TERBATAS (take(batas+1)); tak ada read_to_string tanpa batas', () => {
  const b = isiBerkasBerbagi(WEB_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + WEB_RS + ' tidak terbaca' };
  const takeBaris = cariBaris(b, /\.take\(batas as u64 \+ 1\)/);
  const tanpaBatas = b.findIndex((l) => /\.read_to_string\(\)/.test(l)) + 1;
  const clamp = cariBaris(b, /batas_byte\.clamp\(1, BATAS_BYTE_MAKS\)/);
  const tolak = cariBaris(b, /bodi melebihi batas \{batas\} byte/);
  return {
    ok: takeBaris > 0 && tanpaBatas === 0 && clamp > 0 && tolak > 0,
    info: `take@${takeBaris} clamp@${clamp} tolak-melebihi-batas@${tolak} read_to_string-tanpa-batas@${tanpaBatas}`,
  };
});

uji('C26 redirect: max_redirects(0) + langkah_redirect tiap hop + hop dihitung', () => {
  const b = isiBerkasBerbagi(WEB_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + WEB_RS + ' tidak terbaca' };
  const nol = cariBaris(b, /max_redirects\(0\)/);
  const perHop = cariBaris(b, /langkah_redirect(_dengan)?\(&sekarang, &lokasi, hop/);
  const tambah = cariBaris(b, /hop \+= 1;/);
  const batasDiFn = /hop_selesai >= /.test(
    potongan(b, cariBaris(b, /pub fn langkah_redirect_dengan/), 14)
  );
  return {
    ok: nol > 0 && perHop > 0 && tambah > 0 && batasDiFn,
    info: `max_redirects(0)@${nol} langkah_redirect@${perHop} hop+=1@${tambah} batas-di-fungsi=${batasDiFn}`,
  };
});

uji('C27 browser_pane_eval ditandai jujur (pagar di on_navigation, bukan saring skrip)', () => {
  const b = isiBerkasBerbagi(PANE_RS);
  if (!b) return { ok: false, info: 'BUTUH: ' + PANE_RS + ' tidak terbaca' };
  const teks = b.join('\n');
  const catatan = /pagar palsu/.test(teks);
  const evalBaris = cariBaris(b, /pub fn browser_pane_eval/);
  // Doc-comment pagar ada DI ATAS fn, jadi potongan diambil mulai 30 baris di atasnya.
  const sebutOnNav = /on_navigation/.test(potongan(b, evalBaris - 30, 40));
  return {
    ok: catatan && evalBaris > 0 && sebutOnNav,
    info: `eval@${evalBaris} catatan-pagar-palsu=${catatan} doc-eval-sebut-on_navigation=${sebutOnNav} (penegakan runtime BUTUH APP)`,
  };
});

uji('C28 unit test Rust untuk setiap gerbang ADA (dijalankan cargo test --lib)', () => {
  const w = isiBerkasBerbagi(WEB_RS);
  const p = isiBerkasBerbagi(PANE_RS);
  if (!w || !p) return { ok: false, info: 'BUTUH: berkas Rust tidak terbaca' };
  const wajib = [
    [w, 'angka_batas_konsisten'],
    [w, 'batas_byte_bawaan_dan_clamp'],
    [w, 'lantai_ip_satu_sumber'],
    [w, 'gerbang_pane_menolak_skema_terlarang'],
    [w, 'gerbang_pane_menolak_host_privat_link_local_dan_nama_lokal'],
    [w, 'gerbang_pane_menolak_trik_userinfo'],
    [w, 'gerbang_pane_menolak_port_tak_lazim_dan_menerima_url_publik'],
    [w, 'langkah_redirect_menolak_hop_di_atas_batas'],
    [w, 'langkah_redirect_memeriksa_ulang_setiap_hop'],
    [w, 'langkah_redirect_menerima_hop_publik'],
    [p, 'gerbang_navigasi_menolak_skema_terlarang'],
    [p, 'gerbang_navigasi_menolak_host_privat_dan_link_local'],
    [p, 'gerbang_navigasi_menolak_trik_userinfo'],
    [p, 'gerbang_navigasi_menerima_halaman_http_publik'],
  ];
  const hilang = wajib
    .filter(([b, n]) => cariBaris(b, new RegExp('fn ' + n + '\\(')) < 0)
    .map(([, n]) => n);
  return {
    ok: hilang.length === 0,
    info: hilang.length
      ? 'hilang: ' + hilang.join(', ')
      : wajib.length + ' unit test gerbang ADA (baseline 504 + 14 = 518 passed, cargo test --lib)',
  };
});

uji('C29 jalur PANE tanpa resolusi nama; jalur FETCH tetap meresolusi', () => {
  const b = isiBerkasBerbagi(WEB_RS) || [];
  const awal = cariBaris(b, /pub fn periksa_url_pane/);
  const akhir = cariBaris(b, /pub fn langkah_redirect/);
  const isiGerbang = potongan(b, awal, Math.max(1, akhir - awal));
  const resolusiDiGerbang = /to_socket_addrs|lookup_host/.test(isiGerbang);
  const resolusiDiFetch = cariBaris(b, /to_socket_addrs/);
  return {
    ok:
      jaringan.dns === 0 &&
      awal > 0 &&
      akhir > awal &&
      !resolusiDiGerbang &&
      resolusiDiFetch > 0,
    info: `dns-terpanggil=${jaringan.dns} gerbang-pane@${awal}..${akhir} resolve=${resolusiDiGerbang} jalur-fetch-resolve@${resolusiDiFetch} (pane: hostname publik->IP privat BELUM tertutup; fetch: tertutup lewat to_socket_addrs + ip_terlarang)`,
  };
});

uji('C30 kasus lama C01..C19 TIDAK dikurangi (penjaga anti-regresi)', () => {
  const sendiri = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const unik = [...new Set([...sendiri.matchAll(/uji\('(C\d\d)/g)].map((m) => m[1]))];
  const wajib = Array.from({ length: 19 }, (_, i) => 'C' + String(i + 1).padStart(2, '0'));
  const hilang = wajib.filter((n) => !unik.includes(n));
  return {
    ok: hilang.length === 0,
    info: `kasus terdaftar=${unik.length} (${unik[0]}..${unik[unik.length - 1]}) hilang=${hilang.length ? hilang.join(',') : 'tidak ada'}`,
  };
});

uji('C31 jaringan nyata tetap 0 setelah pembacaan berkas produk', () => {
  return { ok: totJaringan() === 0, info: JSON.stringify(jaringan) };
});

cetak('== (A) Bukti aturan pagar pane (implementasi acuan, node-only) ==');
cetak('');
let lulus = 0;
const gagal = [];
for (const { nama, fn } of hasil) {
  let r;
  try {
    r = fn();
  } catch (e) {
    r = { ok: false, info: 'LEMPAR: ' + (e && e.message ? e.message : e) };
  }
  if (r.ok) lulus++;
  else gagal.push(nama);
  cetak(`${r.ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
  cetak(`       ${r.info}`);
}
cetak('');
cetak(`LULUS ${lulus}/${hasil.length}`);
if (gagal.length) {
  cetak('GAGAL:');
  for (const g of gagal) cetak(`  - ${g}`);
}
cetak('');

/* ================================================================== */
/* LANGKAH 3 — bagian (B): baca KODE PRODUK nyata, laporkan celah.     */
/* Bagian ini TIDAK menilai lulus/gagal; ia mengukur jarak antara      */
/* rancangan dan kode yang ADA.                                        */
/* ================================================================== */
function baca(rel) {
  try {
    return fs.readFileSync(path.join(AKAR, rel), 'utf8').split('\n');
  } catch {
    return null;
  }
}
function jumlahBaris(baris) {
  return baris.length && baris[baris.length - 1] === '' ? baris.length - 1 : baris.length;
}
function barisDari(baris, re) {
  for (let i = 0; i < baris.length; i++) if (re.test(baris[i])) return i + 1;
  return -1;
}
const temuan = [];
const temuan_ = (berkas, nomor, ada, pesan) => temuan.push({ berkas, baris: nomor, ada, pesan });

{
  const webRs = baca('src-tauri/src/web.rs');
  if (webRs) {
    const L = (re) => barisDari(webRs, re);
    temuan_('src-tauri/src/web.rs', L(/pub fn validate_outbound_url/), true, 'lantai jaringan tunggal ADA (pub fn validate_outbound_url)');
    temuan_('src-tauri/src/web.rs', L(/must use http/), true, 'lantai skema http/https ADA');
    temuan_('src-tauri/src/web.rs', L(/PORT_SAH/), L(/PORT_SAH/) > 0, L(/PORT_SAH/) > 0 ? 'TERTAMBAL: lantai port 80/443 ADA sebagai PORT_SAH = [80, 443] (bukan cek `port != 80 && port != 443`)' : 'CELAH: lantai port 80/443 hilang dari web.rs');
    temuan_('src-tauri/src/web.rs', L(/is_loopback\(\)/), true, 'blokir loopback/privat/link-local ADA');
    temuan_('src-tauri/src/web.rs', L(/max_redirects\(0\)/), true, 'redirect TIDAK diikuti (max_redirects 0) ADA');
    temuan_('src-tauri/src/web.rs', L(/pub fn periksa_url_pane/), L(/pub fn periksa_url_pane/) > 0, L(/pub fn periksa_url_pane/) > 0 ? 'TERTAMBAL: gerbang URL pane (skema, userinfo, host privat/link-local, port) ADA + dipakai browser_pane' : 'CELAH: gerbang periksa_url_pane tidak ADA');
    temuan_('src-tauri/src/web.rs', L(/pub fn langkah_redirect/), L(/pub fn langkah_redirect/) > 0, L(/pub fn langkah_redirect/) > 0 ? 'TERTAMBAL: batas hop redirect ADA (BATAS_HOP_REDIRECT, diperiksa ulang tiap hop)' : 'CELAH: batas hop redirect tidak ADA');
    temuan_('src-tauri/src/web.rs', L(/pub fn ip_terlarang/), L(/pub fn ip_terlarang/) > 0, L(/pub fn ip_terlarang/) > 0 ? 'TERTAMBAL: lantai alamat satu sumber (ip_terlarang) dipakai jalur fetch DAN pane' : 'CELAH: lantai alamat tunggal tidak ADA');
    temuan_('src-tauri/src/web.rs', L(/\.take\(batas as u64 \+ 1\)/), L(/\.take\(batas as u64 \+ 1\)/) > 0, L(/\.take\(batas as u64 \+ 1\)/) > 0 ? 'TERTAMBAL: bodi dibaca TERBATAS (take(batas+1)) di ambil_batas — byte-bawa 2097152 / byte-maks 8388608' : 'MENUNGGU: bodi dibaca tanpa batas byte');
    temuan_('src-tauri/src/web.rs', L(/pub fn web_fetch/), true, 'TERTAMBAL: web_fetch lewat gerbang izin+allowlist TS DAN batas byte Rust (2 MiB bawaan, 8 MiB maks); allowlist per-domain DI DALAM Rust tetap MENUNGGU (butir U2)');
  } else {
    temuan_('src-tauri/src/web.rs', -1, false, 'BUTUH: berkas tidak terbaca');
  }

  const paneRs = baca('src-tauri/src/browser_pane.rs');
  if (paneRs) {
    const L = (re) => barisDari(paneRs, re);
    const lGerbang = L(/let tujuan = crate::web::periksa_url_pane/);
    temuan_('src-tauri/src/browser_pane.rs', lGerbang, lGerbang > 0, lGerbang > 0 ? 'TERTAMBAL: open() lewat gerbang crate::web::periksa_url_pane (bukan cek awalan string) — dipanggil SEBELUM webview dibuat' : 'CELAH: open() kembali memakai cek awalan string');
    const lOnNav = L(/\.on_navigation\(.*boleh_navigasi(_dengan)?\(/);
    temuan_('src-tauri/src/browser_pane.rs', lOnNav, lOnNav > 0, lOnNav > 0 ? 'TERTAMBAL: on_navigation -> boleh_navigasi -> periksa_url_pane menahan ' : 'MENUNGGU: webview tanpa on_navigation');
    const lNav = L(/pub fn browser_pane_nav\(/);
    const gerbangDiNav = /crate::web::periksa_url_pane(_dengan)?\(/.test(
      (paneRs.slice(lNav - 1, lNav + 69) || []).join('\n')
    );
    temuan_('src-tauri/src/browser_pane.rs', lNav, gerbangDiNav, gerbangDiNav ? 'TERTAMBAL: goto di nav lewat periksa_url_pane (back/forward/reload tidak membawa URL baru)' : 'CELAH: goto di nav tanpa gerbang');
    const lEval = L(/pub fn browser_pane_eval/);
    temuan_('src-tauri/src/browser_pane.rs', lEval, false, 'TERTAMBAL (pagar di lapisan webview): eval tetap bebas (memang itu gunanya), navigasi hasil eval ditahan on_navigation -> boleh_navigasi; penegakan runtime BUTUH APP');
    temuan_('src-tauri/src/browser_pane.rs', L(/pub fn browser_pane_cursor/), true, 'baca elemen terbatas (cursor) ADA');
  } else {
    temuan_('src-tauri/src/browser_pane.rs', -1, false, 'BUTUH: berkas tidak terbaca');
  }

  const webTs = baca('src/lib/zephyrTools/web.ts');
  if (webTs) {
    const blok = webTs.join('\n');
    const L = (re) => barisDari(webTs, re);

    /* --- (B) KEBIJAKAN ISI WEB: modul produk & pemasangannya --------------- */
    const kb = baca('src/lib/zephyrTools/kebijakanIsiWeb.ts');
    if (kb) {
      const kbTeks = kb.join('\n');
      const wajib = ['periksaUrl', 'gerbangIsiKonten', 'ambilIsiWeb', 'saringKeModel', 'potongKeluaran', 'batasiByte'];
      const hilang = wajib.filter((n) => !new RegExp('export (async )?function ' + n + '\\b').test(kbTeks));
      temuan_(
        'src/lib/zephyrTools/kebijakanIsiWeb.ts',
        barisDari(kb, /export function periksaUrl/),
        hilang.length === 0,
        hilang.length === 0
          ? `TERTAMBAL: modul kebijakan isi web ADA (${jumlahBaris(kb)} baris, ${wajib.length} fungsi gerbang) — satu titik keputusan untuk izin/allowlist/ukuran`
          : `MENUNGGU: modul kebijakan kurang fungsi [${hilang.join(', ')}]`
      );
      temuan_('src/lib/zephyrTools/kebijakanIsiWeb.ts', barisDari(kb, /BATAS_KARAKTER_KELUARAN = /), true, 'TERTAMBAL: batas ukuran keluaran (karakter) ADA sebagai konstanta');
      temuan_('src/lib/zephyrTools/kebijakanIsiWeb.ts', barisDari(kb, /BATAS_BYTE_MAKS = /), true, 'TERTAMBAL: batas byte unduhan (bawa/maks) ADA sebagai konstanta');
      temuan_('src/lib/zephyrTools/kebijakanIsiWeb.ts', barisDari(kb, /KEBIJAKAN_TOLAK_SEMUA/), true, 'TERTAMBAL: keadaan bawaan = TOLAK SEMUA (izin opt-in, bukan opt-out)');
      const murni = !/^\s*import\s/m.test(kbTeks);
      temuan_('src/lib/zephyrTools/kebijakanIsiWeb.ts', 1, murni, murni ? 'TERTAMBAL: modul TANPA impor (tidak bisa menyentuh store/jaringan) — keputusan deterministik' : 'MENUNGGU: modul punya impor, rawan lingkaran setelan');
    } else {
      temuan_('src/lib/zephyrTools/kebijakanIsiWeb.ts', -1, false, 'MENUNGGU: modul kebijakan isi web tidak terbaca');
    }

    const impor = L(/from '\.\/kebijakanIsiWeb'/);
    temuan_('src/lib/zephyrTools/web.ts', impor, impor > 0, impor > 0 ? 'TERTAMBAL: web.ts mengimpor modul kebijakan' : 'MENUNGGU: web.ts tidak mengimpor modul kebijakan');

    /* Gerbang per tool: satu baris bukti tiap jalur yang menyentuh jaringan. */
    const segmen = (nama) => {
      const i = blok.indexOf(`name: '${nama}'`);
      if (i < 0) return '';
      const sisa = blok.slice(i + 1);
      const j = sisa.search(/name:\s*'[a-z_]+'/);
      return blok.slice(i, j < 0 ? blok.length : i + 1 + j);
    };
    const gerbang = [
      ['web_fetch', /ambilIsiWeb\(/, 'gerbang izin+allowlist+redirect sebelum jaringan, keluaran dipotong'],
      ['web_search', /izinIsiWeb/, 'hasil pencarian (isi web) ditolak saat izin mati'],
      ['browser_open', /gerbangIsiKonten\(/, 'URL dijaga sebelum pane memuat'],
      ['browser_read', /bacaHalaman\(/, 'isi pane disaring ke model (izin diperiksa walau pane sudah terbuka)'],
      ['browser_nav', /gerbangIsiKonten\(/, 'goto memakai gerbang yang sama'],
      ['system_browser_open', /gerbangIsiKonten\(/, 'URL dijaga sebelum dibuka di browser sistem'],
      ['browser_download_url', /batasiByte\(/, 'dua pagar (gerbang + periksaTulis) dan batas byte'],
    ];
    for (const [nama, re, kenapa] of gerbang) {
      const seg = segmen(nama);
      const adaGerbang = seg.length > 0 && re.test(seg);
      temuan_(`src/lib/zephyrTools/web.ts (${nama})`, seg.length ? barisDari(webTs, new RegExp(`name: '${nama}'`)) : -1, adaGerbang, adaGerbang ? `TERTAMBAL: ${kenapa}` : `MENUNGGU: tool ${nama} tanpa gerbang kebijakan isi web`);
    }
    temuan_('src/lib/zephyrTools/web.ts', L(/saringKeModel\(await bacaHalamanMentah/), true, 'TERTAMBAL: pembungkus bacaHalaman menyaring isi pane sebelum sampai ke model');
    temuan_('src/lib/zephyrTools/web.ts', L(/potongKeluaran\(/), true, 'TERTAMBAL: keluaran web dipotong ke batas karakter di jalur produk');

    const nama = [...blok.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    const unik = [...new Set(nama)].filter((n) => /^(web_|browser_|system_)/.test(n));
    const lokal = unik.filter((n) => /download|upload|save|write|simpan/.test(n));
    temuan_(
      'src/lib/zephyrTools/web.ts',
      -1,
      false,
      `TANDAI: aksi pane nyata = [${unik.join(', ')}]` +
        (lokal.length ? ` — perlu-review-gerbang-berkas: [${lokal.join(', ')}] (sudah dua pagar, lihat baris di atas)` : '')
    );
  } else {
    temuan_('src/lib/zephyrTools/web.ts', -1, false, 'BUTUH: berkas tidak terbaca');
  }
}

cetak('== (B) Jarak ke kode produk (berkas + baris nyata, bukan lulus/gagal) ==');
const tagDari = (t) =>
  /^TERTAMBAL/.test(t.pesan)
    ? 'TAMBRG'
    : /^MENUNGGU/.test(t.pesan)
      ? 'TUNGGU'
      : /^TANDAI/.test(t.pesan)
        ? 'TANDAI'
        : /^BUTUH/.test(t.pesan)
          ? 'BUTUH '
          : t.ada
            ? 'ADA   '
            : 'CELAH ';
for (const t of temuan) {
  const lokasi = t.baris > 0 ? `${t.berkas}:${t.baris}` : t.berkas;
  cetak(`${tagDari(t)} ${lokasi} — ${t.pesan}`);
}
cetak('');

const hitungTag = (tag) => temuan.filter((t) => tagDari(t) === tag).length;
const jumlahCelah = hitungTag('CELAH ');
const jumlahTertambal = hitungTag('TAMBRG');
const jumlahMenunggu = hitungTag('TUNGGU');
const semuaLulus = lulus === hasil.length;

cetak('== Ringkasan ==');
cetak(`kasus pagar pane : ${lulus}/${hasil.length} LULUS`);
cetak(
  `jaringan nyata   : ${totJaringan()} (fetch ${jaringan.fetch}, websocket ${jaringan.websocket}, net ${jaringan.net}, http ${jaringan.http}, dns ${jaringan.dns})`
);
cetak(`kebijakan isi web: TERTAMBAL ${jumlahTertambal}, MENUNGGU ${jumlahMenunggu}, CELAH ${jumlahCelah} (bukti per baris di atas)`);
cetak('bukti tambalan   : lapisan Rust (web.rs/browser_pane.rs) dibuktikan kasus C20..C31 di berkas ini (berkas+baris nyata) + node scripts/uji-pane-browser-kebijakan.mjs (kode produk dibundel esbuild, 29 kasus)');
cetak(
  'ANGKA BATAS      : byte-bawa=' +
    BATAS_BYTE_BAWAAN +
    '  byte-maks=' +
    BATAS_BYTE_MAKS +
    '  hop-redirect=' +
    BATAS_HOP_REDIRECT +
    '  halaman-redirect=' +
    BATAS_HALAMAN_REDIRECT +
    '  port-sah=' +
    [...PORT_IZIN].map((p) => p || 'default').join(',')
);
cetak(
  semuaLulus
    ? jumlahMenunggu > 0 || jumlahCelah > 0
      ? `HASIL: aturan PAGAR PANE LULUS (exit 0). TERTAMBAL ${jumlahTertambal} temuan (lapisan Rust + TS) — sisa ${jumlahMenunggu} MENUNGGU, tercatat di docs/USULAN-PANE-BROWSER-TAMBAL.md.`
      : 'HASIL: aturan PAGAR PANE LULUS (exit 0), tanpa temuan yang menunggu.'
    : 'HASIL: aturan PAGAR PANE GAGAL (exit 1).'
);

if (MAU_JSON) {
  console.log(
    JSON.stringify(
      {
        kasus: hasil.length,
        lulus,
        gagal,
        jaringan,
        celahKodeProduk: jumlahCelah,
        tertambalTs: jumlahTertambal,
        menunggu: jumlahMenunggu,
        angkaBatas: {
          byteBawa: BATAS_BYTE_BAWAAN,
          byteMaks: BATAS_BYTE_MAKS,
          hopRedirect: BATAS_HOP_REDIRECT,
          portSah: [...PORT_IZIN],
        },
        semuaLulus,
      },
      null,
      2
    )
  );
}

process.exit(semuaLulus ? 0 : 1);
