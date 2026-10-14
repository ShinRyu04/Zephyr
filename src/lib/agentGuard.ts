/**
 * Penjaga sisi-agent: pola berkas rahasia, direktori terproteksi, dan
 * pembatas perintah shell.
 *
 * ## Kenapa berkas ini ada
 *
 * Batas keamanan Zephyr yang sebenarnya ada di Rust (`ensure_writable`,
 * `ensure_trusted`, `WorkspaceOutside`): operasi tulis di luar workspace
 * ditolak di sana, dan itu tidak bisa dilewati dari frontend. Berkas ini
 * BUKAN pengganti batas itu.
 *
 * Yang ia tambahkan adalah lapisan yang Rust sengaja tidak pegang: berkas
 * rahasia yang berada DI DALAM workspace. `%WORKSPACE%\.env`, `id_rsa`, dan
 * `.npmrc` semuanya sah menurut aturan "di dalam workspace", jadi batas Rust
 * meloloskannya. Tool baca yang berjalan tanpa persetujuan lalu bisa
 * mengirimkannya ke model tanpa user pernah melihatnya. Di situlah lapisan
 * ini bekerja, dan di situ ia harus tetap ada.
 *
 * Lapisan ini DEFENSE-IN-DEPTH, bukan sandbox. Model yang bandel masih bisa
 * diarahkan melakukan hal bodoh di jalur yang diizinkan. Pengaman sebenarnya
 * untuk tool tulis dan perintah shell adalah persetujuan user di UI.
 */

/* ------------------------------------------------------------------ */
/* Bentuk perbandingan                                                */
/* ------------------------------------------------------------------ */

/**
 * Bentuk normal dari jalur, hanya untuk PERBANDINGAN - tidak pernah dipakai
 * sebagai jalur nyata.
 *
 * Urutannya penting dan mengikuti perilaku Windows:
 *  - `\` -> `/`
 *  - buang awalan drive (`C:`) supaya cek bergaya-Unix konsisten
 *  - buang awalan UNC panjang (`\\?\`)
 *  - buang sufiks alternate-data-stream NTFS per segmen (`nama:stream`),
 *    karena `foo:stream` dibuka Windows sebagai `foo`
 *  - buang titik/spasi di ujung tiap segmen - `nama.` dan `nama ` dibuka
 *    sebagai `nama`, jadi tanpa ini `.env.` lolos dari pola `.env`
 *  - rapatkan garis miring ganda
 *  - perkecil huruf (NTFS tidak case-sensitive)
 *  - buang garis miring di ujung
 */
export function bentukBanding(p: string): string {
  let s = p.replace(/\\/g, '/');
  s = s.replace(/^\/\/\?\//, '/');
  s = s.replace(/^[a-zA-Z]:/, '');
  s = s
    .split('/')
    .map((seg) => {
      const colon = seg.indexOf(':');
      return colon === -1 ? seg : seg.slice(0, colon);
    })
    .join('/');
  s = s
    .split('/')
    .map((seg) => seg.replace(/[.\s]+$/, ''))
    .join('/');
  s = s.replace(/\/{2,}/g, '/');
  s = s.toLowerCase();
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

/* ------------------------------------------------------------------ */
/* Pola berkas rahasia (nama berkas)                                  */
/* ------------------------------------------------------------------ */

/**
 * Cocok pada NAMA berkas, bukan jalur. Akhiran sengaja TIDAK di-`$`-anchor:
 * Windows membuang titik/spasi di ujung saat membuka, dan jalur NTFS bisa
 * menyisipkan `:stream` di belakang nama. Pola berjangkar `$` akan melewatkan
 * `.env.` dan `.env::$DATA`, yang keduanya membuka `.env`.
 */
export const POLA_RAHASIA: RegExp[] = [
  /^\.env(\..+)?(?:[.\s:]|$)/i,
  /^.*\.pem(?:[.\s:]|$)/i,
  /^.*\.key(?:[.\s:]|$)/i,
  /^.*\.p12(?:[.\s:]|$)/i,
  /^.*\.pfx(?:[.\s:]|$)/i,
  /^.*\.asc(?:[.\s:]|$)/i,
  /^.*\.gpg(?:[.\s:]|$)/i,
  /^.*\.keystore(?:[.\s:]|$)/i,
  /^.*\.jks(?:[.\s:]|$)/i,
  /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?(?:[.\s:]|$)/i,
  /^known_hosts(?:[.\s:]|$)/i,
  /^authorized_keys(?:[.\s:]|$)/i,
  /^htpasswd(?:[.\s:]|$)/i,
  /^\.netrc(?:[.\s:]|$)/i,
  /^_netrc(?:[.\s:]|$)/i,
  /^credentials(?:[.\s:]|$)/i,
  /^\.pgpass(?:[.\s:]|$)/i,
  /^\.npmrc(?:[.\s:]|$)/i,
  /^\.pypirc(?:[.\s:]|$)/i,
  /^secrets?\.(json|ya?ml|toml|env)(?:[.\s:]|$)/i,
  /^service[-_]?account.*\.json(?:[.\s:]|$)/i,
  /^\.git-credentials(?:[.\s:]|$)/i,
];

/* ------------------------------------------------------------------ */
/* Direktori terproteksi                                              */
/* ------------------------------------------------------------------ */

/**
 * Tanpa garis miring di ujung. Dicocokkan sebagai segmen jalur: `/.ssh`
 * cocok untuk `/users/me/.ssh/config` tapi TIDAK untuk `/users/me/.sshx`.
 * Daftar ini berlaku di kedua platform; awalan drive sudah dibuang oleh
 * `bentukBanding`, jadi `/appdata/...` cocok di Windows juga.
 */
export const DIR_TERPROTEKSI: string[] = [
  '/.ssh',
  '/.gnupg',
  '/.aws',
  '/.azure',
  '/.kube',
  '/.docker',
  '/.config/gh',
  '/.config/git',
  '/.config/gcloud',
  '/.config/op',
  '/.git',
  '/.terraform.d',
  '/library/keychains',
  '/library/cookies',
  '/etc',
  '/private/etc',
  '/proc',
  '/sys',
  '/var/db',
  '/var/root',
  '/private/var/db',
  '/private/var/root',
  '/appdata/roaming/microsoft/credentials',
  '/appdata/local/microsoft/credentials',
  '/appdata/roaming/gcloud',
];

/**
 * Awalan yang hanya ditolak untuk TULIS. Membaca `/etc/hosts` itu sah;
 * menulisnya tidak.
 */
export const AWALAN_TOLAK_TULIS: string[] = [
  '/etc/',
  '/var/db/',
  '/var/root/',
  '/system/',
  '/library/keychains/',
  '/library/launchagents/',
  '/library/launchdaemons/',
  '/private/etc/',
  '/private/var/db/',
  '/usr/bin/',
  '/usr/sbin/',
  '/usr/local/bin/',
  '/bin/',
  '/sbin/',
  '/boot/',
  '/windows/',
  '/program files/',
  '/program files (x86)/',
  '/programdata/',
];

export type HasilAman = { ok: true } | { ok: false; alasan: string };

function diDalamTerproteksi(cmp: string, dir: string): boolean {
  return `${cmp}/`.includes(`${dir}/`);
}

function sebut(dir: string): string {
  return dir.replace(/^\//, '');
}

/** Boleh dibaca oleh agent? */
export function periksaBaca(path: string): HasilAman {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: false, alasan: 'ditolak: jalur kosong.' };
  }
  // Byte NUL dan kontrol tidak pernah sah di jalur, dan merupakan vektor
  // pemotongan/injeksi klasik.
  if (/[\x00-\x1f]/.test(path)) {
    return { ok: false, alasan: 'ditolak: jalur memuat byte kontrol.' };
  }

  const nama = basename(path);
  for (const re of POLA_RAHASIA) {
    if (re.test(nama)) {
      return {
        ok: false,
        alasan: `ditolak: "${nama}" cocok dengan pola berkas rahasia.`,
      };
    }
  }

  const cmp = bentukBanding(path);
  for (const dir of DIR_TERPROTEKSI) {
    if (diDalamTerproteksi(cmp, dir)) {
      return {
        ok: false,
        alasan: `ditolak: jalur berada di direktori terproteksi (${sebut(dir)}).`,
      };
    }
  }

  return { ok: true };
}

/** Boleh ditulis oleh agent? Semua larangan baca berlaku, plus sistem. */
export function periksaTulis(path: string): HasilAman {
  const baca = periksaBaca(path);
  if (!baca.ok) return baca;

  const cmp = bentukBanding(path);
  const cmpAwalan = cmp.startsWith('/') ? cmp : `/${cmp}`;
  for (const awalan of AWALAN_TOLAK_TULIS) {
    if (cmpAwalan.startsWith(awalan) || `${cmpAwalan}/`.startsWith(awalan)) {
      return {
        ok: false,
        alasan: `ditolak: menulis di bawah "${awalan.replace(/\/$/, '')}" tidak diizinkan.`,
      };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Pembatas perintah shell                                            */
/* ------------------------------------------------------------------ */

/** Pola yang jelas berbahaya bahkan setelah sesuatu disetujui. */
const PERINTAH_BERBAHAYA: RegExp[] = [
  /\b(shutdown|Stop-Computer|Restart-Computer)\b/i,
  /\bFormat-Volume\b/i,
  /\bRemove-Item\b[^\n]*\b-Credential\b/i,
  // rm -rf / dengan varian kutip / --no-preserve-root
  /\brm\s+((-[a-zA-Z]*[rf][a-zA-Z]*|--(recursive|force))\s+)+(['"]?\/\**['"]?\s*($|;|&|\|))/i,
  // rm -rf ~ / $HOME
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(['"]?(~(\/[^\s'"]*)?|\$\{?HOME\}?(\/[^\s'"]*)?)['"]?)(\s|$|;|&|\|)/i,
  /--no-preserve-root/i,
  // dd ke perangkat blok mentah
  /\bdd\b[^|]*\bof=\/dev\/(disk|sd|nvme|hd)/i,
  // format disk
  /\b(mkfs(\.[a-z0-9]+)?|fdisk|parted)\b/i,
  /\bdiskutil\s+erase/i,
  // fork bomb
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  // curl | sh
  /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+|doas\s+)?(ba|z|k|d|fi|c)?sh\b/i,
  // PowerShell: terenkode base64 (-enc/-EncodedCommand/-ec; `-e` alias resmi -> payload opak, fail-closed)
  /\b(powershell|pwsh)\b[^\n]*\s-(encodedcommand|enc|ec|e)\b/i,
  // PowerShell: iex / Invoke-Expression yang dijalankan dari unduhan (dua arah)
  /\b(iex|invoke-expression)\b[^\n]*\b(iwr|invoke-webrequest|downloadstring|downloadfile|net\.webclient|new-object)\b/i,
  /\b(iwr|invoke-webrequest|downloadstring|downloadfile|net\.webclient)\b[^\n]*\b(iex|invoke-expression)\b/i,

  /* ---------------- BAGIAN B: pola baru (ditambahkan di AKHIR) ----------------
   * Diletakkan setelah pola lama supaya (1) nomor baris pola lama tidak bergeser
   * - harness cek-izin-terminal menjejaki baris pola apa adanya - dan (2) pola
   * umum di sini tidak menyamarkan pola spesifik di atas. Keputusan & bukti:
   * docs/LAPORAN-IZIN-TERMINAL-BAGIAN-B.md. */

  // (b) rm -rf ke direktori SISTEM absolut - padanan Unix dari /etc.
  //     `/etc` saja tidak tertangkap pola akar di atas (akar = tepat `/`).
  /\brm\s+((-[a-zA-Z]*[rf][a-zA-Z]*|--(recursive|force))\s+)+['"]?\/(etc|usr|bin|sbin|boot|lib|lib64|var|sys|proc|dev|root)(\/[^\s'"]*)?['"]?(\s|$|;|&|\|)/i,
  // (b) Remove-Item rekursif/paksa ke AKAR drive (C:\ atau C:/) - padanan
  //     Windows dari `rm -rf /`. Dua lookahead supaya urutan argumen bebas.
  /\b(remove-item|ri)\b(?=[^\n]*(-recurse|-force|-r\b|-f\b))(?=[^\n]*['"]?[a-z]:[\\/]{1,2}(?=\s|$|['"]|;|&|\|))[^\n]*/i,
  // (b) Remove-Item rekursif/paksa ke direktori SISTEM Windows.
  /\b(remove-item|ri)\b(?=[^\n]*(-recurse|-force|-r\b|-f\b))(?=[^\n]*['"]?[a-z]:[\\/](windows|program files(?: \(x86\))?|programdata|system32|winsxs)\b)[^\n]*/i,
  // (e) fork bomb BERNAMA (POSIX): bomb(){ bomb|bomb& };bomb
  /\b([a-zA-Z_]\w*)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}\s*;\s*\1/i,
  // (e) fork bomb PowerShell: proses/job baru di dalam loop TAK BERUJUNG
  /\bwhile\s*\(\s*(\$?true|1)\s*\)\s*\{[^\n]*\b(start-process|start-job)\b/i,
  /\bfor\s*\(\s*;\s*;\s*\)\s*\{[^\n]*\b(start-process|start-job)\b/i,
  // (d) Invoke-Expression / iex = eval; argumennya tak bisa diverifikasi saat
  //     persetujuan -> tolak apa pun bentuknya (fail-closed). Diletakkan SETELAH
  //     pola unduh-jalankan supaya jejak pola spesifik tetap terpakai.
  /\b(iex|invoke-expression)\b/i,
  // (d) here-string PowerShell (@"..."@ / @'...'@): wadah teks multi-baris untuk
  //     menyelundupkan skrip melewati pandangan satu-baris.
  /@(['"])\s*[^\n]*\1@/,
];

/**
 * Periksa perintah shell sebelum dijalankan.
 *
 * Selain pola berbahaya, ada dua penolakan struktural:
 *  - byte kontrol, termasuk CR/LF. Perintah berbaris-banyak bisa menyelundupkan
 *    pernyataan kedua melewati kartu persetujuan yang menampilkannya sebagai
 *    satu baris logis.
 *  - karakter override bidi Unicode. Kartu persetujuan merender perintah apa
 *    adanya, dan perintah dengan mark arah bisa tampil berbeda dari yang benar
 *    dijalankan - serangan Trojan Source.
 *  - kutip tak berpasangan (Bagian B/c). Tokenisasi ambigu -> fail-closed:
 *    ragu berarti TOLAK, bukan diloloskan.
 */

/**
 * Gerbang FAIL-CLOSED untuk tokenisasi yang ambigu.
 *
 * Bila kutip TIDAK berpasangan, kartu persetujuan dan shell bisa berbeda
 * pendapat soal di mana string berakhir, sehingga perintah tak bisa dibuktikan
 * aman. Keputusannya: TOLAK (fail-closed), bukan diloloskan.
 *
 * Kutip yang memang berpasangan dibuang lebih dulu - termasuk yang ter-escape
 * (`"a\"b"`) dan yang bersarang (`'a"b'`, `"a'b"`) - supaya perintah wajar tidak
 * salah-tolak. Bila SETELAH itu masih ada sisa kutip, berarti ada yang tidak
 * berpasangan.
 */
function kutipTimpang(c: string): boolean {
  let s = c.replace(/\\["']/g, 'xx');
  for (let i = 0; i < 4; i++) {
    const sebelum = s;
    s = s.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
    if (s === sebelum) break;
  }
  return /["']/.test(s);
}

export function periksaPerintahShell(command: string): HasilAman {
  const c = command.trim();
  if (c.length === 0) {
    return { ok: false, alasan: 'ditolak: perintah kosong.' };
  }
  if (/[\x00-\x1f]/.test(c)) {
    return {
      ok: false,
      alasan:
        'ditolak: perintah memuat karakter kontrol (termasuk CR/LF). Perintah harus satu baris.',
    };
  }
  if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/.test(c)) {
    return {
      ok: false,
      alasan: 'ditolak: perintah memuat karakter override bidi Unicode.',
    };
  }
  if (kutipTimpang(c)) {
    return {
      ok: false,
      alasan:
        'ditolak: kutip tidak berpasangan (tokenisasi ambigu) - fail-closed. ' +
        'Tutup kutipnya atau hapus; perintah dengan kutip tak seimbang tidak bisa dibuktikan aman.',
    };
  }
  for (const pola of PERINTAH_BERBAHAYA) {
    if (pola.test(c)) {
      return {
        ok: false,
        alasan:
          `ditolak oleh pembatas keamanan: cocok dengan ${pola}. ` +
          'Kalau memang perlu, jalankan sendiri di terminal.',
      };
    }
  }
  return { ok: true };
}
