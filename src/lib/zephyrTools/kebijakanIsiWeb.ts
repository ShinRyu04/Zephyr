/**
 * KEBIJAKAN ISI WEB — satu tempat yang memutuskan apakah isi halaman dari
 * internet boleh DIAMBIL, dan apakah isi itu boleh DILIHAT MODEL.
 *
 * ## Kenapa berkas ini ada
 *
 * Sebelum ini setiap tool web/browser memutuskan sendiri: `web_fetch` memanggil
 * `cmd.webFetch` dengan URL apa pun, `browser_open` menyerahkan URL
 * apa pun ke pane, dan `browser_download_url` menulis berkas dari URL apa pun.
 * Tidak ada satu titik yang bisa diperiksa, jadi tidak ada yang bisa dibuktikan
 * tentang apa yang benar-benar keluar dari internet dan masuk ke percakapan.
 *
 * Enam aturan yang tinggal di sini - dan hanya di sini:
 *
 *   1. IZIN OPT-IN. Isi web mati sampai user menyalakannya. Tanpa izin, tidak
 *      ada satu pun permintaan jaringan yang dibuat, bahkan untuk host yang
 *      sudah terdaftar.
 *   2. DAFTAR HOST (allowlist) yang default TOLAK. Host yang tidak terdaftar
 *      ditolak; daftar kosong berarti "belum ada yang diizinkan", bukan
 *      "izinkan semua".
 *   3. BATAS UKURAN KELUARAN. Isi yang sampai ke model selalu dipotong pada
 *      `batasKarakter` (keras: `BATAS_KARAKTER_KELUARAN`), dan ukuran mentah
 *      yang diminta dari jaringan dibatasi `batasByte` (keras:
 *      `BATAS_BYTE_MAKS`) - jadi satu halaman raksasa tidak bisa mengisi RAM
 *      maupun jendela percakapan.
 *   4. TIDAK ADA JALUR OTOMATIS. `saringKeModel()` adalah satu-satunya pintu
 *      isi -> model. Jalur cadangan di dalam `browser_read` (fetch statis saat
 *      webview belum hidup) memakai pintu yang sama, jadi "otomatis" tidak
 *      berarti "tanpa izin".
 *   5. JARINGAN LOKAL OPT-IN (`izinJaringanLokal`, default MATI). Saat mati,
 *      loopback/privat/link-local/CGNAT dan nama `*.local`/`*.localhost`
 *      ditolak - persis perilaku lama. Saat hidup, alamat itu boleh
 *      dijangkau... KECUALI endpoint metadata cloud `169.254.169.254`
 *      (dan padanan IPv6 `fd00:ec2::254`) yang TETAP ditolak: alamat itu
 *      bukan "jaringan lokal pengguna", ia kredensial instans yang bisa
 *      dibaca siapa pun yang menjangkau socket-nya.
 *   6. PORT & HOP SETELAN. Port yang sah (`portWeb`, default 80/443) dan
 *      plafon hop redirect (`hopRedirect`, default 5, keras 10) bisa
 *      dikonfigurasi, tapi selalu di-clamp ke batas keras.
 *
 * ## Yang TIDAK pernah dibuka (ditolak permanen)
 *
 *   - userinfo `user@host` (trik penyamaran host),
 *   - skema `file:`/`javascript:`/`data:`/`about:`,
 *   - ekstensi non-`open-vsx` (di jalur unduhan ekstensi, bukan di sini).
 *
 * Ketiganya ditolak tanpa syarat - tidak ada setelan yang membukanya.
 *
 * ## Kenapa murni (tanpa impor)
 *
 * Berkas ini TIDAK mengimpor apa pun: bukan store, bukan perintah Tauri, bukan
 * jaringan. Sebabnya bukan gaya - seluruh aturannya harus bisa dijalankan dan
 * dibuktikan di luar aplikasi (`scripts/uji-pane-browser-kebijakan.mjs`), dan
 * modul murni adalah satu-satunya bentuk yang bisa dibuktikan tanpa app hidup.
 * Pembaca setelan disediakan terpisah lewat `kebijakanDariSetelan()` yang
 * menerima OBJEK setelan apa adanya (duck-typed), jadi berkas ini tidak perlu
 * tahu dari mana setelan itu datang.
 *
 * ANGKA BATAS (harus cocok dengan `scripts/uji-pane-browser.mjs` dan
 * docs/USULAN-PANE-BROWSER.md §0):
 *   BATAS_BYTE_BAWAAN       = 2.097.152 byte (2 MiB)
 *   BATAS_BYTE_MAKS         = 8.388.608 byte (8 MiB)
 *   BATAS_HOP_REDIRECT      = 5
 *   HOP_REDIRECT_MAKS       = 10
 *   BATAS_KARAKTER_KELUARAN = 20.000 karakter
 *   PORT_SAH                = {default, 80, 443} — sama dengan lantai port web.rs
 */

/* ------------------------------------------------------------------ */
/* Angka batas                                                         */
/* ------------------------------------------------------------------ */

export const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024; // 2.097.152
export const BATAS_BYTE_MAKS = 8 * 1024 * 1024; // 8.388.608
export const BATAS_HOP_REDIRECT = 5;
/** Plafon KERAS hop redirect: `hopRedirect` setelan tidak pernah melewati ini. */
export const HOP_REDIRECT_MAKS = 10;
export const BATAS_KARAKTER_KELUARAN = 20000;
export const PORT_SAH: readonly string[] = ['', '80', '443'];

/**
 * Endpoint metadata instans cloud. SELALU ditolak, bahkan saat
 * `izinJaringanLokal` hidup - lihat aturan 5 di header.
 */
export const IP_METADATA = '169.254.169.254';
export const IP_METADATA_V6 = 'fd00:ec2::254';

/** Penanda yang ditambahkan saat isi dipotong, supaya model tahu ada sisa. */
export const PENANDA_DIPOTONG = '[dipotong]';

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export interface KebijakanIsiWeb {
  /** Opt-in user. `false` = nol permintaan jaringan, nol isi ke model. */
  izinIsiWeb: boolean;
  /** Host yang boleh diambil. Kosong = tolak semua (default-tolak). */
  allowlist: readonly string[];
  /** Batas byte mentah yang diminta dari jaringan (di-clamp BATAS_BYTE_MAKS). */
  batasByte: number;
  /** Batas karakter isi yang boleh dilihat model (di-clamp BATAS_KARAKTER_KELUARAN). */
  batasKarakter: number;
  /**
   * Opt-in jaringan lokal. `false` (default) = loopback/privat/link-local/
   * CGNAT dan `*.local`/`*.localhost` ditolak. `true` = boleh, KECUALI
   * `169.254.169.254` yang tetap ditolak.
   */
  izinJaringanLokal: boolean;
  /** Port yang sah (default `PORT_SAH`). Selalu menyertakan '' (port default). */
  portSah: readonly string[];
  /** Plafon hop redirect (default `BATAS_HOP_REDIRECT`, keras `HOP_REDIRECT_MAKS`). */
  hopRedirect: number;
}

export type Keputusan = { ok: true } | { ok: false; alasan: string };
export type KeputusanUrl = { ok: true; url: string; host: string } | { ok: false; alasan: string };

export type HasilIsi =
  | { ok: true; url: string; teks: string; byte: number; dipotong: boolean }
  | { ok: false; alasan: string; kirim: 0 };

export type HasilSaring =
  | { ok: true; teks: string }
  | { ok: false; alasan: string; kirim: 0 };

/** Pengambil isi yang disuntikkan pemanggil (Tauri `web_fetch`, atau fake di uji). */
export type Fetcher = (url: string, maxChars: number) => Promise<string>;

/* ------------------------------------------------------------------ */
/* Kebijakan bawaan                                                    */
/* ------------------------------------------------------------------ */

/** Belum ada setelan = izin penuh. Lihat catatan di `kebijakanDariSetelan`. */
export const KEBIJAKAN_TOLAK_SEMUA: KebijakanIsiWeb = {
  izinIsiWeb: true,
  allowlist: [],
  batasByte: BATAS_BYTE_BAWAAN,
  batasKarakter: BATAS_KARAKTER_KELUARAN,
  izinJaringanLokal: false,
  portSah: PORT_SAH,
  hopRedirect: BATAS_HOP_REDIRECT,
};

/**
 * Baca kebijakan dari setelan yang SUDAH ADA (tanpa mengubah bentuk setelan).
 *
 * `izinIsiWeb` sekarang dibaca sebagai "Mati HANYA kalau eksplisit `false`":
 * berkas lama yang tidak punya key itu berarti izin penuh, bukan penolakan.
 * Sebelumnya yang tidak ada dibaca fail-closed, sehingga instalasi baru tidak
 * bisa membuka satu link pun sampai seseorang menemukan setelan izinnya.
 *
 * Field lain tetap fail-closed: `izinJaringanLokal` yang tidak ada = jaringan
 * lokal tertutup, port 80/443, hop 5.
 */
export function kebijakanDariSetelan(setelan: unknown): KebijakanIsiWeb {
  const s = (setelan ?? {}) as Record<string, unknown>;
  const allowlist = Array.isArray(s.allowlistWeb)
    ? s.allowlistWeb.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
    : [];
  return {
    izinIsiWeb: s.izinIsiWeb !== false,
    allowlist,
    batasByte: angkaSah(s.batasByteWeb, BATAS_BYTE_BAWAAN),
    batasKarakter: angkaSah(s.batasKarakterWeb, BATAS_KARAKTER_KELUARAN),
    izinJaringanLokal: s.izinJaringanLokal === true,
    portSah: daftarPort(s.portWeb),
    hopRedirect: angkaHop(s.hopRedirect),
  };
}

function angkaSah(v: unknown, bawaan: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : bawaan;
}

/**
 * Port sah dari setelan. Tidak ada/rusak = `PORT_SAH`. Selalu ada `''`.
 *
 * Sama dengan `port_dipakai()` di `web.rs`: 80/443 SELALU sah, dan `portWeb`
 * hanya MEMPERLUAS daftar itu (lih. `web.rs:223` "portWeb memperluas port yang
 * sah (80/443 selalu sah)" + tes `port_web_on_membuka_port_tambahan` yang
 * meng-assert `port_diizinkan(443)` tetap `true`). Jadi `portWeb: [3000]`
 * menambah 3000 TANPA menghapus 80/443, dan `portWeb: []` kembali ke
 * `PORT_SAH` — bukan `['']` yang membuat `:443` eksplisit ikut tertolak.
 */
function daftarPort(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return PORT_SAH;
  const out = new Set<string>(PORT_SAH);
  for (const p of v) {
    const s = String(p).trim();
    if (/^\d{1,5}$/.test(s)) out.add(s);
  }
  return [...out];
}

/** Hop redirect dari setelan: di-clamp ke [1, HOP_REDIRECT_MAKS]. */
function angkaHop(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return BATAS_HOP_REDIRECT;
  const n = Math.floor(v);
  if (n < 1) return BATAS_HOP_REDIRECT;
  return Math.min(n, HOP_REDIRECT_MAKS);
}

/* ------------------------------------------------------------------ */
/* Host dan IP                                                         */
/* ------------------------------------------------------------------ */

export function normalisasiHost(host: string): string {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(':')) return true; // IPv6 (termasuk bentuk [..])
  return false;
}

/** Endpoint metadata cloud - ditolak TANPA syarat (lihat aturan 5). */
export function isIpMetadata(host: string): boolean {
  const h = String(host ?? '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === IP_METADATA || h === IP_METADATA_V6;
}

/** Alamat yang tidak boleh dijangkau agen: loopback, privat, link-local, CGNAT. */
export function isIpPrivat(host: string): boolean {
  if (!isIpLiteral(host)) return false;
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === '::1' || h === '::') return true; // loopback
    if (h.startsWith('fe80')) return true; // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
    return false;
  }
  const p = host.split('.').map(Number);
  const a = p[0];
  const b = p[1];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local 169.254/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/**
 * Alamat yang tetap dilarang WALAU jaringan lokal dibuka: unspecified,
 * broadcast, multicast, dan blok dokumentasi. Ini bukan "jaringan pengguna" -
 * tidak ada server sah di sana, jadi membukanya hanya menambah permukaan.
 */
export function isIpSelaluDilarang(host: string): boolean {
  if (!isIpLiteral(host)) return false;
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === '::') return true; // unspecified
    if (h.startsWith('ff')) return true; // multicast ff00::/8
    return false;
  }
  const p = host.split('.').map(Number);
  const a = p[0];
  const b = p[1];
  const c = p[2];
  if (a === 0) return true; // 0.0.0.0/8 (unspecified)
  if (a === 255 && b === 255 && c === 255 && p[3] === 255) return true; // broadcast
  if (a >= 224 && a <= 239) return true; // multicast 224/4
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  return false;
}

/**
 * Lantai alamat BERLAKU. Urutannya:
 *   1. metadata cloud SELALU dilarang;
 *   2. jaringan lokal tertutup -> `isIpPrivat` penuh;
 *   3. jaringan lokal terbuka -> hanya blok yang memang tidak punya server sah.
 */
export function isIpTerlarang(host: string, izinJaringanLokal: boolean): boolean {
  if (isIpMetadata(host)) return true;
  if (izinJaringanLokal) return isIpSelaluDilarang(host);
  return isIpPrivat(host);
}

/** Nama host lokal: `localhost`, `*.localhost`, `*.local`. */
export function namaLokal(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local');
}

/**
 * Cocok bila host SAMA DENGAN entri, atau subdomain SAH-nya (batas titik).
 * Pencocokan `endsWith` tanpa titik akan meloloskan "contoh.com.jahat.com"
 * untuk entri "contoh.com" - itu satu-satunya trik yang membuat allowlist
 * tampak bekerja padahal tidak.
 */
export function hostDiAllowlist(host: string, allowlist: readonly string[]): boolean {
  const h = normalisasiHost(host);
  if (h === '') return false;
  /*
   * Allowlist KOSONG berarti semua host boleh.
   *
   * Dulu artinya sebaliknya (tolak semua), dan itu masuk akal selagi daftarnya
   * satu-satunya pagar. Sekarang pagarnya sudah ada lebih awal - skema, IP
   * privat, localhost, port - jadi daftar kosong tidak lagi perlu berarti
   * "tidak boleh ke mana-mana". Yang terjadi sebelumnya: izin dinyalakan, lalu
   * setiap link yang diberikan user tetap ditolak dengan alasan allowlist, dan
   * itu terbaca sebagai "AI tidak bisa buka browser".
   */
  if (allowlist.length === 0) return true;
  for (const entri of allowlist) {
    const e = normalisasiHost(entri);
    if (e === '') continue;
    if (h === e) return true;
    if (h.endsWith('.' + e)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Gerbang URL                                                         */
/* ------------------------------------------------------------------ */

/** Port sah BERLAKU: dari setelan bila ada, kalau tidak `PORT_SAH`. */
export function portSahBerlaku(kb: KebijakanIsiWeb): readonly string[] {
  return Array.isArray(kb.portSah) && kb.portSah.length > 0 ? kb.portSah : PORT_SAH;
}

/** Hop redirect BERLAKU: dari setelan bila ada, di-clamp ke plafon keras. */
export function hopBerlaku(kb: KebijakanIsiWeb): number {
  if (typeof kb.hopRedirect !== 'number' || !Number.isFinite(kb.hopRedirect)) {
    return BATAS_HOP_REDIRECT;
  }
  const n = Math.floor(kb.hopRedirect);
  if (n < 1) return BATAS_HOP_REDIRECT;
  return Math.min(n, HOP_REDIRECT_MAKS);
}

/**
 * Gerbang satu URL. Urutannya disengaja:
 *   izin -> skema -> bentuk URL -> host -> IP privat -> nama lokal -> allowlist -> port
 *
 * Izin diperiksa PALING AWAL supaya "izin mati" selalu alasan penolakan yang
 * muncul, apa pun bentuk URL-nya - dan supaya tidak ada satu pun pemeriksaan
 * yang bisa dipakai untuk menyimpulkan isi allowlist saat izin mati.
 *
 * `izinJaringanLokal` hanya melonggarkan langkah IP-privat/nama-lokal; ia TIDAK
 * melonggarkan allowlist (host tetap harus terdaftar) dan TIDAK membuka
 * `169.254.169.254`.
 */
export function periksaUrl(urlStr: unknown, kb: KebijakanIsiWeb): KeputusanUrl {
  if (kb.izinIsiWeb !== true) return { ok: false, alasan: 'izin-isi-web-mati' };

  if (urlStr === undefined || urlStr === null) return { ok: false, alasan: 'tanpa-argumen' };
  const s = String(urlStr).trim();
  if (s === '') return { ok: false, alasan: 'tanpa-argumen' };

  /* Skema diperiksa lebih dulu dari URL: file:/javascript:/data:/about: tidak
     punya arti http dan tidak boleh sampai ke parser. */
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
  if (m) {
    const sk = m[1].toLowerCase();
    if (sk !== 'http' && sk !== 'https') return { ok: false, alasan: 'skema-terlarang:' + sk + ':' };
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, alasan: 'url-tak-valid' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, alasan: 'skema-terlarang:' + u.protocol };
  }
  if (!u.hostname) return { ok: false, alasan: 'host-kosong' };

  const host = normalisasiHost(u.hostname);
  if (isIpTerlarang(host, kb.izinJaringanLokal === true)) {
    return { ok: false, alasan: 'ip-privat:' + host };
  }
  if (kb.izinJaringanLokal !== true && namaLokal(host)) {
    return { ok: false, alasan: 'nama-lokal:' + host };
  }
  if (!hostDiAllowlist(host, kb.allowlist)) return { ok: false, alasan: 'host-luar-allowlist:' + host };
  if (!portSahBerlaku(kb).includes(u.port)) {
    return { ok: false, alasan: 'port-tak-lazim:' + (u.port || '(default)') };
  }

  return { ok: true, url: u.href, host };
}

/** Gerbang isi: sama dengan `periksaUrl`, dinamai untuk titik keputusan "isi". */
export function gerbangIsiKonten(urlStr: unknown, kb: KebijakanIsiWeb): Keputusan {
  const g = periksaUrl(urlStr, kb);
  return g.ok ? { ok: true } : { ok: false, alasan: g.alasan };
}

/** Tiap hop redirect diperiksa ULANG - bukan hanya URL pertama. */
export function ikutiRedirect(rantai: readonly string[], kb: KebijakanIsiWeb): Keputusan {
  if (!Array.isArray(rantai) || rantai.length === 0) return { ok: false, alasan: 'rantai-kosong' };
  const hop = hopBerlaku(kb);
  if (rantai.length - 1 > hop) {
    return { ok: false, alasan: 'batas-redirect-terlampaui:' + (rantai.length - 1) };
  }
  for (let i = 0; i < rantai.length; i++) {
    const g = periksaUrl(rantai[i], kb);
    if (!g.ok) return { ok: false, alasan: 'hop-' + i + ':' + g.alasan };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Batas ukuran                                                        */
/* ------------------------------------------------------------------ */

/** Batas byte berlaku = min(diminta, keras). */
export function batasByteBerlaku(batas: number): number {
  const b = angkaSah(batas, BATAS_BYTE_BAWAAN);
  return Math.min(b, BATAS_BYTE_MAKS);
}

/** Batas karakter berlaku = min(diminta, keras). */
export function batasKarakterBerlaku(batas: number): number {
  const b = angkaSah(batas, BATAS_KARAKTER_KELUARAN);
  return Math.min(b, BATAS_KARAKTER_KELUARAN);
}

export function ukuranByte(teks: string): number {
  return new TextEncoder().encode(String(teks ?? '')).length;
}

/** `panjang` byte boleh dibaca? Di atas batas keras = tolak, bukan potong diam-diam. */
export function batasiByte(panjang: number, batas: number): Keputusan {
  if (typeof panjang !== 'number' || !Number.isFinite(panjang) || panjang < 0) {
    return { ok: false, alasan: 'panjang-tak-valid' };
  }
  const maks = batasByteBerlaku(batas);
  if (panjang > maks) return { ok: false, alasan: 'bodi-terlalu-besar:' + panjang + '>' + maks };
  return { ok: true };
}

/** Potong isi ke batas karakter kebijakan; penanda ditambahkan supaya terlihat. */
export function potongKeluaran(
  teks: string,
  kb: KebijakanIsiWeb,
): { teks: string; asli: number; dipotong: boolean; batas: number } {
  const t = String(teks ?? '');
  const batas = batasKarakterBerlaku(kb.batasKarakter);
  if (t.length <= batas) return { teks: t, asli: t.length, dipotong: false, batas };
  return {
    teks: t.slice(0, batas) + '\n' + PENANDA_DIPOTONG + ' ' + batas + ' dari ' + t.length + ' karakter',
    asli: t.length,
    dipotong: true,
    batas,
  };
}

/* ------------------------------------------------------------------ */
/* Pintu isi -> model (satu-satunya)                                   */
/* ------------------------------------------------------------------ */

/**
 * Boleh isi ini dilihat model?
 *
 * Dipakai SEMUA jalur yang sudah memegang isi halaman - termasuk jalur cadangan
 * otomatis di `browser_read` yang mengambil halaman tanpa diminta model secara
 * eksplisit. Izin mati = nol karakter terkirim (`kirim: 0`), bukan "terkirim
 * tapi dipotong".
 */
export function saringKeModel(teks: string, kb: KebijakanIsiWeb): HasilSaring {
  if (kb.izinIsiWeb !== true) return { ok: false, alasan: 'izin-isi-web-mati', kirim: 0 };
  const p = potongKeluaran(teks, kb);
  return { ok: true, teks: p.teks };
}

/**
 * Ambil isi satu URL: gerbang dulu, jaringan kemudian.
 *
 * Urutannya adalah buktinya - bila gerbang menolak, `fetcher` TIDAK dipanggil
 * sama sekali (dibuktikan di harness dengan penghitung panggilan), jadi tidak
 * ada paket yang keluar untuk URL yang ditolak.
 */
export async function ambilIsiWeb(
  urlStr: unknown,
  kb: KebijakanIsiWeb,
  fetcher: Fetcher,
): Promise<HasilIsi> {
  const g = periksaUrl(urlStr, kb);
  if (!g.ok) return { ok: false, alasan: g.alasan, kirim: 0 };

  const batasKarakter = batasKarakterBerlaku(kb.batasKarakter);
  const mentah = await fetcher(g.url, batasKarakter);
  const byte = ukuranByte(mentah);
  const cek = batasiByte(byte, kb.batasByte);
  if (!cek.ok) return { ok: false, alasan: cek.alasan, kirim: 0 };

  const p = potongKeluaran(mentah, kb);
  return { ok: true, url: g.url, teks: p.teks, byte, dipotong: p.dipotong };
}
