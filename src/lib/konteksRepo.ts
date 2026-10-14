/**
 * KONTEKS REPO - apa yang Zeph ketahui tentang folder yang SEDANG DIBUKA user.
 *
 * ## Kenapa berkas ini ada
 *
 * Sampai sekarang Zeph punya dua sumber "tahu di mana ia berada": blok inti
 * `zephyrFakta.ts` (fakta tentang Zephyr SENDIRI) dan `projectContext.ts`
 * (tiga baris ringkasan workspace). Yang belum ada adalah daftar berkas yang
 * benar-benar berguna: berkas apa saja, bahasanya apa, sebesar apa, kapan
 * terakhir diubah. Tanpa itu model menebak-nebak nama berkas - dan tebakan
 * yang gagal bukan cuma satu langkah sia-sia, ia memicu percobaan lain sampai
 * watchdog menghentikan agen karena "mengulang tanpa kemajuan".
 *
 * Berkas ini mengisi celah itu, dengan empat batas yang dipegang di satu
 * tempat dan ditulis sebagai ANGKA (bukan diserahkan ke kebijaksanaan model):
 *
 *  1. HORMATI `.gitignore`. Repo yang punya `.gitignore` sudah menyatakan
 *     berkas mana yang bukan bahan kerja. Menampilkan `dist/` dan
 *     `node_modules/` justru mengubur berkas yang penting.
 *  2. RAHASIA TIDAK PERNAH MASUK DAFTAR. Ini bukan "jangan cetak isinya" -
 *     berkas `.env`, kunci, dan credential store bahkan tidak boleh muncul
 *     sebagai NAMA, karena nama pun mengundang model memintanya. Daftar
 *     blokirnya EKSPLISIT (`POLA_RAHASIA_EFEKTIF` + `DIR_TERPROTEKSI`) dan
 *     dipinjam dari `agentGuard.ts` supaya kedua lapisan tidak pernah berbeda
 *     pendapat; lihat `alasanBlokirRahasia()`.
 *  3. ADA BATAS JUMLAH DAN BATAS UKURAN. Semua angkanya diekspor supaya bisa
 *     diuji (`scripts/cek-konteks-repo.mjs`) dan supaya tidak ada yang
 *     menggelembung diam-diam.
 *  4. TANPA JARINGAN. Modul ini TIDAK PERNAH memanggil jaringan: satu-satunya
 *     impornya `./agentGuard`, dan modul itu juga murni. Tidak ada `fetch`,
 *     tidak ada plugin, tidak ada endpoint. Semua yang ia laporkan datang dari
 *     daftar berkas yang diserahkan pemanggil.
 *
 * ## Kenapa sumbernya DISUNTIK, bukan dibaca sendiri
 *
 * Membaca disk butuh Tauri (`list_workspace_files`, `fs_read`, `fs_stat`).
 * Kalau modul ini memanggilnya langsung, ia hanya bisa diuji dengan aplikasi
 * hidup - dan batas yang tidak bisa diuji adalah batas yang akan bocor. Jadi
 * inti di sini MURNI: `bangunKonteksRepo()` menerima daftar berkas + isi
 * `.gitignore`, mengembalikan konteks. Yang menyentuh disk adalah
 * `pindaiKonteksRepo()` di bawah - dan itu pun lewat `PerintahKonteksRepo`
 * yang bisa diganti apa saja saat diuji.
 *
 * ## Batas yang dipilih (dan alasannya)
 *
 * | Batas                       | Angka      | Alasan                                              |
 * |-----------------------------|------------|-----------------------------------------------------|
 * | `BATAS_PINDAI_BERKAS`       | 5.000      | sama dengan plafon bawaan `list_workspace_files`    |
 * | `BATAS_BERKAS_TAMPIL`       | 300        | satu baris per berkas; lebih dari ini = dinding teks |
 * | `BATAS_BYTE_TAMPIL`         | 8 MiB      | anggaran korpus yang disarankan, bukan yang dikirim |
 * | `BATAS_UKURAN_BERKAS`       | 1 MiB      | di atas ini bukan bahan konteks, tapi data          |
 * | `BATAS_CHAR_RINGKASAN`      | 6.000 char | ~1.500 token, sepersekian blok inti Zephyr          |
 * | `BATAS_BARIS_STRUKTUR`      | 40 baris   | peta folder, bukan pengganti pohon berkas           |
 * | `BATAS_BAHASA`              | 12         | bahasa ke-13 dan seterusnya dihitung, tidak dirinci |
 * | `BATAS_GITIGNORE_BYTE`      | 64 KiB     | `.gitignore` raksasa (biasanya generated) dipotong  |
 */

import { DIR_TERPROTEKSI, POLA_RAHASIA, bentukBanding, periksaBaca } from './agentGuard';

/**
 * Dipinjam dan DIPINJAMKAN ULANG: siapa pun yang butuh daftar blokir yang
 * sama (uji, dokumen, harness) mengambilnya dari sini, bukan menyalinnya.
 * Satu daftar, satu sumber.
 */
export { DIR_TERPROTEKSI, POLA_RAHASIA } from './agentGuard';

/* ------------------------------------------------------------------ */
/* Angka batas - semua diekspor supaya bisa diuji                     */
/* ------------------------------------------------------------------ */

/** Berapa berkas yang diterima dari sumber. Sama dengan plafon bawaan
 *  `list_workspace_files` supaya tidak ada yang dipotong dua kali. */
export const BATAS_PINDAI_BERKAS = 5_000;
/** Berapa berkas yang boleh muncul di ringkasan. */
export const BATAS_BERKAS_TAMPIL = 300;
/** Anggaran TOTAL byte berkas yang disebut di ringkasan. */
export const BATAS_BYTE_TAMPIL = 8 * 1024 * 1024;
/** Berkas lebih besar dari ini tidak masuk daftar sama sekali. */
export const BATAS_UKURAN_BERKAS = 1024 * 1024;
/** Anggaran karakter ringkasan (potong di batas baris). */
export const BATAS_CHAR_RINGKASAN = 6_000;
/** Berapa baris peta struktur. */
export const BATAS_BARIS_STRUKTUR = 40;
/** Berapa bahasa yang dirinci. Sisanya dihitung sebagai "lain-lain". */
export const BATAS_BAHASA = 12;
/** `.gitignore` yang lebih besar dari ini dipotong (biasanya generated). */
export const BATAS_GITIGNORE_BYTE = 64 * 1024;
/** Berapa berkas yang di-stat saat memindai lewat Tauri. Batas pertama sudah
 *  menahan di 300, angka ini hanya sabuk pengaman kalau pemanggil menaikkannya. */
export const BATAS_STAT_BERKAS = 300;

/** Versi tata bahasa ringkasan. Naikkan kalau bentuk teksnya berubah, supaya
 *  pemanggil yang menyimpan/membandingkan teks lama bisa tahu. */
export const KONTEKS_REPO_VERSI = 1;

/* ------------------------------------------------------------------ */
/* Jenis                                                               */
/* ------------------------------------------------------------------ */

/** Satu berkas seperti yang dilaporkan sumber. `ukuran`/`mtimeMs` boleh -1/0
 *  kalau sumber tidak tahu - dan itu dilaporkan apa adanya, bukan ditebak. */
export interface BerkasRepo {
  /** Jalur RELATIF terhadap akar repo, posix ('/'), tanpa awalan './'. */
  rel: string;
  /** Ukuran byte; -1 = tidak diketahui. */
  ukuran: number;
  /** Waktu ubah (epoch ms); 0 = tidak diketahui. */
  mtimeMs: number;
}

/** Satu berkas `.gitignore`. `base` = folder tempat ia berada, relatif
 *  terhadap akar ('' untuk akar repo). */
export interface EntriGitignore {
  base: string;
  isi: string;
}

export interface MasukanKonteksRepo {
  akar: string;
  berkas: readonly BerkasRepo[];
  gitignore?: readonly EntriGitignore[];
}

/** Baris berkas yang lolos semua saringan. */
export interface BarisBerkas {
  rel: string;
  bahasa: string;
  /** byte; -1 = tidak diketahui */
  ukuran: number;
  /** epoch ms; 0 = tidak diketahui */
  mtimeMs: number;
}

export interface RincianBahasa {
  bahasa: string;
  berkas: number;
}

export interface BarisStruktur {
  folder: string;
  berkas: number;
  anak: string[];
}

export interface StatKonteksRepo {
  /** berkas unik yang diperiksa (setelah batas pindai) */
  dipindai: number;
  /** dibuang karena folder bawaan (node_modules, dist, .git, ...) */
  diabaikanStruktur: number;
  /** dibuang karena aturan `.gitignore` */
  diabaikanGitignore: number;
  /** disembunyikan karena rahasia/terproteksi (tidak pernah masuk daftar) */
  diblokirRahasia: number;
  /** berkas, dikelompokkan per jenis blokir - dipakai untuk laporan, bukan jalur */
  blokirPerJenis: Record<string, number>;
  /** dibuang karena lebih besar dari `BATAS_UKURAN_BERKAS` */
  dilewatiBesar: number;
  /** jumlah berkas yang tampil */
  tampil: number;
  /** total byte berkas yang tampil */
  byteTampil: number;
  /**
   * Bagian dari `byteTampil` yang berasal dari berkas BINER (lihat `AKHIRAN_BINER`).
   * Biner tetap terdaftar, tapi porsinya dilaporkan supaya tidak ada anggaran
   * yang habis diam-diam.
   */
  byteBinerTampil: number;
  terpotongPindai: boolean;
  terpotongJumlah: boolean;
  terpotongByte: boolean;
  terpotongChar: boolean;
}

export interface KonteksRepo {
  versi: number;
  akar: string;
  bahasa: RincianBahasa[];
  /** bahasa di luar `BATAS_BAHASA` */
  bahasaLainnya: number;
  /** penanda teknologi yang ketemu (label + berkas penandanya) */
  penanda: string[];
  struktur: BarisStruktur[];
  berkas: BarisBerkas[];
  ringkasan: string;
  stat: StatKonteksRepo;
}

export type JenisBlokir = 'rahasia-nama' | 'rahasia-folder' | 'jalur-terlarang';

/* ------------------------------------------------------------------ */
/* Daftar blokir rahasia - EKSPLISIT                                   */
/* ------------------------------------------------------------------ */

/**
 * Tambahan atas `POLA_RAHASIA` milik `agentGuard.ts`, khusus untuk pekerjaan
 * "boleh masuk daftar konteks atau tidak".
 *
 * Yang ditambahkan di sini adalah jenis yang tidak pernah perlu dibuka agen
 * untuk memahami sebuah repo, tapi sering muncul di dalam workspace orang:
 * basis data kata sandi (`.kdbx`), kunci PuTTY (`.ppk`), kunci enkripsi
 * (`age`), profil VPN (`.ovpn`), kunci auth Apple (`.p8`), state/var
 * Terraform (`.tfstate`, `.tfvars` - keduanya memuat nilai rahasia plaintext),
 * dan keychain macOS.
 *
 * Sengaja TIDAK ditambahkan: `*.crt` dan `*.cer` (sertifikat publik, sering
 * memang bahan repo), `*.json` di `config/` (terlalu luas - yang rahasia
 * sudah ditangkap `credentials`/`secrets` dari daftar bersama).
 */
export const POLA_RAHASIA_TAMBAHAN: RegExp[] = [
  /^.*\.(kdbx|ppk|age|ovpn|p8|tfstate|tfvars|mobileprovision)(?:[.\s:]|$)/i,
  /^.*keychain(-db)?(?:[.\s:]|$)/i,
];

/**
 * Daftar blokir EFEKTIF: daftar bersama `agentGuard.ts` + tambahan di atas,
 * DITAMBAH nama-nama yang harus ditolak apa pun ekstensinya.
 *
 * `agentGuard.ts` adalah daftar yang sudah dipakai gerbang baca/tulis agen.
 * Meminjamnya (bukan menyalinnya) adalah keputusan sadar: dua daftar yang
 * berbeda akan berbeda pendapat pada suatu hari, dan berkas yang diblokir di
 * satu jalur bisa lolos di jalur lain.
 */
export const POLA_RAHASIA_EFEKTIF: RegExp[] = [
  ...POLA_RAHASIA,
  ...POLA_RAHASIA_TAMBAHAN,
  // Nama berkas yang rahasia tanpa melihat ekstensi. `.env` sudah ada di
  // daftar bersama; yang di sini adalah bentuk yang tidak ditangkapnya.
  /^(secrets?|credentials?|passwords?|tokens?)\.(json|ya?ml|toml|ini|cfg|conf|txt|xml|properties)(?:[.\s:]|$)/i,
  /^(\.aws|\.dockercfg|\.gitconfig|\.git-credentials|\.node_repl_history)(?:[.\s:]|$)/i,
  /^\.?htpasswd(?:[.\s:]|$)/i,
];

/* ------------------------------------------------------------------ */
/* Folder bawaan yang selalu dibuang (bukan bagian gitignore)           */
/* ------------------------------------------------------------------ */

/**
 * Folder yang tidak pernah jadi bahan konteks, walau `.gitignore`-nya lupa
 * menyebutnya: hasil build, cache, dan dependensi pihak ketiga.
 *
 * Dicek sebagai SEGMEN JALUR, jadi `src/node_modules` ikut terbuang - dan itu
 * memang yang diinginkan (pnpm/npm workspace menaruh salinan di dalam paket).
 */
export const ABAIKAN_SEGMEN: readonly string[] = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'target',
  'out',
  'obj',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.parcel-cache',
  '.cache',
  '.turbo',
  '.vercel',
  '.netlify',
  'coverage',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  'venv',
  '.venv',
  'vendor',
  'Pods',
  '.gradle',
  '.idea',
  '.vs',
  '.dart_tool',
  '.expo',
  '.terraform',
  '.yarn',
  '.pnpm-store',
];

const HIMPUNAN_ABAIKAN = new Set(ABAIKAN_SEGMEN.map((s) => s.toLowerCase()));

/* ------------------------------------------------------------------ */
/* Bahasa + penanda                                                    */
/* ------------------------------------------------------------------ */

/** Ekstensi -> label bahasa. Bukan daftar lengkap; yang tidak dikenal
 *  dilaporkan sebagai `Lainnya` - lebih jujur daripada memaksakan tebakan. */
const BAHASA_AKHIRAN: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript (React)',
  mts: 'TypeScript',
  cts: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript (React)',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  rs: 'Rust',
  py: 'Python',
  pyi: 'Python',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  rb: 'Ruby',
  php: 'PHP',
  c: 'C',
  h: 'C/C++ (header)',
  cc: 'C++',
  cpp: 'C++',
  cxx: 'C++',
  hpp: 'C++ (header)',
  hh: 'C++ (header)',
  cs: 'C#',
  swift: 'Swift',
  dart: 'Dart',
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  fish: 'Shell',
  ps1: 'PowerShell',
  psm1: 'PowerShell',
  bat: 'Batch',
  cmd: 'Batch',
  sql: 'SQL',
  lua: 'Lua',
  zig: 'Zig',
  ex: 'Elixir',
  exs: 'Elixir',
  erl: 'Erlang',
  hs: 'Haskell',
  clj: 'Clojure',
  scala: 'Scala',
  pl: 'Perl',
  r: 'R',
  jl: 'Julia',
  nim: 'Nim',
  v: 'V',
  groovy: 'Groovy',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  md: 'Markdown',
  mdx: 'Markdown',
  markdown: 'Markdown',
  rst: 'reStructuredText',
  adoc: 'AsciiDoc',
  txt: 'Teks',
  json: 'JSON',
  jsonc: 'JSON',
  json5: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  cfg: 'Konfigurasi',
  conf: 'Konfigurasi',
  env: 'Konfigurasi',
  properties: 'Konfigurasi',
  xml: 'XML',
  svg: 'SVG',
  csv: 'CSV',
  tsv: 'TSV',
  lock: 'Lockfile',
  proto: 'Protobuf',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  tf: 'Terraform',
  hcl: 'HCL',
  nix: 'Nix',
  cmake: 'CMake',
  mk: 'Make',
  dockerfile: 'Dockerfile',
  ipynb: 'Notebook',
  wasm: 'WebAssembly',
  wat: 'WebAssembly',
  ttf: 'Font',
  otf: 'Font',
  woff: 'Font',
  woff2: 'Font',
  png: 'Gambar',
  jpg: 'Gambar',
  jpeg: 'Gambar',
  gif: 'Gambar',
  webp: 'Gambar',
  ico: 'Gambar',
  bmp: 'Gambar',
  avif: 'Gambar',
  mp3: 'Audio',
  wav: 'Audio',
  ogg: 'Audio',
  flac: 'Audio',
  mp4: 'Video',
  webm: 'Video',
  mov: 'Video',
  pdf: 'PDF',
  zip: 'Arsip',
  gz: 'Arsip',
  tar: 'Arsip',
  '7z': 'Arsip',
  rar: 'Arsip',
  exe: 'Biner',
  dll: 'Biner',
  so: 'Biner',
  dylib: 'Biner',
  a: 'Biner',
  lib: 'Biner',
  node: 'Biner',
  pyc: 'Biner',
  class: 'Biner',
  o: 'Biner',
  map: 'Source map',
  snap: 'Snapshot',
  log: 'Log',
};

/** Nama berkas utuh yang bahasanya tidak bisa ditebak dari ekstensi. */
const BAHASA_NAMA: Record<string, string> = {
  dockerfile: 'Dockerfile',
  'dockerfile.dev': 'Dockerfile',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  makefile: 'Make',
  gnumakefile: 'Make',
  cmakelists: 'CMake',
  'cmakelists.txt': 'CMake',
  'cargo.toml': 'TOML (Rust manifest)',
  'cargo.lock': 'Lockfile',
  'package.json': 'JSON (npm manifest)',
  'package-lock.json': 'Lockfile',
  'pnpm-lock.yaml': 'Lockfile',
  'yarn.lock': 'Lockfile',
  'tsconfig.json': 'JSON (TS config)',
  'tauri.conf.json': 'JSON (Tauri config)',
  'go.mod': 'Go module',
  'go.sum': 'Lockfile',
  'pyproject.toml': 'TOML (Python manifest)',
  'requirements.txt': 'Python requirements',
  gemfile: 'Ruby (Bundler)',
  'gemfile.lock': 'Lockfile',
  'pom.xml': 'XML (Maven)',
  'build.gradle': 'Gradle',
  'build.gradle.kts': 'Gradle',
  'pubspec.yaml': 'YAML (Flutter)',
  'composer.json': 'JSON (Composer)',
  'gradlew': 'Shell',
  vagrantfile: 'Ruby',
  'procfile': 'Konfigurasi',
  'procfile.dev': 'Konfigurasi',
  '.editorconfig': 'Konfigurasi',
  '.gitignore': 'Konfigurasi',
  '.gitattributes': 'Konfigurasi',
  '.dockerignore': 'Konfigurasi',
  '.npmignore': 'Konfigurasi',
  '.prettierrc': 'Konfigurasi',
  '.eslintrc': 'Konfigurasi',
  '.babelrc': 'Konfigurasi',
  '.nvmrc': 'Konfigurasi',
  '.tool-versions': 'Konfigurasi',
  '.python-version': 'Konfigurasi',
  '.rustfmt.toml': 'TOML',
  'rust-toolchain': 'Konfigurasi',
  'rust-toolchain.toml': 'TOML',
};

/**
 * Penanda teknologi: berkas yang kehadirannya menyatakan "ini proyek apa".
 * Dipisah dari bahasa: `vite.config.ts` bukan sekadar TypeScript, ia bilang
 * proyeknya memakai Vite.
 */
const PENANDA_TEKNOLOGI: ReadonlyArray<readonly string[]> = [
  ['package.json', 'Node.js'],
  ['tsconfig.json', 'TypeScript'],
  ['cargo.toml', 'Rust / Cargo'],
  ['tauri.conf.json', 'Tauri'],
  ['tauri.release.conf.json', 'Tauri (release)'],
  ['go.mod', 'Go modules'],
  ['pyproject.toml', 'Python (PEP 621)'],
  ['setup.py', 'Python (setuptools)'],
  ['requirements.txt', 'Python (pip)'],
  ['poetry.lock', 'Python (Poetry)'],
  ['pom.xml', 'Java (Maven)'],
  ['build.gradle', 'Java/Kotlin (Gradle)'],
  ['build.gradle.kts', 'Kotlin (Gradle)'],
  ['composer.json', 'PHP (Composer)'],
  ['gemfile', 'Ruby (Bundler)'],
  ['pubspec.yaml', 'Dart / Flutter'],
  ['mix.exs', 'Elixir (Mix)'],
  ['cmakelists.txt', 'CMake'],
  ['makefile', 'Make'],
  ['dockerfile', 'Docker'],
  ['docker-compose.yml', 'Docker Compose'],
  ['vite.config.ts', 'Vite'],
  ['vite.config.js', 'Vite'],
  ['next.config.js', 'Next.js'],
  ['next.config.mjs', 'Next.js'],
  ['nuxt.config.ts', 'Nuxt'],
  ['angular.json', 'Angular'],
  ['vue.config.js', 'Vue CLI'],
  ['svelte.config.js', 'SvelteKit'],
  ['astro.config.mjs', 'Astro'],
  ['tailwind.config.js', 'Tailwind CSS'],
  ['tailwind.config.ts', 'Tailwind CSS'],
  ['postcss.config.js', 'PostCSS'],
  ['jest.config.js', 'Jest'],
  ['vitest.config.ts', 'Vitest'],
  ['playwright.config.ts', 'Playwright'],
  ['cypress.config.ts', 'Cypress'],
  ['eslint.config.js', '.eslintrc', 'ESLint'],
  ['serverless.yml', 'Serverless Framework'],
  ['wrangler.toml', 'Cloudflare Workers'],
  ['netlify.toml', 'Netlify'],
  ['vercel.json', 'Vercel'],
  ['fly.toml', 'Fly.io'],
  ['rust-toolchain.toml', 'Rust toolchain pin'],
  ['tsconfig.node.json', 'TypeScript (node side)'],
];

/* ------------------------------------------------------------------ */
/* Utilitas murni                                                      */
/* ------------------------------------------------------------------ */

/** Normal bentuk jalur relatif: garis miring Windows, buang `./`, buang
 *  garis miring di ujung. Tidak pernah menyentuh disk - hanya teks. */
export function normalJalur(p: string): string {
  let s = String(p ?? '').replace(/\\/g, '/');
  s = s.replace(/^\.\//, '');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/^\/+/, '');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}

/** Label bahasa sebuah jalur. Murni dan total: selalu mengembalikan sesuatu. */
export function bahasaDariJalur(rel: string): string {
  const p = normalJalur(rel);
  const nama = basename(p).toLowerCase();
  const khusus = BAHASA_NAMA[nama];
  if (khusus) return khusus;
  const titik = nama.lastIndexOf('.');
  if (titik > 0 && titik < nama.length - 1) {
    const ext = nama.slice(titik + 1);
    const ada = BAHASA_AKHIRAN[ext];
    if (ada) return ada;
    return `Lainnya (.${ext})`;
  }
  if (nama.startsWith('.')) return 'Konfigurasi';
  return 'Tanpa ekstensi';
}

/** Ukuran byte -> teks pendek yang stabil (KB/MB biner). */
export function ringkasByte(byte: number): string {
  if (!Number.isFinite(byte) || byte < 0) return '?';
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  if (byte < 1024 * 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${(byte / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Waktu ubah (epoch ms) -> ISO UTC detik. Deterministik, tanpa zona lokal,
 *  supaya ringkasan tidak berubah kalau mesinnya beda zona waktu. */
export function waktuUbahIso(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '?';
  try {
    return `${new Date(ms).toISOString().slice(0, 19)}Z`;
  } catch {
    return '?';
  }
}

/** Apakah berkas ini berada di folder bawaan (node_modules, dist, ...)? */
export function diabaikanStruktur(rel: string): boolean {
  const seg = normalJalur(rel).toLowerCase().split('/');
  // Segmen terakhir tidak pernah menentukan: sebuah BERKAS bernama `build`
  // masih berkas biasa; yang dibuang adalah ISI folder `build/`.
  for (let i = 0; i < seg.length - 1; i++) {
    if (HIMPUNAN_ABAIKAN.has(seg[i])) return true;
  }
  return false;
}

/**
 * Kenapa berkas ini tidak boleh masuk daftar konteks?
 *
 * Urutannya disengaja: jalur terlarang dulu (paling murah dan paling berbahaya),
 * lalu nama (paling spesifik), lalu folder terproteksi, lalu gerbang bersama
 * `periksaBaca()` sebagai jaring terakhir. Gerbang itu memeriksa hal yang tidak
 * diperiksa langkah di atas: byte kontrol di jalur dan bentuk jalur yang cuma
 * sah di Windows (`nama:stream`, titik di ujung yang dibuang Windows - lihat
 * `bentukBanding`).
 */
export function alasanBlokirRahasia(rel: string, akar = ''): JenisBlokir | null {
  const p = normalJalur(rel);
  if (!p) return 'jalur-terlarang';

  // Jalur yang naik keluar akar, dan jalur absolut, DITOLAK di sini - pada
  // bentuk MENTAH. `normalJalur()` membuang akar absolut (`/etc/hosts` menjadi
  // `etc/hosts`) dan merapikan pemisah, jadi jejak aslinya hilang sesudahnya.
  // Tanpa pemeriksaan ini `../rahasia.ts` lolos sebagai jalur yang tampak sah
  // dan diteruskan ke jembatan disk (`fs_stat`/`fs_read`), yang resolve-nya
  // terjadi di luar kendali modul ini.
  const mentah = String(rel ?? '').replace(/\\/g, '/');
  // `C:/...` ditolak, tapi `a:b.ts` (nama berkas sah di banyak sistem) tidak:
  // itu sebabnya wajib ada pemisah sesudah titik-dua. Tanpa syarat ini, berkas
  // berhuruf awal tunggal + titik dua kehilangan tempatnya di daftar.
  if (mentah.startsWith('/') || /^[A-Za-z]:\//.test(mentah)) return 'jalur-terlarang';
  if (p === '..' || p.startsWith('../') || p.split('/').includes('..')) return 'jalur-terlarang';
  // Bentuk ter-encode: modul ini tidak men-dekode apa pun, tapi kalau sisi Rust
  // men-decode (`%2e%2e` -> `..`) jalur ini menjadi traversal. Gagal-tertutup.
  if (/%2e|%2f|%5c/i.test(p)) return 'jalur-terlarang';

  const nama = basename(p);
  for (const re of POLA_RAHASIA_EFEKTIF) {
    if (re.test(nama)) return 'rahasia-nama';
  }

  // DIR_TERPROTEKSI mengawal folder SISTEM. Versi lama menguji jalur RELATIF
  // terhadap daftar itu dengan pencocokan substring (`${cmp}/`.includes(dir)),
  // jadi folder repo biasa bernama `etc/`, `sys/`, `proc/`, `var/db/`, bahkan
  // `docs/etc/` ikut disembunyikan - berkas pengguna hilang tanpa sebab.
  // Aturan sekarang: folder ber-titik (/.ssh, /.gnupg, /.aws, /.git, ...)
  // tetap berlaku pada jalur relatif; folder sistem absolut hanya berlaku
  // kalau AKAR repo sendiri berada di dalamnya (seluruh isinya terproteksi).
  const relCmp = bentukBanding(p);
  const cmpAkar = akar ? bentukBanding(normalJalur(akar)) : '';
  for (const dir of DIR_TERPROTEKSI) {
    const d = bentukBanding(dir);
    if (!d) continue;
    if (d.includes('/.')) {
      if (`/${relCmp}/`.includes(`${d}/`)) return 'rahasia-folder';
      continue;
    }
    if (cmpAkar && (cmpAkar === d || cmpAkar.startsWith(`${d}/`) || cmpAkar.endsWith(d) || cmpAkar.includes(`${d}/`))) {
      return 'rahasia-folder';
    }
  }

  // `periksaBaca(akar + p)` tidak lagi dipanggil: di dalamnya `bentukBanding`
  // membuang awalan drive dan `diDalamTerproteksi()` mencocokkan substring,
  // sehingga `akar + rel` hampir selalu bisa dibuat cocok dengan folder sistem.
  // Akar sudah diperiksa di blok di atas.
  //
  // Gerbangnya sendiri tetap dipakai, TAPI vonisnya soal folder DIABAIKAN:
  // `periksaBaca()` memakai pencocokan substring yang sama longgarnya, jadi ia
  // juga memakan `docs/etc/panduan.md` milik repo. Alasan lain tetap berlaku
  // (byte kontrol, pola nama rahasia) - di situlah nilainya.
  const gerbang = periksaBaca(p);
  if (!gerbang.ok && !gerbang.alasan.includes('direktori terproteksi')) return 'jalur-terlarang';
  return null;
}

/* ------------------------------------------------------------------ */
/* .gitignore                                                          */
/* ------------------------------------------------------------------ */

export interface AturanGitignore {
  /** folder tempat aturan ini berada, relatif terhadap akar ('' = akar) */
  base: string;
  /** true kalau pola diawali `!` */
  negasi: boolean;
  /** pola setelah `!` dan `/` di ujung dibuang */
  pola: string;
  /** pola berakhiran `/` - hanya cocok untuk folder */
  hanyaDir: boolean;
  /** pola memuat `/` di tengah/awal - terpaku ke `base` */
  berakar: boolean;
  /** regex hasil terjemahan glob */
  re: RegExp;
}

function escapeRe(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Terjemahkan glob gaya gitignore ke regex. Didukung: `*`, `?`, `**`,
 *  `[abc]`/`[!abc]`. Tidak didukung: brace `{a,b}` (gitignore juga tidak). */
function reDariGlob(pola: string): RegExp {
  let out = '';
  for (let i = 0; i < pola.length; i++) {
    const c = pola[i];
    if (c === '*') {
      if (pola[i + 1] === '*') {
        // `**` - menyeberangi pemisah folder.
        i++;
        if (pola[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
          continue;
        }
        out += '.*';
        continue;
      }
      out += '[^/]*';
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      continue;
    }
    if (c === '[') {
      const tutup = pola.indexOf(']', i + 1);
      if (tutup > i + 1) {
        let isi = pola.slice(i + 1, tutup);
        const neg = isi.startsWith('!') || isi.startsWith('^');
        if (neg) isi = isi.slice(1);
        isi = isi.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
        out += `[${neg ? '^' : ''}${isi}]`;
        i = tutup;
        continue;
      }
      out += '\\[';
      continue;
    }
    out += escapeRe(c);
  }
  return new RegExp(`^${out}$`);
}

/**
 * Susun aturan dari daftar `.gitignore`.
 *
 * URUTAN menentukan hasil (aturan terakhir yang cocok yang menang), dan
 * urutannya ditetapkan di sini supaya deterministik: akar dulu, lalu folder
 * yang lebih dangkal, lalu berdasarkan nama. Urutan kedatangan tidak dipakai -
 * daftar berkas dari pemanggil bisa datang dalam urutan apa pun.
 */
export function susunAturanGitignore(entri: readonly EntriGitignore[]): AturanGitignore[] {
  const dasar = [...entri]
    .map((e) => ({ base: normalJalur(e.base ?? ''), isi: String(e.isi ?? '') }))
    .sort((a, b) => a.base.split('/').length - b.base.split('/').length || (a.base < b.base ? -1 : a.base > b.base ? 1 : 0));

  const aturan: AturanGitignore[] = [];
  for (const { base, isi } of dasar) {
    const dipotong = isi.length > BATAS_GITIGNORE_BYTE ? isi.slice(0, BATAS_GITIGNORE_BYTE) : isi;
    for (const barisMentah of dipotong.split(/\r?\n/)) {
      let baris = barisMentah;
      // `\#` dan `\!` adalah escape; `#` polos adalah komentar.
      if (baris.startsWith('\\#') || baris.startsWith('\\!')) baris = baris.slice(1);
      else if (baris.startsWith('#')) continue;
      baris = baris.replace(/\s+$/, '');
      if (!baris.trim()) continue;

      let negasi = false;
      if (baris.startsWith('!')) {
        negasi = true;
        baris = baris.slice(1);
      }
      // Garis miring di AWAL sudah membuat pola terpaku; buang supaya seragam.
      if (baris.startsWith('/')) baris = baris.replace(/^\/+/, '');
      let hanyaDir = false;
      if (baris.endsWith('/')) {
        hanyaDir = true;
        baris = baris.replace(/\/+$/, '');
      }
      if (!baris) continue;
      aturan.push({
        base,
        negasi,
        pola: baris,
        hanyaDir,
        berakar: baris.includes('/'),
        re: reDariGlob(baris),
      });
    }
  }
  return aturan;
}

/**
 * Calon teks yang akan diuji ke pola.
 *
 * Aturan gitignore yang asli:
 *  - pola tanpa `/` (selain di ujung) cocok pada NAMA di kedalaman berapa pun;
 *  - pola dengan `/` terpaku ke folder `.gitignore`-nya;
 *  - pola berakhiran `/` hanya mengenai folder - jadi untuk sebuah BERKAS
 *    artinya "salah satu folder leluhurnya cocok".
 */
function calonCocok(rel: string, berakar: boolean, hanyaDir: boolean): string[] {
  const seg = rel.split('/');
  if (!hanyaDir) {
    if (berakar) return [rel];
    const keluar: string[] = [];
    for (let i = 0; i < seg.length; i++) keluar.push(seg.slice(i).join('/'));
    return keluar;
  }
  const keluar: string[] = [];
  const mulai = berakar ? [0] : seg.map((_, i) => i);
  for (const i of mulai) {
    for (let j = i + 1; j <= seg.length - 1; j++) keluar.push(seg.slice(i, j).join('/'));
  }
  return keluar;
}

function satuAturanCocok(a: AturanGitignore, rel: string): boolean {
  let ak = rel;
  if (a.base) {
    if (!rel.startsWith(`${a.base}/`)) return false;
    ak = rel.slice(a.base.length + 1);
  }
  if (!ak) return false;
  for (const c of calonCocok(ak, a.berakar, a.hanyaDir)) {
    if (c && a.re.test(c)) return true;
  }
  return false;
}

/**
 * Apakah berkas ini diabaikan `.gitignore`?
 *
 * Subset yang DISENGAJA: aturan terakhir yang cocok menang (`!` bisa
 * mengembalikan berkas), tapi negasi tidak bisa membatalkan folder yang
 * diabaikan induknya - git asli menuntut folder induknya di-`unignore` lebih
 * dulu. Untuk konteks repo, salah-menampilkan satu berkas jauh lebih ringan
 * daripada salah-menyembunyikan, jadi versi permisif yang dipakai.
 */
export function diabaikanOlehGitignore(aturan: readonly AturanGitignore[], rel: string): boolean {
  const p = normalJalur(rel);
  let putusan = false;
  for (const a of aturan) {
    if (satuAturanCocok(a, p)) putusan = !a.negasi;
  }
  return putusan;
}

/* ------------------------------------------------------------------ */
/* Urutan berkas                                                       */
/* ------------------------------------------------------------------ */

const AKAR_PENTING = new Set([
  'readme.md',
  'readme',
  'package.json',
  'cargo.toml',
  'tsconfig.json',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'composer.json',
  'gemfile',
  'pubspec.yaml',
  'makefile',
  'dockerfile',
  'agents.md',
  'architecture.md',
]);

/** Source code yang biasanya memang bahan kerja agen. */
const AKHIRAN_KODE =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|py|pyi|go|java|kt|kts|rb|php|c|h|cc|cpp|cxx|hpp|cs|swift|dart|vue|svelte|astro|sh|bash|ps1|sql|lua|zig|ex|exs|hs|scala|pl|r|jl|nim|groovy|tf|hcl|nix|proto|graphql)$/i;

/**
 * Berkas yang BUKAN bahan teks (gambar, arsip, media, biner terkompilasi).
 *
 * Tetap TERDAFTAR - namanya menjelaskan repo dan menghapusnya berarti mengurangi
 * kemampuan - tapi porsi byte-nya dihitung terpisah dan dilaporkan, sebab biner
 * bisa memakan hampir seluruh anggaran byte tanpa satu pun dibaca.
 */
const AKHIRAN_BINER =
  /\.(png|jpe?g|gif|webp|avif|bmp|ico|icns|tiff?|psd|exe|dll|so|dylib|bin|wasm|zip|gz|tgz|bz2|xz|7z|rar|tar|pdf|mp3|wav|ogg|flac|m4a|mp4|mov|mkv|webm|avi|ttf|otf|woff2?|eot|db|sqlite3?|pdb|class|jar|dat|pak|dmg|msi|iso)$/i;

/**
 * Skor prioritas: makin kecil makin penting. Dipakai supaya batas jumlah
 * memotong yang paling tidak penting, bukan yang paling banyak.
 *
 * Urutannya dipilih dari alasan yang mudah dipertahankan: berkas DI AKAR repo
 * selalu sedikit dan selalu menjelaskan repo (manifest, README, `.gitignore`),
 * jadi ia didahulukan - bukan tersingkir oleh ratusan berkas sumber yang
 * dihasilkan. Sesudah itu source code, lalu prosa, lalu konfigurasi, sisanya.
 *
 * Total dan deterministik: tidak ada urutan kedatangan di sini.
 */
export function skorPrioritasBerkas(rel: string): number {
  const p = normalJalur(rel);
  const nama = basename(p).toLowerCase();
  if (!p.includes('/')) return AKAR_PENTING.has(nama) ? 0 : 1;
  if (AKHIRAN_KODE.test(p)) return p.startsWith('src/') || /(^|\/)src\//.test(p) ? 2 : 3;
  if (/\.(md|mdx|rst|adoc)$/i.test(p)) return 4;
  if (/\.(json|ya?ml|toml|ini|cfg|conf|xml|lock|properties)$/i.test(p)) return 5;
  return 6;
}

function bandingBerkas(a: BarisBerkas, b: BarisBerkas): number {
  const sa = skorPrioritasBerkas(a.rel);
  const sb = skorPrioritasBerkas(b.rel);
  if (sa !== sb) return sa - sb;
  return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Inti murni                                                          */
/* ------------------------------------------------------------------ */

function normalAkar(akar: string): string {
  return String(akar ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
}

interface HasilSaring {
  kandidat: BarisBerkas[];
  stat: StatKonteksRepo;
}

/** Tahap 1: buang yang tidak layak, JANGAN urutkan/potong. Dipakai ulang oleh
 *  `pindaiKonteksRepo()` (jalan dua tahap: saring dulu, baru stat). */
function saring(masukan: MasukanKonteksRepo): HasilSaring {
  const akar = normalAkar(masukan.akar);
  const aturan = susunAturanGitignore(masukan.gitignore ?? []);
  const stat: StatKonteksRepo = {
    dipindai: 0,
    diabaikanStruktur: 0,
    diabaikanGitignore: 0,
    diblokirRahasia: 0,
    blokirPerJenis: {},
    dilewatiBesar: 0,
    tampil: 0,
    byteTampil: 0,
    byteBinerTampil: 0,
    terpotongPindai: false,
    terpotongJumlah: false,
    terpotongByte: false,
    terpotongChar: false,
  };
  const kandidat: BarisBerkas[] = [];
  const sudah = new Set<string>();

  const mentah = masukan.berkas ?? [];
  if (mentah.length > BATAS_PINDAI_BERKAS) stat.terpotongPindai = true;

  for (const b of mentah.slice(0, BATAS_PINDAI_BERKAS)) {
    const relMentah = String(b?.rel ?? '');
    // Pemeriksaan jalur memakai bentuk MENTAH, SEBELUM `normalJalur()`.
    // Alasannya: `normalJalur()` membuang akar absolut (`/etc/hosts` menjadi
    // `etc/hosts`) dan merapikan pemisah, sehingga `/etc/hosts` dan
    // `\\server\share\x.ts` menjadi jalur relatif yang tampak sah kalau
    // diperiksa sesudahnya - dua-duanya lolos hanya karena kerapian itu.
    if (relMentah) {
      const blokirMentah = alasanBlokirRahasia(relMentah, akar);
      if (blokirMentah) {
        stat.diblokirRahasia++;
        stat.blokirPerJenis[blokirMentah] = (stat.blokirPerJenis[blokirMentah] ?? 0) + 1;
        continue;
      }
    }
    const rel = normalJalur(relMentah);
    if (!rel || rel.endsWith('/')) continue;
    if (sudah.has(rel)) continue;
    sudah.add(rel);
    stat.dipindai++;

    if (diabaikanStruktur(rel)) {
      stat.diabaikanStruktur++;
      continue;
    }
    if (diabaikanOlehGitignore(aturan, rel)) {
      stat.diabaikanGitignore++;
      continue;
    }
    const blokir = alasanBlokirRahasia(rel, akar);
    if (blokir) {
      stat.diblokirRahasia++;
      stat.blokirPerJenis[blokir] = (stat.blokirPerJenis[blokir] ?? 0) + 1;
      continue;
    }
    const ukuran = Number.isFinite(b?.ukuran) && b.ukuran >= 0 ? Math.trunc(b.ukuran) : -1;
    if (ukuran > BATAS_UKURAN_BERKAS) {
      stat.dilewatiBesar++;
      continue;
    }
    const mtimeMs = Number.isFinite(b?.mtimeMs) && b.mtimeMs > 0 ? Math.trunc(b.mtimeMs) : 0;
    kandidat.push({ rel, bahasa: bahasaDariJalur(rel), ukuran, mtimeMs });
  }

  return { kandidat, stat };
}

function susunStruktur(berkas: readonly BarisBerkas[]): BarisStruktur[] {
  const peta = new Map<string, { berkas: number; anak: Set<string> }>();
  for (const b of berkas) {
    const seg = b.rel.split('/');
    const atas = seg.length > 1 ? seg[0] : '(akar repo)';
    let masuk = peta.get(atas);
    if (!masuk) {
      masuk = { berkas: 0, anak: new Set() };
      peta.set(atas, masuk);
    }
    masuk.berkas++;
    if (seg.length >= 3) masuk.anak.add(seg[1]);
  }
  return [...peta.entries()]
    .map(([folder, v]) => ({ folder, berkas: v.berkas, anak: [...v.anak].sort() }))
    .sort((a, b) => b.berkas - a.berkas || (a.folder < b.folder ? -1 : 1));
}

function susunPenanda(berkas: readonly BarisBerkas[]): string[] {
  const namaAda = new Set(berkas.map((b) => basename(b.rel).toLowerCase()));
  const keluar: string[] = [];
  for (const item of PENANDA_TEKNOLOGI) {
    const label = item[item.length - 1];
    const nama = item.slice(0, -1) as readonly string[];
    if (nama.some((n) => namaAda.has(n))) {
      if (!keluar.includes(label)) keluar.push(label);
    }
  }
  return keluar;
}

function susunBahasa(berkas: readonly BarisBerkas[]): { bahasa: RincianBahasa[]; lainnya: number } {
  const hitung = new Map<string, number>();
  for (const b of berkas) hitung.set(b.bahasa, (hitung.get(b.bahasa) ?? 0) + 1);
  const urut = [...hitung.entries()]
    .map(([bahasa, berkas2]) => ({ bahasa, berkas: berkas2 }))
    .sort((a, b) => b.berkas - a.berkas || (a.bahasa < b.bahasa ? -1 : 1));
  const rinci = urut.slice(0, BATAS_BAHASA);
  const sisa = urut.slice(BATAS_BAHASA).reduce((n, x) => n + x.berkas, 0);
  return { bahasa: rinci, lainnya: sisa };
}

/**
 * 5000 -> "5.000". Pemisah ribuan titik, dihitung sendiri: `toLocaleString()`
 * bergantung pada ICU/locale mesin, dan keluaran modul ini wajib deterministik
 * (ada ujinya membandingkan byte hasil dua pemanggilan).
 */
function angkaRibu(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  let keluar = '';
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) keluar += '.';
    keluar += s[i];
  }
  return `${n < 0 ? '-' : ''}${keluar}`;
}

function susunRingkasan(k: Omit<KonteksRepo, 'ringkasan'>): { teks: string; terpotong: boolean } {
  const s = k.stat;
  const baris: string[] = [];
  baris.push('Repository context (the folder the user has open - NOT the Zephyr source tree).');
  baris.push(`- Root: ${k.akar || '(unknown)'}`);
  baris.push(
    `- Files: ${s.dipindai} examined, ${s.tampil} listed here, ` +
      `${s.diblokirRahasia} hidden as secret/protected, ${s.diabaikanGitignore} ignored by .gitignore, ` +
      `${s.diabaikanStruktur} ignored as build/dependency folders, ${s.dilewatiBesar} over ${ringkasByte(BATAS_UKURAN_BERKAS)}.`,
  );
  if (k.bahasa.length) {
    const bhs = k.bahasa.map((b) => `${b.bahasa} ${b.berkas}`).join(', ');
    baris.push(`- Languages (files): ${bhs}${k.bahasaLainnya ? `, +${k.bahasaLainnya} other` : ''}`);
  }
  if (k.penanda.length) baris.push(`- Markers: ${k.penanda.join(', ')}`);

  if (k.struktur.length) {
    baris.push('- Layout (files per top folder):');
    for (const t of k.struktur.slice(0, BATAS_BARIS_STRUKTUR)) {
      const anak = t.anak.length ? `; subfolders: ${t.anak.slice(0, 6).join(', ')}${t.anak.length > 6 ? ', …' : ''}` : '';
      baris.push(`  ${t.folder} (${t.berkas} ${t.berkas === 1 ? 'file' : 'files'}${anak})`);
    }
    if (k.struktur.length > BATAS_BARIS_STRUKTUR) {
      baris.push(`  … and ${k.struktur.length - BATAS_BARIS_STRUKTUR} more folders`);
    }
  }

  // Laporan pemotongan dan catatan rahasia ditaruh SEBELUM daftar berkas dengan
  // sengaja: daftar 300 baris justru yang paling sering menghabiskan anggaran
  // karakter, jadi kalau laporan ini ditulis SESUDAH daftar, dialah yang terpotong
  // lebih dulu - pembaca kehilangan justru keterangan "kenapa daftar ini tidak
  // lengkap".
  const potong: string[] = [];
  if (s.terpotongJumlah) potong.push(`at most ${BATAS_BERKAS_TAMPIL} files are listed`);
  if (s.terpotongByte) potong.push(`the listed corpus is capped at ${ringkasByte(BATAS_BYTE_TAMPIL)}`);
  if (s.terpotongPindai) potong.push(`only the first ${angkaRibu(BATAS_PINDAI_BERKAS)} entries were examined`);
  if (potong.length) baris.push(`- Truncated: ${potong.join('; ')}.`);

  // Biner tetap terdaftar - kemampuan tidak dikurangi - tapi porsi byte-nya
  // DIKATAKAN begitu ia memakan lebih dari separuh anggaran. Tanpa ini, korpus
  // kode yang terlihat sedikit bisa disalahartikan sebagai repo kecil.
  if (s.byteBinerTampil > 0 && s.byteBinerTampil * 2 > BATAS_BYTE_TAMPIL) {
    baris.push(
      `- Note: binaries take ${ringkasByte(s.byteBinerTampil)} of the ${ringkasByte(BATAS_BYTE_TAMPIL)} listed corpus budget; source files are ranked first, so they keep their slots.`,
    );
  }

  baris.push(
    '- Secret material (environment files, private keys, credential stores, and the',
    '  protected dot-folders) is NEVER listed and never read: if a path is missing from',
    '  this list, do not guess at it and do not ask the user to paste it in.',
  );

  if (k.berkas.length) {
    baris.push(`- Files (path | language | size | last modified) - ${k.berkas.length} of ${s.tampil}:`);
    for (const b of k.berkas) {
      baris.push(`  ${b.rel} | ${b.bahasa} | ${ringkasByte(b.ukuran)} | ${waktuUbahIso(b.mtimeMs)}`);
    }
  } else {
    baris.push('- Files: none survived the filters above.');
  }

  let teks = baris.join('\n');
  let terpotong = false;
  if (teks.length > BATAS_CHAR_RINGKASAN) {
    // Ruang untuk penanda disisakan SEBELUM memotong, dan penandanya dihitung
    // dua kali: sekali dengan angka sementara, sekali dengan angka final. Versi
    // lama memotong dulu lalu menempel penanda, jadi keluarannya MELEBIHI
    // anggaran (6.027 > 6.000) dan justru melubangi janji batasnya sendiri.
    let penanda = '';
    let dipotong = '';
    for (let putaran = 0; putaran < 3; putaran += 1) {
      const ruang = Math.max(0, BATAS_CHAR_RINGKASAN - penanda.length);
      dipotong = teks.slice(0, ruang);
      const barisTerakhir = dipotong.lastIndexOf('\n');
      if (barisTerakhir > 0) dipotong = dipotong.slice(0, barisTerakhir);
      const dibuang = teks.length - dipotong.length;
      const baru = `\n… (summary cut at ${BATAS_CHAR_RINGKASAN} characters; ${dibuang} characters dropped)`;
      const stabil = baru.length === penanda.length;
      penanda = baru;
      if (stabil) break;
    }
    teks = dipotong + penanda;
    terpotong = true;
  }
  return { teks, terpotong };
}

/**
 * Bangun konteks repo dari daftar berkas yang diserahkan pemanggil.
 * MURNI: tidak menyentuh disk, tidak menyentuh jaringan, tidak membaca waktu
 * sistem. Keluaran hanya bergantung pada masukan.
 */
export function bangunKonteksRepo(masukan: MasukanKonteksRepo): KonteksRepo {
  const akar = normalAkar(masukan?.akar ?? '');
  const { kandidat, stat } = saring({ ...masukan, akar });
  kandidat.sort(bandingBerkas);

  const tampil: BarisBerkas[] = [];
  let byteTampil = 0;
  let byteBinerTampil = 0;
  for (const k of kandidat) {
    if (tampil.length >= BATAS_BERKAS_TAMPIL) {
      stat.terpotongJumlah = true;
      break;
    }
    if (k.ukuran > 0 && byteTampil + k.ukuran > BATAS_BYTE_TAMPIL) {
      // Dilewati, bukan dihentikan: berkas kecil sesudahnya masih berguna.
      stat.terpotongByte = true;
      continue;
    }
    if (k.ukuran > 0) byteTampil += k.ukuran;
    // Biner tetap masuk daftar, tapi porsinya dihitung terpisah supaya bisa
    // dilaporkan - lihat catatan "binaries take ..." di `susunRingkasan`.
    if (k.ukuran > 0 && AKHIRAN_BINER.test(k.rel)) byteBinerTampil += k.ukuran;
    tampil.push(k);
  }
  stat.tampil = tampil.length;
  stat.byteTampil = byteTampil;
  stat.byteBinerTampil = byteBinerTampil;

  const bhs = susunBahasa(kandidat);
  const kerangka: Omit<KonteksRepo, 'ringkasan'> = {
    versi: KONTEKS_REPO_VERSI,
    akar,
    bahasa: bhs.bahasa,
    bahasaLainnya: bhs.lainnya,
    penanda: susunPenanda(kandidat),
    struktur: susunStruktur(kandidat),
    berkas: tampil,
    stat,
  };
  const { teks, terpotong } = susunRingkasan(kerangka);
  stat.terpotongChar = terpotong;
  return { ...kerangka, ringkasan: teks };
}

/* ------------------------------------------------------------------ */
/* Jembatan ke Tauri (satu-satunya bagian yang menyentuh disk)         */
/* ------------------------------------------------------------------ */

/**
 * Bentuk minimal yang dibutuhkan dari `src/lib/commands.ts`.
 *
 * Sengaja STRUKTURAL, bukan impor: modul `commands.ts` menarik seluruh API
 * Tauri, dan kalau berkas ini mengimpornya maka inti di atas tidak lagi bisa
 * diuji tanpa aplikasi hidup. Modul aslinya memenuhi bentuk ini apa adanya -
 * pemanggil cukup menulis `pindaiKonteksRepo(akar, commands)`, karena:
 *
 *   `listWorkspaceFiles(limit?) => Promise<QuickFile[]>`  (QuickFile: path/rel/name)
 *   `fsRead(path, encoding?)    => Promise<ReadResult>`   (ReadResult: { content, ... })
 *   `fsStat(path)               => Promise<StatResult>`   (`{ size, isDir, mtime }`)
 *
 * Ketiganya ditulis sebagai METHOD (bukan properti berisi fungsi) supaya
 * `commands.ts` yang asli memenuhi tipe ini tanpa gesekan - pemeriksaan
 * parameter yang ketat hanya berlaku untuk properti fungsi.
 *
 * Jalur yang diteruskan ke `fsRead`/`fsStat` adalah jalur ABSOLUT (dari
 * `QuickFile.path`), karena itu yang diharapkan sisi Rust dan itu yang
 * diperiksa `periksa_path_baca`; kalau sumber hanya memberi `rel`, jalur
 * disusun dari akar.
 */
export interface PerintahKonteksRepo {
  listWorkspaceFiles(limit?: number): Promise<ReadonlyArray<{ path?: string; rel?: string; name?: string }>>;
  fsRead(path: string, encoding?: string): Promise<{ content: string } | string>;
  fsStat(path: string): Promise<{ size: number; isDir: boolean; mtime: number }>;
}

export interface OpsiSumberRepo {
  /** plafon daftar berkas; bawaan `BATAS_PINDAI_BERKAS` */
  batasPindai?: number;
  /** berapa berkas yang di-stat (fs_stat satu per satu); bawaan `BATAS_STAT_BERKAS` */
  batasStat?: number;
  /** baca `.gitignore` (termasuk yang bersarang); bawaan true */
  bacaGitignore?: boolean;
}

export interface HasilPindai {
  konteks: KonteksRepo;
  /** hal yang gagal tapi tidak fatal - dilaporkan, bukan disembunyikan */
  peringatan: string[];
}

/** `fsRead` mengembalikan `ReadResult`; inti di sini hanya butuh teksnya. */
function isiDari(hasil: { content: string } | string | null | undefined): string {
  if (typeof hasil === 'string') return hasil;
  return String(hasil?.content ?? '');
}

/**
 * Pindai workspace nyata lewat Tauri: daftar berkas -> isi `.gitignore` ->
 * stat berkas yang benar-benar akan tampil -> rakit konteks.
 *
 * Dua tahap, dan urutannya penting: daftar berkas TIDAK memuat ukuran, jadi
 * `fs_stat` (satu panggilan IPC per berkas) hanya dijalankan untuk berkas
 * yang lolos saringan dan muat di batas - bukan untuk seluruh 5.000.
 */
export async function pindaiKonteksRepo(
  akar: string,
  cmd: PerintahKonteksRepo,
  opsi: OpsiSumberRepo = {},
): Promise<HasilPindai> {
  const peringatan: string[] = [];
  const akarNormal = normalAkar(akar);
  const batasPindai = opsi.batasPindai ?? BATAS_PINDAI_BERKAS;
  const batasStat = opsi.batasStat ?? BATAS_STAT_BERKAS;

  let daftar: ReadonlyArray<{ path?: string; rel?: string; name?: string }> = [];
  try {
    daftar = (await cmd.listWorkspaceFiles(batasPindai)) ?? [];
  } catch (e) {
    peringatan.push(`listWorkspaceFiles gagal: ${pesan(e)}`);
    return {
      konteks: bangunKonteksRepo({ akar: akarNormal, berkas: [], gitignore: [] }),
      peringatan,
    };
  }

  // rel -> jalur yang akan dikirim ke Rust. `path` (absolut) yang diutamakan;
  // `rel` tetap dipakai untuk kunci supaya urutan tampil stabil terhadap akar.
  const jalur = new Map<string, string>();
  let diLuarAkar = 0;
  for (const f of daftar) {
    const relMentah = String(f?.rel ?? '').trim();
    const absMentah = String(f?.path ?? '').trim().replace(/\\/g, '/');
    let r = normalJalur(relMentah || absMentah || String(f?.name ?? ''));
    // `listWorkspaceFiles` boleh hanya memberi jalur ABSOLUT. Kalau begitu, rel
    // disusun dari akar DI SINI, dan berkas di luar akar dibuang di sini juga:
    // jalur absolut sudah ditolak `alasanBlokirRahasia()`, jadi meneruskan
    // `../` apa adanya hanya menghasilkan panggilan disk yang sia-sia.
    if (!relMentah && absMentah) {
      const bawah = akarNormal ? `${akarNormal}/` : '';
      if (bawah && absMentah.toLowerCase().startsWith(bawah.toLowerCase())) {
        r = normalJalur(absMentah.slice(bawah.length));
      } else if (!bawah) {
        r = normalJalur(absMentah);
      } else {
        diLuarAkar += 1;
        continue;
      }
    }
    if (!r || r.endsWith('/')) continue;
    const abs = absMentah || `${akarNormal}/${r}`;
    if (!jalur.has(r)) jalur.set(r, abs.replace(/\\/g, '/'));
  }
  if (diLuarAkar > 0) peringatan.push(`${diLuarAkar} berkas di luar akar diabaikan`);
  const berkasMentah: BerkasRepo[] = [...jalur.keys()].map((r) => ({ rel: r, ukuran: -1, mtimeMs: 0 }));

  const gitignore: EntriGitignore[] = [];
  if (opsi.bacaGitignore !== false) {
    for (const r of berkasMentah) {
      if (basename(r.rel).toLowerCase() !== '.gitignore') continue;
      try {
        gitignore.push({ base: dirname(r.rel), isi: isiDari(await cmd.fsRead(jalur.get(r.rel) ?? r.rel)) });
      } catch (e) {
        peringatan.push(`.gitignore ${r.rel} tidak terbaca (${pesan(e)}) - pola di dalamnya tidak berlaku`);
      }
    }
  }

  // Tahap 1: tanpa ukuran. Hasilnya = daftar berkas yang layak di-stat.
  const tahap1 = bangunKonteksRepo({ akar: akarNormal, berkas: berkasMentah, gitignore });
  const akanDiStat = tahap1.berkas.slice(0, batasStat).map((b) => b.rel);
  if (tahap1.berkas.length > batasStat) {
    peringatan.push(`hanya ${batasStat} berkas pertama di-stat (sisanya dilaporkan tanpa ukuran)`);
  }

  const info = new Map<string, { ukuran: number; mtimeMs: number }>();
  for (const r of akanDiStat) {
    try {
      const st = await cmd.fsStat(jalur.get(r) ?? r);
      if (st && !st.isDir) info.set(r, { ukuran: Number(st.size) || 0, mtimeMs: Number(st.mtime) || 0 });
    } catch (e) {
      peringatan.push(`fsStat ${r} gagal: ${pesan(e)}`);
    }
  }

  // Tahap 2: ukuran sungguhan. Berkas yang gagal di-stat tetap -1/0 - apa
  // adanya, dan itu terlihat di ringkasan sebagai "?".
  const berkasFinal: BerkasRepo[] = berkasMentah.map((b) => {
    const i = info.get(b.rel);
    return i ? { rel: b.rel, ukuran: i.ukuran, mtimeMs: i.mtimeMs } : b;
  });

  return { konteks: bangunKonteksRepo({ akar: akarNormal, berkas: berkasFinal, gitignore }), peringatan };
}

function pesan(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
