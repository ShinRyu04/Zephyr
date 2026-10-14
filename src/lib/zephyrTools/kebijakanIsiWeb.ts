/**
 * KEBIJAKAN ISI WEB — satu tempat yang memutuskan apakah isi halaman dari
 * internet boleh DIAMBIL, dan apakah isi itu boleh DILIHAT MODEL.
 *
 * ## Kenapa berkas ini ada
 *
 * Sebelum ini setiap tool web/browser memutuskan sendiri: `web_fetch` memanggil
 * `cmd.webFetch` dengan URL apa pun, `browser_open`/`browser_nav` menyerahkan URL
 * apa pun ke pane, dan `browser_download_url` menulis berkas dari URL apa pun.
 * Tidak ada satu titik yang bisa diperiksa, jadi tidak ada yang bisa dibuktikan
 * tentang apa yang benar-benar keluar dari internet dan masuk ke percakapan.
 *
 * Empat aturan yang tinggal di sini - dan hanya di sini:
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
 *   BATAS_KARAKTER_KELUARAN = 20.000 karakter
 *   PORT_SAH                = {default, 80, 443} — sama dengan lantai port web.rs
 */

/* ------------------------------------------------------------------ */
/* Angka batas                                                         */
/* ------------------------------------------------------------------ */

export const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024; // 2.097.152
export const BATAS_BYTE_MAKS = 8 * 1024 * 1024; // 8.388.608
export const BATAS_HOP_REDIRECT = 5;
export const BATAS_KARAKTER_KELUARAN = 20000;
export const PORT_SAH: readonly string[] = ['', '80', '443'];

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

/** Belum ada setelan = belum ada izin. Ini default yang aman, bukan kekurangan. */
export const KEBIJAKAN_TOLAK_SEMUA: KebijakanIsiWeb = {
  izinIsiWeb: false,
  allowlist: [],
  batasByte: BATAS_BYTE_BAWAAN,
  batasKarakter: BATAS_KARAKTER_KELUARAN,
};

/**
 * Baca kebijakan dari setelan yang SUDAH ADA (tanpa mengubah bentuk setelan).
 *
 * Field yang belum dikenal - mis. sebelum setelan izin isi web dipasang di
 * Settings §security - dibaca sebagai "belum ada izin". Jadi pemasangan UI-nya
 * tidak bisa mengubah arti berkas ini: yang belum ada selalu fail-closed.
 */
export function kebijakanDariSetelan(setelan: unknown): KebijakanIsiWeb {
  const s = (setelan ?? {}) as Record<string, unknown>;
  const allowlist = Array.isArray(s.allowlistWeb)
    ? s.allowlistWeb.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
    : [];
  return {
    izinIsiWeb: s.izinIsiWeb === true,
    allowlist,
    batasByte: angkaSah(s.batasByteWeb, BATAS_BYTE_BAWAAN),
    batasKarakter: angkaSah(s.batasKarakterWeb, BATAS_KARAKTER_KELUARAN),
  };
}

function angkaSah(v: unknown, bawaan: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : bawaan;
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
 * Cocok bila host SAMA DENGAN entri, atau subdomain SAH-nya (batas titik).
 * Pencocokan `endsWith` tanpa titik akan meloloskan "contoh.com.jahat.com"
 * untuk entri "contoh.com" - itu satu-satunya trik yang membuat allowlist
 * tampak bekerja padahal tidak.
 */
export function hostDiAllowlist(host: string, allowlist: readonly string[]): boolean {
  const h = normalisasiHost(host);
  if (h === '') return false;
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

/**
 * Gerbang satu URL. Urutannya disengaja:
 *   izin -> skema -> bentuk URL -> host -> IP privat -> nama lokal -> allowlist -> port
 *
 * Izin diperiksa PALING AWAL supaya "izin mati" selalu alasan penolakan yang
 * muncul, apa pun bentuk URL-nya - dan supaya tidak ada satu pun pemeriksaan
 * yang bisa dipakai untuk menyimpulkan isi allowlist saat izin mati.
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
  if (isIpPrivat(host)) return { ok: false, alasan: 'ip-privat:' + host };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, alasan: 'nama-lokal:' + host };
  }
  if (!hostDiAllowlist(host, kb.allowlist)) return { ok: false, alasan: 'host-luar-allowlist:' + host };
  if (!PORT_SAH.includes(u.port)) {
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
  if (rantai.length - 1 > BATAS_HOP_REDIRECT) {
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
