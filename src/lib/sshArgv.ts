/*
 * sshArgv — penyusun argumen MURNI untuk ssh / scp / sftp.
 *
 * ## Kenapa berkas ini ada
 *
 * `ssh_connect` (src-tauri/src/ssh.rs:240) membuka PTY untuk manusia, dan
 * `sftp.rs:85` (`args_umum`) menyusun argumennya sendiri. Yang belum ada:
 * satu tempat yang MENJAMIN bentuk argumen sebelum ada proses yang benar-benar
 * dijalankan — supaya invarian keamanannya bisa diuji tanpa host dan tanpa
 * jaringan (lihat scripts/uji-ssh-aman.mjs).
 *
 * ## Tiga aturan yang dikunci di sini (dan diuji)
 *
 * 1. **Keluaran selalu DAFTAR argumen (`string[]`), tidak pernah satu string
 *    shell.** Tidak ada `join(' ')` yang dipakai untuk menjalankan apa pun,
 *    jadi `;`, `&&`, kutip, dan spasi di dalam satu token tidak bisa memecah
 *    perintah. Pemanggil yang ingin menggabungkan token untuk DILIHAT harus
 *    memakai `teksArgv()` yang hanya untuk tampilan.
 * 2. **Host/user/port/kunci ditolak kalau tidak sah.** Token yang diawali `-`
 *    ditolak karena OpenSSH membacanya sebagai OPSI, bukan sebagai host
 *    (terukur: `ssh '-oProxyCommand=touch x'` dibaca sebagai opsi, bukan host).
 *    ProxyCommand/LocalCommand juga masuk daftar opsi terlarang.
 * 3. **Opsi keamanan selalu ikut, dan dibuat DULU.** `BatchMode=yes` (tidak
 *    pernah jatuh ke prompt kata sandi), `StrictHostKeyChecking` hanya boleh
 *    `accept-new` atau `yes` (`no` tidak pernah dihasilkan), `UserKnownHostsFile`
 *    menunjuk berkas milik aplikasi supaya catatan host-key benar-benar ada,
 *    `IdentityAgent=none` (agen SSH dimatikan kecuali diminta), dan `-F` ke
 *    berkas config milik aplikasi supaya `~/.ssh/config` milik user — yang bisa
 *    memuat ProxyCommand/LocalCommand — tidak ikut terbaca.
 *
 * Kata sandi TIDAK PERNAH bisa masuk ke sini: `TargetSsh` tidak punya field
 * kata sandi sama sekali, dan `jagaArgv()` menolak argv yang memuat kunci
 * privat / flag kata sandi CLI / penugasan `password=`.
 *
 * Berkas ini murni: tanpa Tauri, tanpa jaringan, tanpa berkas, tanpa proses.
 */

export type ModeSsh = 'ssh' | 'scp' | 'sftp';

/** `accept-new` = percaya kunci host pada pemakaian pertama TAPI mencatatnya
 *  ke `UserKnownHostsFile`; `pin` = hanya boleh lanjut kalau host sudah
 *  tercatat/cocok dengan `fingerprint` yang diminta. `no` (yang menerima kunci
 *  berubah tanpa catatan) tidak pernah dihasilkan modul ini. */
export type KebijakanHostKey = 'accept-new' | 'pin';

export interface TargetSsh {
  /** ID koneksi seperti di `ssh.json`; wajib ada agar izin bisa per-target. */
  id: string;
  host: string;
  user: string;
  port: number;
  auth: 'key' | 'password';
  /** Wajib saat `auth === 'key'`. Hanya PATH-nya; isi kunci tidak pernah lewat sini. */
  keyPath?: string;
  /** Bawaan `accept-new`. `pin` mewajibkan `fingerprint`. */
  hostKeyPolicy?: KebijakanHostKey;
  /** `SHA256:...` hasil `ssh-keyscan`/konfirmasi user. Wajib saat `pin`. */
  fingerprint?: string;
}

export interface OpsiSsh {
  /** Berkas known_hosts milik aplikasi (WAJIB). Nilainya masuk ke `-o`, jadi
   *  dipakai apa adanya — lihat `kutipNilaiOpsi()` untuk jalur berspasi. */
  knownHostsFile: string;
  /** Berkas config milik aplikasi (WAJIB). Harus SUDAH ADA kalau tidak ssh
   *  gagal "Can't open user config file" (terukur: exit 255) — buat berkas
   *  kosong dulu di sisi Rust. */
  configFile: string;
  /** Bawaan 20000 ms, diubah ke detik untuk `ConnectTimeout`. */
  connectTimeoutMs?: number;
  serverAliveIntervalSec?: number;
  serverAliveCountMax?: number;
  /** Bawaan `false` ⇒ `IdentityAgent=none`. Agen SSH bisa menyimpan kunci
   *  lain; jalur agen harus diminta secara sadar. */
  gunakanAgen?: boolean;
  /** `-o` tambahan. Hanya nama dari `OPSI_DIIZINKAN` yang diterima. */
  opsiTambahan?: Record<string, string>;
}

export interface JalurSsh {
  bin: ModeSsh;
  /** Argumen TANPA nama program: tidak pernah digabung jadi string shell. */
  argv: string[];
}

export type KodeGalatSsh =
  | 'host-tidak-sah'
  | 'user-tidak-sah'
  | 'port-tidak-sah'
  | 'auth-tidak-sah'
  | 'kunci-tidak-sah'
  | 'fingerprint-tidak-sah'
  | 'opsi-lingkungan-tidak-sah'
  | 'opsi-dilarang'
  | 'opsi-tidak-dikenal'
  | 'perintah-tidak-sah'
  | 'rahasia-di-argv';

export class GalatSsh extends Error {
  readonly kode: KodeGalatSsh;

  constructor(kode: KodeGalatSsh, pesan: string) {
    super(pesan);
    this.name = 'GalatSsh';
    this.kode = kode;
  }
}

export const PORT_MIN = 1;
export const PORT_MAX = 65535;
export const TIMEOUT_MS_BAWAAN = 20000;
export const TIMEOUT_MS_MIN = 1000;
export const TIMEOUT_MS_MAX = 300000;
export const SERVER_ALIVE_DETIK = 15;
export const SERVER_ALIVE_MAKS = 3;

/*
 * Opsi yang TIDAK boleh disetel pemanggil.
 *
 * ProxyCommand/LocalCommand/KnownHostsCommand menjalankan perintah LOKAL — satu
 * opsi saja sudah cukup untuk keluar dari "ini cuma SSH" dan menjadi eksekusi
 * kode lokal. IdentityAgent/IdentityFile/UserKnownHostsFile/StrictHostKeyChecking/
 * BatchMode juga dilarang karena kalau pemanggil boleh menyetelnya, ia bisa
 * membatalkan jaminan yang baru saja dipasang di atas.
 */
export const OPSI_DILARANG: readonly string[] = [
  'proxycommand',
  'proxyjump',
  'proxyusefdpass',
  'localcommand',
  'permitlocalcommand',
  'knownhostscommand',
  'identityagent',
  'identityfile',
  'userknownhostsfile',
  'globalknownhostsfile',
  'stricthostkeychecking',
  'batchmode',
  'sendenv',
  'setenv',
  'remotecommand',
  'forwardagent',
  'forwardx11',
  'forwardx11trusted',
  'dynamicforward',
  'localforward',
  'remoteforward',
  'localcommand',
  'hostname',
  'port',
  'user',
  'hostkeyalias',
];

/** Opsi yang boleh: hanya yang membentuk CARA menyambung, bukan APA yang dijalankan. */
export const OPSI_DIIZINKAN: readonly string[] = [
  'addressfamily',
  'ciphers',
  'compression',
  'connecttimeout',
  'hostkeyalgorithms',
  'ipqos',
  'kexalgorithms',
  'loglevel',
  'macs',
  'preferredauthentications',
  'pubkeyauthentication',
  'serveralivecountmax',
  'serveraliveinterval',
  'tcpkeepalive',
  'updatehostkeys',
  'verifyhostkeydns',
  'certificatefile',
  'requesttty',
];

/* ------------------------------------------------------------------ */
/* Validasi (semua menerima `unknown`: nilai dari JSON/args bisa apa saja) */
/* ------------------------------------------------------------------ */

function teks(v: unknown): v is string {
  return typeof v === 'string';
}

/** Karakter kontrol termasuk \n, \r, \0, dan ESC. */
function adaKontrol(s: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(s);
}

/** Satu label DNS: huruf/angka/`_`, boleh `-` di tengah, tidak di tepi. */
const LABEL_HOST = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/;
const POLA_IPV6 = /^[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}$/;

/**
 * Host: nama DNS atau IPv6. Tanda kurung `[::1]` ditolak (ssh tidak memakainya),
 * begitu juga spasi, `;`, `|`, `&`, `$`, backtick, dan awalan `-`.
 */
export function hostSah(host: unknown): boolean {
  if (!teks(host)) return false;
  if (host.length === 0 || host.length > 253) return false;
  if (adaKontrol(host)) return false;
  if (host.includes(':')) return POLA_IPV6.test(host);
  return host.split('.').every((b) => LABEL_HOST.test(b));
}

/** User: token tunggal tanpa spasi/`@`/`:` dan tanpa awalan `-`. */
const POLA_USER = /^[A-Za-z0-9_](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9_])?$/;

export function userSah(user: unknown): boolean {
  return teks(user) && POLA_USER.test(user);
}

/** Port: bilangan bulat 1..65535. `0`, `70000`, `22.5`, dan `"22"` ditolak. */
export function portSah(port: unknown): boolean {
  return (
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port >= PORT_MIN &&
    port <= PORT_MAX
  );
}

/**
 * Berkas kunci privat: non-kosong, tanpa karakter kontrol, tidak diawali `-`.
 * Spasi DIIZINKAN karena nilai `-i` adalah satu elemen argv tersendiri (ssh
 * membacanya apa adanya; tidak ada pemecahan seperti pada nilai `-o`).
 */
export function kunciSah(path: unknown): boolean {
  if (!teks(path)) return false;
  if (path.length === 0 || path.length > 4096) return false;
  if (adaKontrol(path)) return false;
  if (path.startsWith('-')) return false;
  return true;
}

/** `SHA256:` + 43 karakter base64 (+`=` opsional) seperti keluaran ssh-keyscan. */
export function fingerprintSah(f: unknown): boolean {
  return teks(f) && /^SHA256:[A-Za-z0-9+/]{43}=?$/.test(f);
}

/**
 * Berkas yang nilainya masuk ke `-o` (known_hosts, config, nilai opsi).
 *
 * Dipakai `kutipNilaiOpsi()`, jadi spasi BOLEH ada di dalamnya — tetapi tanda
 * kutip ganda tidak boleh, karena kutip itulah yang dipakai untuk membungkusnya.
 */
export function berkasOpsiSah(p: unknown): boolean {
  if (!teks(p)) return false;
  if (p.length === 0 || p.length > 4096) return false;
  if (adaKontrol(p)) return false;
  if (p.includes('"')) return false;
  if (p.startsWith('-')) return false;
  return true;
}

/** Cuplikan pendek untuk pesan galat: nilai rahasia/panjang tidak ikut tercetak. */
function cuplik(v: unknown): string {
  const s = teks(v) ? v : String(v);
  const bersih = s.replace(/[\u0000-\u001F\u007F]/g, '·');
  return bersih.length > 40 ? `${bersih.slice(0, 40)}…` : bersih;
}

function pesanGalat(kode: KodeGalatSsh, t: Partial<TargetSsh>): string {
  switch (kode) {
    case 'host-tidak-sah':
      return `host tidak sah: ${cuplik(t.host)} (hanya nama DNS/IPv6, tanpa spasi atau karakter shell, dan tidak boleh diawali "-")`;
    case 'user-tidak-sah':
      return `user tidak sah: ${cuplik(t.user)} (satu token, tanpa spasi/@"":", tidak diawali "-")`;
    case 'port-tidak-sah':
      return `port tidak sah: ${cuplik(t.port)} (harus bilangan bulat ${PORT_MIN}-${PORT_MAX})`;
    case 'auth-tidak-sah':
      return `auth tidak sah: ${cuplik(t.auth)} (hanya 'key' atau 'password')`;
    case 'kunci-tidak-sah':
      return `berkas kunci tidak sah: ${cuplik(t.keyPath)} (wajib saat auth='key')`;
    case 'fingerprint-tidak-sah':
      return 'host-key policy tidak sah: "pin" butuh fingerprint tercatat (SHA256:...) — host tidak boleh dipercaya otomatis tanpa catatan';
    default:
      return `target tidak sah (${kode})`;
  }
}

/**
 * Daftar kode galat target, terurut. Kosong = target boleh dipakai.
 * Dipakai oleh UI/harness sebelum memanggil `susunArgv()`.
 */
export function validasiTarget(t: unknown): KodeGalatSsh[] {
  if (!t || typeof t !== 'object') return ['host-tidak-sah'];
  const o = t as Partial<TargetSsh>;
  const g: KodeGalatSsh[] = [];
  if (!hostSah(o.host)) g.push('host-tidak-sah');
  if (!userSah(o.user)) g.push('user-tidak-sah');
  if (!portSah(o.port)) g.push('port-tidak-sah');
  if (o.auth !== 'key' && o.auth !== 'password') g.push('auth-tidak-sah');
  if (o.auth === 'key' && !kunciSah(o.keyPath)) g.push('kunci-tidak-sah');
  const kebijakan = o.hostKeyPolicy ?? 'accept-new';
  if (kebijakan !== 'accept-new' && kebijakan !== 'pin') g.push('fingerprint-tidak-sah');
  if (kebijakan === 'pin' && !fingerprintSah(o.fingerprint)) {
    g.push('fingerprint-tidak-sah');
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Pengutipan (dua macam, dan tidak boleh tertukar)                    */
/* ------------------------------------------------------------------ */

/**
 * Kutip NILAI `-o` untuk parser config milik OpenSSH (bukan shell).
 *
 * Terukur di mesin ini (OpenSSH_10.2p1): tanpa kutip, `-o UserKnownHostsFile=/a b/x`
 * diam-diam dipotong di spasi menjadi `/a` — berkas catatan host-key pindah ke
 * tempat lain TANPA galat. Dengan kutip, nilainya utuh.
 */
export function kutipNilaiOpsi(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/** Token yang tidak perlu dikutip saat perintah remote disusun. */
const AMAN_DI_RUJUKAN = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Kutip satu token dengan aturan POSIX (`'` → `'\''`) untuk dikirim ke shell
 * REMOTE. Ini bukan pelarian dari shell lokal — tidak ada shell lokal di sini.
 */
export function kutipTokenRujukan(kata: string): string {
  if (AMAN_DI_RUJUKAN.test(kata)) return kata;
  return `'${kata.split("'").join("'\\''")}'`;
}

/** Rangkai token perintah remote jadi SATU string (dikutip per token). */
export function teksPerintah(perintah: readonly string[]): string {
  return perintah.map(kutipTokenRujukan).join(' ');
}

/* ------------------------------------------------------------------ */
/* Pagar rahasia                                                       */
/* ------------------------------------------------------------------ */

const POLA_KUNCI_PRIVAT = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----/;
const POLA_SANDI_ARGV =
  /(?:^|\s)(?:sshpass\s+-p|--password=|-pw=|-pw\s|passwd=|password=|passphrase=)/i;
const POLA_BEARER = /authorization:\s*bearer\s+\S/i;

/**
 * Tolak argv yang MEMBAWA rahasia hidup.
 *
 * Argumen bisa dibaca proses lain di mesin yang sama (Task Manager, `ps`), jadi
 * kata sandi lewat argv adalah kebocoran, bukan sekadar kerapian. Kalau memang
 * perlu mengirim rahasia ke remote, kirim lewat stdin.
 */
export function jagaArgv(argv: readonly string[]): void {
  for (const a of argv) {
    if (POLA_KUNCI_PRIVAT.test(a)) {
      throw new GalatSsh(
        'rahasia-di-argv',
        'argv memuat blok kunci privat — kunci hanya boleh lewat berkas, bukan argumen'
      );
    }
    if (POLA_SANDI_ARGV.test(a)) {
      throw new GalatSsh(
        'rahasia-di-argv',
        `argv memuat kata sandi: ${cuplik(a)} — kirim lewat stdin, bukan argumen`
      );
    }
    if (POLA_BEARER.test(a)) {
      throw new GalatSsh(
        'rahasia-di-argv',
        'argv memuat header Authorization — token tidak boleh lewat argumen'
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Penyusun                                                            */
/* ------------------------------------------------------------------ */

function periksaLingkungan(o: OpsiSsh): void {
  if (!berkasOpsiSah(o.knownHostsFile)) {
    throw new GalatSsh(
      'opsi-lingkungan-tidak-sah',
      `knownHostsFile tidak sah: ${cuplik(o.knownHostsFile)} (wajib, tanpa karakter kontrol atau tanda kutip ganda)`
    );
  }
  if (!berkasOpsiSah(o.configFile)) {
    throw new GalatSsh(
      'opsi-lingkungan-tidak-sah',
      `configFile tidak sah: ${cuplik(o.configFile)} (wajib; berkasnya harus sudah ada, kalau tidak ssh gagal "Can't open user config file")`
    );
  }
  const to = o.connectTimeoutMs ?? TIMEOUT_MS_BAWAAN;
  if (
    typeof to !== 'number' ||
    !Number.isInteger(to) ||
    to < TIMEOUT_MS_MIN ||
    to > TIMEOUT_MS_MAX
  ) {
    throw new GalatSsh(
      'opsi-lingkungan-tidak-sah',
      `connectTimeoutMs tidak sah: ${cuplik(to)} (${TIMEOUT_MS_MIN}-${TIMEOUT_MS_MAX} ms)`
    );
  }
  const opsi = o.opsiTambahan ?? {};
  for (const kunci of Object.keys(opsi)) {
    const lk = kunci.toLowerCase();
    if (OPSI_DILARANG.indexOf(lk) !== -1) {
      throw new GalatSsh(
        'opsi-dilarang',
        `opsi "${kunci}" dilarang: opsi ini bisa menjalankan perintah lokal atau membatalkan jaminan keamanan modul ini`
      );
    }
    if (OPSI_DIIZINKAN.indexOf(lk) === -1) {
      throw new GalatSsh(
        'opsi-tidak-dikenal',
        `opsi "${kunci}" tidak ada di daftar putih (OPSI_DIIZINKAN)`
      );
    }
    const nilai = opsi[kunci];
    if (!teks(nilai) || nilai.length === 0 || adaKontrol(nilai) || /\s/.test(nilai)) {
      throw new GalatSsh(
        'opsi-lingkungan-tidak-sah',
        `nilai opsi "${kunci}" tidak sah: ${cuplik(nilai)}`
      );
    }
  }
}

/**
 * Susun argumen untuk ssh/scp/sftp. Melempar `GalatSsh` kalau target atau
 * lingkungan tidak sah. Tidak menyentuh jaringan, berkas, atau proses.
 */
export function susunArgv(t: TargetSsh, o: OpsiSsh, mode: ModeSsh = 'ssh'): string[] {
  const galat = validasiTarget(t);
  if (galat.length > 0) throw new GalatSsh(galat[0], pesanGalat(galat[0], t));
  if (mode !== 'ssh' && mode !== 'scp' && mode !== 'sftp') {
    throw new GalatSsh('perintah-tidak-sah', `mode tidak dikenal: ${cuplik(mode)}`);
  }
  periksaLingkungan(o);

  const kebijakan: KebijakanHostKey = t.hostKeyPolicy ?? 'accept-new';
  const timeoutDetik = Math.max(
    1,
    Math.round((o.connectTimeoutMs ?? TIMEOUT_MS_BAWAAN) / 1000)
  );

  /*
   * Urutan disengaja: opsi keamanan lebih dulu. OpenSSH memakai nilai PERTAMA
   * yang ia lihat untuk hampir semua opsi ("first obtained value"), jadi
   * menaruhnya di depan membuat opsi pemanggil tidak bisa menimpanya.
   */
  const argv: string[] = [
    '-o', 'BatchMode=yes',
    '-o', `StrictHostKeyChecking=${kebijakan === 'pin' ? 'yes' : 'accept-new'}`,
    '-o', `UserKnownHostsFile=${kutipNilaiOpsi(o.knownHostsFile)}`,
    '-o', `ConnectTimeout=${timeoutDetik}`,
    '-o', `ServerAliveInterval=${o.serverAliveIntervalSec ?? SERVER_ALIVE_DETIK}`,
    '-o', `ServerAliveCountMax=${o.serverAliveCountMax ?? SERVER_ALIVE_MAKS}`,
    '-o', 'TCPKeepAlive=yes',
    '-o', o.gunakanAgen === true ? 'IdentityAgent=SSH_AUTH_SOCK' : 'IdentityAgent=none',
  ];

  /* Tanpa ini ssh menawarkan SEMUA kunci yang ia punya ke host; host bisa
   * menolaknya karena terlalu banyak percobaan, dan kunci lain ikut terpakai. */
  if (t.auth === 'key') argv.push('-o', 'IdentitiesOnly=yes');

  /* Config milik aplikasi: `~/.ssh/config` milik user bisa memuat ProxyCommand
   * dan LocalCommand, yang berarti perintah lokal selama koneksi. */
  argv.push('-F', o.configFile);

  for (const kunci of Object.keys(o.opsiTambahan ?? {})) {
    argv.push('-o', `${kunci}=${kutipNilaiOpsi((o.opsiTambahan ?? {})[kunci])}`);
  }

  if (t.auth === 'key' && teks(t.keyPath)) argv.push('-i', t.keyPath);

  /* scp/sftp memakai -P (huruf besar); ssh memakai -p. Record sftp.rs:122-123
   * sudah memakai -P untuk sftp — sama dengan di sini. */
  argv.push(mode === 'ssh' ? '-p' : '-P', String(t.port));

  /* Host selalu jadi token tersendiri dan user selalu menempel di dalamnya,
   * sehingga tokennya tidak pernah diawali `-` (sudah dijamin validasi di atas). */
  argv.push(`${t.user}@${t.host}`);

  jagaArgv(argv);
  return argv;
}

/** Sama seperti `susunArgv`, tapi sekaligus menyertakan nama program. */
export function susunJalur(t: TargetSsh, o: OpsiSsh, mode: ModeSsh = 'ssh'): JalurSsh {
  return { bin: mode, argv: susunArgv(t, o, mode) };
}

/**
 * Perintah remote terstruktur: setiap token dikutip, lalu digabung jadi SATU
 * elemen argv terakhir.
 *
 * Karena dikutip per token, `['echo', 'a; rm -rf /']` menjadi `echo 'a; rm -rf /'`
 * — tanda `;` jadi teks biasa di shell remote, bukan pemisah perintah. Jumlah
 * elemen argv tidak berubah, jadi tidak ada yang bisa memecah satu token menjadi
 * dua perintah.
 */
export function susunArgvJalankan(
  t: TargetSsh,
  o: OpsiSsh,
  perintah: readonly string[]
): JalurSsh {
  if (!Array.isArray(perintah) || perintah.length === 0) {
    throw new GalatSsh('perintah-tidak-sah', 'perintah remote kosong');
  }
  for (const bagian of perintah) {
    if (!teks(bagian) || bagian.length === 0) {
      throw new GalatSsh('perintah-tidak-sah', 'token perintah harus string tidak kosong');
    }
    if (adaKontrol(bagian)) {
      throw new GalatSsh(
        'perintah-tidak-sah',
        `token perintah memuat karakter kontrol: ${cuplik(bagian)}`
      );
    }
  }
  const argv = susunArgv(t, o, 'ssh');
  argv.push(teksPerintah(perintah));
  jagaArgv(argv);
  return { bin: 'ssh', argv };
}

/**
 * Skrip mentah dari agen: dikirim apa adanya sebagai SATU elemen argv.
 *
 * Shell REMOTE yang membacanya — itu memang tujuannya (agen menjalankan perintah
 * di host). Yang dikunci di sini: tidak ada shell LOKAL yang menyentuhnya, dan
 * skripnya tidak boleh membawa kunci privat/kata sandi ke tabel proses.
 */
export function susunArgvSkripMentah(t: TargetSsh, o: OpsiSsh, skrip: string): JalurSsh {
  if (!teks(skrip) || skrip.trim().length === 0) {
    throw new GalatSsh('perintah-tidak-sah', 'skrip remote kosong');
  }
  if (skrip.length > 65536) {
    throw new GalatSsh('perintah-tidak-sah', 'skrip remote terlalu panjang (>65536)');
  }
  const argv = susunArgv(t, o, 'ssh');
  argv.push(skrip);
  jagaArgv(argv);
  return { bin: 'ssh', argv };
}

/** scp: sama seperti `susunArgv('scp')` + sumber dan tujuan. */
export function susunArgvSalin(
  t: TargetSsh,
  o: OpsiSsh,
  sumber: string,
  tujuan: string
): JalurSsh {
  for (const p of [sumber, tujuan]) {
    if (!teks(p) || p.trim().length === 0) {
      throw new GalatSsh('perintah-tidak-sah', 'sumber/tujuan scp kosong');
    }
    if (adaKontrol(p) || p.startsWith('-')) {
      throw new GalatSsh(
        'perintah-tidak-sah',
        `sumber/tujuan scp tidak sah: ${cuplik(p)} (tanpa karakter kontrol, tidak diawali "-")`
      );
    }
  }
  const argv = susunArgv(t, o, 'scp');
  argv.push(sumber, tujuan);
  jagaArgv(argv);
  return { bin: 'scp', argv };
}

/** Teks argv untuk DILIHAT/log — bukan untuk dijalankan. */
export function teksArgv(bin: string, argv: readonly string[]): string {
  return [bin, ...argv].join(' ');
}

/** Nama field yang tidak boleh dipakai untuk membangun argv (dipakai sisi Rust/tool). */
export const FIELD_TERLARANG_DI_TARGET: readonly string[] = [
  'password',
  'passwordEnc',
  'password_enc',
  'passphrase',
  'privateKey',
  'private_key',
  'token',
];

/** true kalau objek target membrava field rahasia yang tidak kosong. */
export function targetMembawaRahasia(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  for (const nama of FIELD_TERLARANG_DI_TARGET) {
    const nilai = o[nama];
    if (teks(nilai) && nilai.length > 0) return true;
  }
  return false;
}
