/**
 * ambilWeb.ts — rumah satu-satunya untuk kemampuan "AMBIL-WEB" agen Zephyr.
 *
 * ## Kenapa berkas ini ada
 *
 * `web_fetch` sudah lama ada, tetapi kebijakannya tidak pernah tinggal di satu
 * tempat: skema diperiksa di Rust, pemotongan di `builtins.potong`, pembersihan
 * tag HTML di `web.ts`, dan batas waktu cuma "apa yang kebetulan dipasang Tauri".
 * Akibatnya agen yang butuh satu halaman JSON menerima teks yang sudah digerus
 * regex `<[^>]+>` — JSON tetap terbaca sebagai teks, bukan sebagai data — dan
 * tidak ada satu pun lapisan yang bisa ditunjuk sebagai "di sini aturannya".
 *
 * Berkas ini memindahkan SELURUH keputusan itu ke satu modul murni:
 *
 *   1. URL diperiksa SEBELUM apa pun keluar (`periksaUrlAmbilWeb`): hanya
 *      `https:`, host harus ada di allowlist (default TOLAK kalau daftarnya
 *      kosong), loopback/privat/link-local/ULA DITOLAK kecuali izin eksplisit.
 *   2. Keluaran dipotong pada batas BYTE (`potongByte`), bukan pada batas
 *      karakter JS, supaya 1 MB UTF-8 bukan berarti 1 MB byte.
 *   3. Isi diperiksa sebagai JSON; kalau bisa dibaca, hasilnya DATA (`data`),
 *      bukan teks mentah yang perlu di-parse ulang oleh model.
 *   4. Token/kunci yang kebetulan ikut tersedot disensor (`saringRahasiaWeb`).
 *   5. Batas waktu ditegakkan modul sendiri (`denganBatasWaktu`), jadi transport
 *      yang menggantung tidak bisa menggantung agen.
 *   6. Hasil bisa ditulis ke berkas lewat penulis yang DISUNTIKKAN
 *      (`tulisHasilAmbilWeb`) — modul ini tidak pernah membuka berkas sendiri.
 *
 * ## Kontrak yang dijaga berkas ini
 *
 * Modul ini SENGAJA tidak mengimpor apa pun: ia tidak menyentuh
 * `node:child_process`, `node:fs`, `node:http`, maupun `process.env`. Jaringan
 * masuk lewat parameter `transport`, dan berkas keluar lewat parameter `tulis`.
 * Itu bukan kerapian — itu yang membuat "nol shell" dan "tidak ada jalur membaca
 * .env" bisa DIBUKTIKAN oleh harness (`scripts/uji-fetch-web.mjs`), bukan cuma
 * diklaim. Kalau suatu saat berkas ini butuh mengimpor sesuatu, tanyakan dulu
 * apakah kemampuan itu benar-benar milik lapisan ini.
 *
 * Sintaks TS di sini sengaja hanya yang bisa DIBUANG (erasable): tanpa `enum`,
 * tanpa parameter property, tanpa `namespace`. Node >= 22 bisa
 * meng-`import` berkas ini langsung dari `.mjs` (type-stripping), dan itulah
 * cara harness memanggilnya tanpa build step.
 */

/* ------------------------------------------------------------------ */
/* Konstanta kebijakan                                                 */
/* ------------------------------------------------------------------ */

/** Satu-satunya skema yang diizinkan tanpa izin khusus. */
export const SKEMA_IZIN = 'https:';

/**
 * Allowlist bawaan.
 *
 * Ini SENGAJA daftar pendek dan harus diedit dengan sadar; menambah host di
 * sini berarti menambah host yang boleh dihubungi tanpa izin per panggilan.
 * Pencocokan memakai `domainCocok`: sama persis, atau subdomain dari entri.
 * Entri boleh berbentuk `*.contoh.org` untuk menyatakan "seluruh subdomain".
 *
 * Padanan pola unduh di `src-tauri/src/ext_pkg.rs` (`izin_unduh`, daftar izin
 * unduh ekstensi): daftar tertulis di sumber, bukan pola wildcard bebas.
 */
export const IZIN_HOST_BAWAAN: readonly string[] = [
  'open-vsx.org',
  'registry.npmjs.org',
  'api.github.com',
  'raw.githubusercontent.com',
];

/** Port yang boleh dipakai host non-lokal. */
export const PORT_IZIN: readonly string[] = ['', '80', '443'];

/** Batas badan jawaban, byte. Bawaan 2 MiB, plafon 8 MiB. */
export const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024;
export const BATAS_BYTE_MAKS = 8 * 1024 * 1024;

/** Batas waktu tunggu. Bawaan 20 dtk, plafon 30 dtk. */
export const WAKTU_BAWAAN_MS = 20_000;
export const WAKTU_MAKS_MS = 30_000;

/** Berapa kali redirect diikuti. Tiap hop diperiksa ULANG dari nol. */
export const MAKS_REDIRECT = 5;

/** Batas teks yang diserahkan ke model, karakter. */
export const MAKS_KARAKTER_BAWAAN = 15_000;
export const MAKS_KARAKTER_MAKS = 200_000;

/** Batas isi yang boleh ditulis ke berkas, byte. */
export const BATAS_TULIS_BYTE = BATAS_BYTE_MAKS;

/** Penanda pengganti rahasia. Tetap sepotong teks sah di dalam JSON. */
export const PENANDA_SENSOR = '[DISENSOR]';

/* ------------------------------------------------------------------ */
/* Izin & pemeriksaan URL                                              */
/* ------------------------------------------------------------------ */

/**
 * Izin eksplisit. Dua lantai terpisah, dan keduanya harus dinyalakan sendiri:
 * `lokal` membuka alamat loopback/privat, `httpLokal` membuka skema `http:`
 * (hanya berlaku bila `lokal` juga menyala).
 */
export interface IzinAmbilWeb {
  /** Host yang diizinkan. Kosong = TOLAK SEMUA (bukan izinkan semua). */
  host: readonly string[];
  /** Izin eksplisit menembus lantai lokal (loopback/privat/link-local/ULA). */
  lokal: boolean;
  /** Izin eksplisit memakai `http://` di host lokal. */
  httpLokal: boolean;
}

/** Izin yang menolak segalanya. Ini bawaannya, dan itu disengaja. */
export const IZIN_TOLAK: IzinAmbilWeb = { host: [], lokal: false, httpLokal: false };

/** Izin untuk host publik: allowlist saja, tanpa lantai lokal. */
export function izinHost(host: readonly string[]): IzinAmbilWeb {
  return { host: [...host], lokal: false, httpLokal: false };
}

/**
 * Izin pengembangan: mengizinkan `http://` pada host lokal yang disebut.
 * Hanya untuk dev-server di mesin sendiri; setiap host tetap harus ditulis.
 */
export function izinLokalDev(host: readonly string[]): IzinAmbilWeb {
  return { host: [...host], lokal: true, httpLokal: true };
}

/** Hasil pemeriksaan URL. `sebab` selalu terisi saat `ok` false. */
export interface HasilPeriksaUrl {
  ok: boolean;
  sebab: string;
  protokol: string;
  host: string;
  lokal: boolean;
}

/**
 * Apakah `host` sama dengan `domain`, atau subdomain-nya?
 *
 * `contoh.com.jahat.com` TIDAK cocok dengan `contoh.com` — itu yang membedakan
 * pencocokan label dari pencocokan akhiran string. Entri berawalan `*.` dibaca
 * sebagai "seluruh subdomain dari sisa entri".
 */
export function domainCocok(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  let d = domain.trim().toLowerCase().replace(/\.+$/, '');
  if (!h || !d) return false;
  if (d.startsWith('*.')) d = d.slice(2);
  if (h === d) return true;
  return h.endsWith('.' + d);
}

/** Pecah `a.b.c.d` menjadi oktet, atau null kalau bukan bentuk IPv4. */
function oktetIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o: [number, number, number, number] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
  ];
  for (const n of o) if (n > 255) return null;
  return o;
}

/**
 * Apakah host ini alamat yang tidak boleh dihubungi tanpa izin eksplisit?
 *
 * Cakupannya: loopback (127/8, `::1`), privat (10/8, 172.16/12, 192.168/16),
 * link-local (169.254/16 — termasuk 169.254.169.254 milik metadata cloud),
 * CGNAT (100.64/10), alamat tak-tentu (0/8), ULA IPv6 (fc00::/7), link-local
 * IPv6 (fe80::/10), IPv4-mapped IPv6, `localhost`, dan akhiran nama internal
 * (`.local`, `.internal`, `.lan`, `.home.arpa`, `.test`).
 *
 * Mengembalikan `true` juga untuk host KOSONG: host kosong bukan alasan untuk
 * melonggarkan pemeriksaan.
 */
export function alamatLokal(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  if (h.startsWith('[') || h.includes(':')) {
    const v6 = h.replace(/^\[/, '').replace(/\]$/, '').replace(/%.*$/, '');
    if (v6 === '::1' || v6 === '::' || v6 === '0:0:0:0:0:0:0:1') return true;
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
    if (v6.startsWith('::ffff:')) return alamatLokal(v6.slice(7));
    return false;
  }

  const o = oktetIpv4(h);
  if (o) {
    const [a, b] = o;
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  return /\.(local|internal|lan|home\.arpa|test)$/.test(h);
}

/**
 * Gerbang utama: URL ini boleh diambil atau tidak?
 *
 * Urutannya disengaja — hal yang paling murah diperiksa lebih dulu, dan hal
 * yang paling berbahaya (`host` di luar izin) diperiksa sebelum transport
 * pernah melihat URL-nya.
 */
export function periksaUrlAmbilWeb(
  urlMentah: string,
  izin: IzinAmbilWeb = IZIN_TOLAK,
): HasilPeriksaUrl {
  const tolak = (sebab: string): HasilPeriksaUrl => ({
    ok: false,
    sebab,
    protokol: '',
    host: '',
    lokal: false,
  });

  const mentah = String(urlMentah ?? '').trim();
  if (!mentah) return tolak('URL kosong');
  if (mentah.length > 2048) return tolak('URL terlalu panjang');
  if (/[\u0000-\u0020]/.test(mentah)) return tolak('URL memuat spasi atau karakter kendali');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(mentah)) {
    return tolak('URL tanpa skema - awali dengan https://');
  }

  let u: URL;
  try {
    u = new URL(mentah);
  } catch {
    return tolak('URL tidak bisa dibaca');
  }

  const protokol = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  const lokal = alamatLokal(host);

  if (u.username || u.password) return tolak('URL memuat kredensial (user:pass@)');

  if (protokol !== SKEMA_IZIN) {
    const bolehHttp = protokol === 'http:' && izin.httpLokal && izin.lokal && lokal;
    if (!bolehHttp) {
      return tolak(
        protokol === 'http:'
          ? 'hanya https yang diizinkan (http: butuh izin lokal eksplisit)'
          : `skema ${protokol} tidak diizinkan (hanya ${SKEMA_IZIN})`,
      );
    }
  }

  if (lokal && !izin.lokal) {
    return tolak('host lokal/privat/link-local - butuh izin eksplisit');
  }

  if (izin.host.length === 0) {
    return tolak('allowlist host kosong - default menolak');
  }
  if (!izin.host.some((d) => domainCocok(host, d))) {
    return tolak(`host di luar allowlist: ${host}`);
  }

  if (!lokal && !PORT_IZIN.includes(u.port)) {
    return tolak(`port ${u.port} di luar izin`);
  }

  return { ok: true, sebab: '', protokol, host, lokal };
}

/* ------------------------------------------------------------------ */
/* Batas ukuran, batas waktu, pemotongan                               */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });

/** Batas byte setelah dijepit ke rentang [1, BATAS_BYTE_MAKS]. */
export function batasByteTerapkan(n?: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return BATAS_BYTE_BAWAAN;
  return Math.min(Math.floor(v), BATAS_BYTE_MAKS);
}

/** Batas waktu setelah dijepit ke rentang [1, WAKTU_MAKS_MS]. */
export function waktuTungguMs(n?: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return WAKTU_BAWAAN_MS;
  return Math.min(Math.floor(v), WAKTU_MAKS_MS);
}

/** Batas karakter setelah dijepit ke rentang [1, MAKS_KARAKTER_MAKS]. */
export function maksKarakterTerapkan(n?: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return MAKS_KARAKTER_BAWAAN;
  return Math.min(Math.floor(v), MAKS_KARAKTER_MAKS);
}

export interface HasilPotong {
  teks: string;
  byte: number;
  totalByte: number;
  terpotong: boolean;
}

/**
 * Potong teks pada batas BYTE, bukan batas karakter.
 *
 * `str.length` menghitung unit UTF-16, jadi memotong dengannya bisa
 * meninggalkan setengah karakter multi-byte. Pemotongan di sini dilakukan pada
 * `Uint8Array`, lalu sisa byte separuh karakter di ujung dibuang supaya hasilnya
 * tidak berakhir dengan U+FFFD ("karakter pengganti") yang membingungkan pembaca.
 */
export function potongByte(teks: string, batasByte: number): HasilPotong {
  const isi = String(teks ?? '');
  const buf = enc.encode(isi);
  const total = buf.length;
  const batas = Math.max(1, Math.floor(batasByte));
  if (total <= batas) return { teks: isi, byte: total, totalByte: total, terpotong: false };
  const kepotong = buf.subarray(0, batas);
  let keluaran = dec.decode(kepotong);
  if (keluaran.endsWith('\uFFFD')) keluaran = keluaran.slice(0, -1);
  /* `byte` melaporkan byte yang BENAR-BENAR diserahkan, bukan panjang potongan
     mentah: sisa byte separuh karakter di ujung sudah dibuang di atas, dan
     menghitungnya sebagai terkirim akan membuat angka ini berbohong. */
  return { teks: keluaran, byte: enc.encode(keluaran).length, totalByte: total, terpotong: true };
}

/**
 * Potong teks pada batas karakter untuk diserahkan ke model, dengan penanda.
 * Penandanya penting: pembaca harus tahu bahwa ini bukan akhir dokumen.
 */
export function potongKarakter(
  teks: string,
  maksKarakter: number,
): { teks: string; dipotong: boolean; totalKarakter: number } {
  const isi = String(teks ?? '');
  const maks = Math.max(1, Math.floor(maksKarakter));
  const total = isi.length;
  if (total <= maks) return { teks: isi, dipotong: false, totalKarakter: total };
  const kepala = isi.slice(0, maks);
  return {
    teks: `${kepala}\n\n[... dipotong pada ${maks} dari ${total} karakter ...]`,
    dipotong: true,
    totalKarakter: total,
  };
}

/* ------------------------------------------------------------------ */
/* Sensor rahasia                                                      */
/* ------------------------------------------------------------------ */

/*
 * Pola di bawah SENGAJA menjaga tanda kutip dan titik dua tetap utuh, supaya
 * JSON yang sudah disensor masih JSON yang sah. Kalau pola menelan tanda
 * kutipnya, hasilnya berhenti bisa di-parse dan sensor justru merusak manfaat
 * "JSON dibaca sebagai data".
 */
const POLA_RAHASIA: readonly RegExp[] = [
  /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /(https?:\/\/[^/\s:@]+:)[^@\s/]+(@)/g,
  /(["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization|private[_-]?key)["']?\s*[:=]\s*)(["'])(?:[^"'\n]{8,})\2/gi,
  /(["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization)["']?\s*[:=]\s*)([^"'\s,;&<>]{8,})/gi,
];

/**
 * Ganti token/kunci yang ikut tersedot dengan penanda.
 *
 * Ini jaring kedua, bukan jaring utama: yang utama adalah tidak pernah mengirim
 * kredensial ke mana pun (lihat `uji-fetch-web.mjs` yang memeriksa setiap
 * header permintaan). Halaman bisa saja memuat kunci milik orang lain.
 */
export function saringRahasiaWeb(teks: string): string {
  let isi = String(teks ?? '');
  for (const pola of POLA_RAHASIA) {
    isi = isi.replace(pola, (cocok, ...grup: unknown[]) => {
      const g = grup.slice(0, -2) as Array<string | undefined>;
      /* Bentuk `https://user:rahasia@host`: pertahankan bentuk URL-nya. */
      if (cocok.startsWith('http://') || cocok.startsWith('https://')) {
        return `${g[0] ?? ''}${PENANDA_SENSOR}${g[1] ?? ''}`;
      }
      const g0 = g[0];
      const g1 = g[1];
      /* Bentuk ber-tanda-kutip: kutip penutupnya WAJIB ikut dikembalikan,
         kalau tidak JSON yang sudah disensor berhenti bisa di-parse. */
      if (typeof g0 === 'string' && (g1 === '"' || g1 === "'")) {
        return `${g0}${g1}${PENANDA_SENSOR}${g1}`;
      }
      if (typeof g0 === 'string') return `${g0}${PENANDA_SENSOR}`;
      return PENANDA_SENSOR;
    });
  }
  return isi;
}

/* ------------------------------------------------------------------ */
/* Gerbang jalur berkas                                                */
/* ------------------------------------------------------------------ */

/*
 * Jalur yang ditolak untuk menyimpan hasil. Daftar ini mirror dari gerbang tulis
 * yang sudah dipakai agen (`periksaTulis`): hasil unduhan tidak boleh menimpa
 * kredensial, kunci, riwayat git, maupun berkas konfigurasi mesin.
 */
const POLA_JALUR_TOLAK: ReadonlyArray<[RegExp, string]> = [
  [/[\u0000]/, 'jalur memuat byte nol'],
  [/^[a-zA-Z]:[\\/]/, 'jalur absolut Windows tidak diizinkan'],
  [/^\\\\/, 'jalur UNC tidak diizinkan'],
  [/^\//, 'jalur absolut POSIX tidak diizinkan'],
  [/(^|[\\/])\.\.([\\/]|$)/, 'jalur memuat ..'],
  [/(^|[\\/])\.env(\.[^\\/]*)?$/i, 'berkas .env tidak boleh ditimpa'],
  [/\.(pem|key|p12|pfx|jks|keystore)$/i, 'berkas kunci/privat tidak boleh ditimpa'],
  [/(^|[\\/])\.ssh([\\/]|$)/i, 'direktori .ssh tidak boleh ditulis'],
  [/(^|[\\/])\.aws([\\/]|$)/i, 'direktori .aws tidak boleh ditulis'],
  [/(^|[\\/])\.git([\\/]|$)/i, 'direktori .git tidak boleh ditulis'],
  [
    /(^|[\\/])(id_rsa|id_ed25519|credentials|\.netrc|\.npmrc|\.git-credentials)$/i,
    'berkas kredensial tidak boleh ditimpa',
  ],
];

/** Apakah jalur ini boleh ditulisi hasil ambil-web? */
export function periksaJalurSimpan(jalur: string): { ok: boolean; sebab: string } {
  const j = String(jalur ?? '').trim();
  if (!j) return { ok: false, sebab: 'jalur kosong' };
  if (j.length > 512) return { ok: false, sebab: 'jalur terlalu panjang' };
  for (const [pola, sebab] of POLA_JALUR_TOLAK) {
    if (pola.test(j)) return { ok: false, sebab };
  }
  return { ok: true, sebab: '' };
}

/* ------------------------------------------------------------------ */
/* Orkestrasi pengambilan                                              */
/* ------------------------------------------------------------------ */

/** Opsi yang diterima transport. Bentuknya tetap: tidak ada tempat menitip kredensial. */
export interface OpsiTransport {
  waktuMs: number;
  maksByte: number;
}

/** Satu jawaban mentah dari transport. */
export interface IsiBalikan {
  status: number;
  header?: Record<string, string>;
  body: string;
  url?: string;
}

/**
 * Transport: satu-satunya jalan keluar dari modul ini.
 *
 * Disuntikkan, bukan diimpor. Di aplikasi isinya memanggil perintah Tauri; di
 * uji isinya peta tetap di memori; tidak ada satu pun jalur di sini yang
 * memakai shell.
 */
export interface TransportAmbilWeb {
  (url: string, opsi: OpsiTransport): Promise<IsiBalikan>;
}

export interface PermintaanAmbilWeb {
  url: string;
  izin?: IzinAmbilWeb;
  batasByte?: number;
  waktuMs?: number;
  maksKarakter?: number;
  /** `auto` (bawaan) memutuskan dari content-type lalu dari bentuk isi. */
  sebagai?: 'auto' | 'teks' | 'json';
  /** Bawaan true. Setiap hop redirect diperiksa ulang seperti URL pertama. */
  ikutiRedirect?: boolean;
}

export interface HasilAmbilWeb {
  ok: boolean;
  sebab: string;
  url: string;
  urlAkhir: string;
  status: number;
  header: Record<string, string>;
  /** Teks yang dibaca model: JSON yang terbaca disajikan rapi, bukan mentah. */
  isi: string;
  /** JSON hasil parse. `null` kalau isi bukan JSON yang sah. */
  data: unknown;
  json: boolean;
  /** True kalau badan jawaban menyentuh batas byte. */
  terpotong: boolean;
  /** True kalau teks yang diserahkan ke model menyentuh batas karakter. */
  dipotongKarakter: boolean;
  byte: number;
  totalByte: number;
  /** URL yang dilewati, termasuk hop redirect. Bukti tiap hop diperiksa. */
  dilalui: string[];
  durasiMs: number;
}

type HasilTunggu<T> =
  | { jenis: 'nilai'; nilai: T }
  | { jenis: 'waktu' }
  | { jenis: 'galat'; pesan: string };

function pesanGalat(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Balapan janji melawan batas waktu.
 *
 * Modul menegakkan ini SENDIRI, tanpa bergantung pada transport. Transport yang
 * lupa memasang timeout hanya akan membuat satu panggilan lambat, bukan agen
 * yang menggantung selamanya.
 */
export function denganBatasWaktu<T>(janji: Promise<T>, waktuMs: number): Promise<HasilTunggu<T>> {
  return new Promise((selesai) => {
    let sudah = false;
    const jam = setTimeout(() => {
      if (sudah) return;
      sudah = true;
      selesai({ jenis: 'waktu' });
    }, waktuMs);
    janji.then(
      (nilai) => {
        if (sudah) return;
        sudah = true;
        clearTimeout(jam);
        selesai({ jenis: 'nilai', nilai });
      },
      (e: unknown) => {
        if (sudah) return;
        sudah = true;
        clearTimeout(jam);
        selesai({ jenis: 'galat', pesan: pesanGalat(e) });
      },
    );
  });
}

function normalkanHeader(h?: Record<string, string>): Record<string, string> {
  const keluar: Record<string, string> = {};
  if (!h) return keluar;
  for (const [k, v] of Object.entries(h)) keluar[k.toLowerCase()] = String(v);
  return keluar;
}

function bertipeJson(header: Record<string, string>): boolean {
  const ct = header['content-type'] ?? '';
  return /application\/json|\+json/.test(ct.toLowerCase());
}

function berbauJson(teks: string): boolean {
  const t = teks.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

/**
 * Ambil satu URL: periksa, ambil, potong, baca sebagai data, sensor.
 *
 * Tidak ada `throw` untuk kegagalan yang wajar (izin, waktu, transport): semua
 * dilaporkan lewat `ok`/`sebab`, jadi pemanggil tidak perlu membedakan "gagal
 * karena kebijakan" dari "gagal karena jaringan" lewat exception.
 */
export async function ambilWeb(
  permintaan: PermintaanAmbilWeb,
  transport: TransportAmbilWeb,
): Promise<HasilAmbilWeb> {
  const mulai = Date.now();
  const izin = permintaan.izin ?? IZIN_TOLAK;
  const batasByte = batasByteTerapkan(permintaan.batasByte);
  const waktuMs = waktuTungguMs(permintaan.waktuMs);
  const maksKarakter = maksKarakterTerapkan(permintaan.maksKarakter);
  const sebagai = permintaan.sebagai ?? 'auto';
  const ikutiRedirect = permintaan.ikutiRedirect !== false;
  const urlMinta = String(permintaan.url ?? '').trim();
  const dilalui: string[] = [];

  const gagal = (sebab: string, url: string, ekstra?: Partial<HasilAmbilWeb>): HasilAmbilWeb => ({
    ok: false,
    sebab,
    url: urlMinta,
    urlAkhir: url,
    status: 0,
    header: {},
    isi: '',
    data: null,
    json: false,
    terpotong: false,
    dipotongKarakter: false,
    byte: 0,
    totalByte: 0,
    dilalui: [...dilalui],
    durasiMs: Date.now() - mulai,
    ...ekstra,
  });

  let url = urlMinta;

  for (let hop = 0; hop <= MAKS_REDIRECT; hop++) {
    const periksa = periksaUrlAmbilWeb(url, izin);
    if (!periksa.ok) return gagal(periksa.sebab, url);
    dilalui.push(url);

    const tunggu = await denganBatasWaktu(
      transport(url, { waktuMs, maksByte: batasByte }),
      waktuMs,
    );
    if (tunggu.jenis === 'waktu') {
      return gagal(`waktu tunggu habis (${waktuMs} ms)`, url);
    }
    if (tunggu.jenis === 'galat') {
      return gagal(`transport gagal: ${tunggu.pesan}`, url);
    }

    const balik = tunggu.nilai;
    const status = Number(balik.status) || 0;
    const header = normalkanHeader(balik.header);
    const urlBalik = typeof balik.url === 'string' && balik.url ? balik.url : url;

    if (ikutiRedirect && status >= 300 && status < 400 && header.location) {
      if (hop === MAKS_REDIRECT) {
        return gagal(`terlalu banyak redirect (lebih dari ${MAKS_REDIRECT})`, url, { status });
      }
      let lanjut: string;
      try {
        lanjut = new URL(header.location, url).toString();
      } catch {
        return gagal('header location tidak bisa dibaca', url, { status });
      }
      url = lanjut;
      continue;
    }

    const body = String(balik.body ?? '');
    const potong = potongByte(body, batasByte);
    /* Sensor dijalankan SEBELUM parse, jadi nilai di dalam `data` pun sudah
       bersih. Sensor menjaga tanda kutip tetap utuh supaya hasilnya tetap JSON. */
    const bersih = saringRahasiaWeb(potong.teks);

    let data: unknown = null;
    let json = false;
    let catatan = '';
    const mauJson = sebagai === 'json' || (sebagai === 'auto' && bertipeJson(header)) ||
      (sebagai === 'auto' && berbauJson(bersih));
    if (mauJson) {
      try {
        data = JSON.parse(bersih);
        json = true;
      } catch {
        json = false;
        catatan = potong.terpotong
          ? 'isi terpotong di tengah JSON - data tidak dibaca'
          : 'content-type JSON tetapi isi tidak bisa dibaca sebagai JSON';
      }
    }

    const teksModel = json ? JSON.stringify(data, null, 1) : bersih;
    const potongKar = potongKarakter(teksModel, maksKarakter);

    return {
      ok: true,
      sebab: catatan,
      url: urlMinta,
      urlAkhir: urlBalik,
      status,
      header,
      isi: potongKar.teks,
      data,
      json,
      terpotong: potong.terpotong,
      dipotongKarakter: potongKar.dipotong,
      byte: potong.byte,
      totalByte: potong.totalByte,
      dilalui: [...dilalui],
      durasiMs: Date.now() - mulai,
    };
  }

  return gagal(`terlalu banyak redirect (lebih dari ${MAKS_REDIRECT})`, url);
}

/* ------------------------------------------------------------------ */
/* Menulis hasil ke berkas                                             */
/* ------------------------------------------------------------------ */

/**
 * Penulis berkas yang disuntikkan.
 *
 * Modul ini tidak mengimpor `node:fs` dan tidak memanggil `cmd.fsWrite`:
 * penulisnya datang dari luar. Di aplikasi itu gerbang tulis yang sudah ada;
 * di uji itu `fs` Node yang menulis ke direktori sementara.
 */
export interface PenulisBerkas {
  (jalur: string, isi: string): Promise<void> | void;
}

export interface HasilTulis {
  ok: boolean;
  sebab: string;
  jalur: string;
  byte: number;
}

/**
 * Simpan isi hasil ambil-web ke berkas.
 *
 * Gerbang jalur dijalankan lebih dulu (`periksaJalurSimpan`), lalu isi dipotong
 * pada `BATAS_TULIS_BYTE`. Tidak ada shell di jalur ini: satu fungsi, satu
 * berkas, satu penulis.
 */
export async function tulisHasilAmbilWeb(
  jalur: string,
  isi: string,
  tulis: PenulisBerkas,
): Promise<HasilTulis> {
  const cek = periksaJalurSimpan(jalur);
  if (!cek.ok) return { ok: false, sebab: cek.sebab, jalur, byte: 0 };
  const teks = String(isi ?? '');
  if (!teks) return { ok: false, sebab: 'isi kosong', jalur, byte: 0 };
  const potong = potongByte(teks, BATAS_TULIS_BYTE);
  try {
    await tulis(jalur, potong.teks);
  } catch (e: unknown) {
    return { ok: false, sebab: `gagal tulis: ${pesanGalat(e)}`, jalur, byte: 0 };
  }
  return { ok: true, sebab: '', jalur, byte: potong.byte };
}
