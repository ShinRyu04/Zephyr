/**
 * Subset tool PER KELAS TUGAS + paksa rencana pada tugas berat (LAMA-a1, LAMA-a4).
 *
 * ## Kenapa berkas ini ada
 *
 * Hasil ukur `scripts/uji-kesiapan-tool.mjs` (docs/AUDIT-TOOL-BERKAS-2026-10-14.md
 * §2.1/C) menunjukkan batas kebijakan **20 tool per giliran** ditembus oleh
 * **4 dari 6 tugas nyata**:
 *
 * ```
 *  17 tool  baca berkas
 *  23 tool  perbaiki kode + uji      >> TEMBUS 20
 *  23 tool  tulis banyak berkas      >> TEMBUS 20
 *  20 tool  tugas web + berkas       (tepat di batas; 26 versi lengkapnya)
 *  23 tool  shell + hapus            >> TEMBUS 20
 *  23 tool  repo-wide + tulis        >> TEMBUS 20
 *  MAKS per giliran: 26 (target 20)  -> MELEWATI TARGET
 * ```
 *
 * Penyebabnya BUKAN tugasnya: himpunan dasar sudah 17 tool, lalu tool tulis-berkas
 * masuk BERTUMPUK untuk tugas apa pun yang menyebut berkas - termasuk tiga KEMBAR
 * untuk satu kemampuan yang sama:
 *
 *   `edit` | `multi_edit` | `replace_in_files`  -> sama-sama "ganti teks berkas"
 *
 * ## Aturan yang dipatuhi modul ini
 *
 * 1. **Selalu <= 20 tool** (`BATAS_TOOL_TUGAS`). Bukan harapan: jumlahnya dijaga
 *    di satu tempat, dan `scripts/cek-subset-tugas.mjs` GAGAL (exit != 0) kalau
 *    ada satu kasus pun menembusnya.
 * 2. **TIDAK ADA kemampuan yang hilang.** Daftar disusun dari KELUARGA KEMAMPUAN:
 *    setiap keluarga yang dibutuhkan kelas ini WAJIB punya rumah di daftar akhir.
 *    Yang dipangkas hanya rumah kembar - dan setiap tool yang tidak masuk tetap
 *    terjangkau lewat `tool_search` -> `tool_call` (keduanya ada di
 *    `TOOL_INTI_TUGAS`, tidak pernah dipangkas).
 * 3. **Deterministik.** Tanpa `Math.random`, tanpa waktu, tanpa jaringan/disk:
 *    masukan sama -> daftar sama. Karena itu hasilnya bisa diuji di Node tanpa
 *    app hidup (`scripts/cek-subset-tugas.mjs`).
 * 4. **Satu tempat memutuskan.** Modul ini TIDAK menyentuh state, tidak membaca
 *    tool gate, tidak mengirim apa pun: ia menerima `aktif` dan mengembalikan
 *    daftar. Penyambungannya ke `subsetAlat.alatUntukTugas` adalah satu baris
 *    (lihat docs/USULAN-SUBSET-TUGAS.md).
 */

import { TOOL_CATALOG } from './zephyrTools/catalog';
/* `bentukTugas` dan `tugasButuhWeb` dipinjam dari modul yang sudah menentukan
   aturan itu di app (`agentDorong` -> `subsetAlat`). Superset kemampuan jadi
   KONSEKUENSI, bukan klaim: modul ini memakai definisi "tugas ini menulis?" dan
   "tugas ini menyentuh jaringan?" yang PERSIS sama dengan penyaring yang
   berjalan hari ini. Keduanya murni (tanpa React/Tauri), jadi modul ini tetap
   bisa diuji di Node. */
import { bentukTugas } from './agentDorong';
import { tugasButuhWeb } from './subsetAlat';

/* ------------------------------------------------------------------ */
/* Batas dan inti                                                     */
/* ------------------------------------------------------------------ */

/** Batas kebijakan jumlah tool yang DITAWARKAN per giliran (dari audit). */
export const BATAS_TOOL_TUGAS = 20;

/**
 * Tool INTI - selalu ikut, tidak pernah dipangkas.
 *
 * Ini kontrak syarat (2): baca/tulis berkas, cari (grep/glob), jalankan shell,
 * rencana (`todo_write`), dan JALUR PENEMUAN tool (`tool_search`/`tool_call`).
 * Tanpa keduanya, "dipangkas" berarti "hilang".
 */
export const TOOL_INTI_TUGAS: readonly string[] = [
  'read_file',
  'write_file',
  'grep',
  'glob',
  'bash_run',
  'todo_write',
  'tool_search',
  'tool_call',
];

/**
 * Tool yang tidak berguna tanpa folder terbuka - sama isinya dengan
 * `ALAT_BUTUH_FOLDER` di `subsetAlat.ts` (tiga tool yang menelusuri pohon).
 */
export const BUTUH_FOLDER_TUGAS: readonly string[] = ['list_directory', 'glob', 'grep'];

/* ------------------------------------------------------------------ */
/* Keluarga kemampuan                                                 */
/* ------------------------------------------------------------------ */

/**
 * KEMAMPUAN (keluarga) tiap tool.
 *
 * Inilah yang membuat "tidak ada kemampuan hilang" bisa DIPERIKSA, bukan cuma
 * dijanjikan: dua tool dengan keluarga sama adalah KEMBAR, jadi memangkas salah
 * satunya tidak menghapus kemampuan - rumahnya masih ada. Sebaliknya tool dengan
 * keluarga unik tidak boleh dipangkas selama keluarganya dibutuhkan kelas ini.
 *
 * Tool yang tidak terdaftar di sini mendapat keluarga `tool:<namanya>` = keluarga
 * unik. Itu sengaja: katalog bisa bertambah tanpa berkas ini ikut diperbarui, dan
 * arah salahnya harus ke "tool tetap dikirim", bukan ke "tool menghilang tanpa
 * ada yang menyadarinya".
 */
const KELUARGA_TOOL: Record<string, readonly string[]> = {
  /* baca & tulis berkas */
  read_file: ['baca-berkas'],
  write_file: ['tulis-berkas', 'buat-folder'],
  create_directory: ['tulis-berkas', 'buat-folder'],
  list_directory: ['daftar-isi-folder'],
  delete_file: ['hapus-berkas'],
  move_file: ['kelola-berkas'],
  copy_file: ['kelola-berkas'],
  /* TIGA rumah untuk satu kemampuan: ganti teks berkas */
  edit: ['ganti-teks-berkas'],
  multi_edit: ['ganti-teks-berkas'],
  replace_in_files: ['ganti-teks-berkas'],
  /* cari */
  grep: ['cari-isi'],
  glob: ['cari-berkas', 'daftar-isi-folder'],
  /* shell - satu keluarga untuk seluruh pengelolaan proses latar */
  bash_run: ['jalankan-shell'],
  bash_background: ['shell-latar'],
  bash_logs: ['shell-latar'],
  bash_list: ['shell-latar'],
  bash_kill: ['shell-latar'],
  /* rencana, penalaran, jalur tool */
  todo_write: ['rencana-tugas'],
  tool_search: ['temukan-tool'],
  tool_call: ['panggil-tool'],
  /* satu rumah untuk kemampuan delegasi agen */
  run_subagent: ['delegasi-agen'],
  /* kode & app */
  lsp_definition: ['navigasi-kode'],
  lsp_symbols: ['navigasi-kode'],
  lsp_references: ['navigasi-kode'],
  lsp_hover: ['navigasi-kode'],
  lsp_diagnostics: ['navigasi-kode'],
  lsp_call_hierarchy: ['navigasi-kode'],
  /* Dibaca-kode Zephyr SENDIRI, satu keluarga dengan `lsp_*`: keduanya menjawab
     "kode ini apa", bedanya `lsp_*` butuh language server sementara `zephyr_kode`
     hanya butuh berkasnya. Satu keluarga supaya jembatan yang mematikan salah
     satunya tidak dianggap kehilangan kemampuan. */
  zephyr_kode: ['navigasi-kode'],
  zephyr_self: ['introspeksi-app'],
  skill_view: ['muat-skill'],
  /* web: mencari, mengambil URL, dan membaca isi panel = TIGA kemampuan berbeda */
  web_search: ['web-cari'],
  web_fetch: ['web-ambil-url'],
  browser_open: ['panel-kendali'],
  browser_read: ['baca-panel'],
  browser_list: ['panel-kendali'],
  browser_close: ['panel-kendali'],
  browser_click: ['panel-kendali'],
  browser_type: ['panel-kendali'],
  browser_download_url: ['panel-kendali'],
  /* app lain */
  ingat: ['memori'],
  notes_write: ['catatan-user'],
  schedule_command: ['jadwal'],
  /* MCP Zephyr: kendali app */
  mcp__zephyr__inspect: ['kendali-app'],
  mcp__zephyr__run_command: ['kendali-app'],
  mcp__zephyr__open_file: ['kendali-app'],
  mcp__zephyr__workspace: ['kendali-app'],
  mcp__zephyr__set_setting: ['kendali-app'],
  mcp__zephyr__extension: ['kendali-app'],
  mcp__zephyr__ssh: ['kendali-app'],
  mcp__zephyr__state: ['kendali-app'],
  mcp__zephyr__read: ['kendali-app'],
  mcp__zephyr__sh: ['kendali-app'],
  mcp__zephyr__wait_for_terminal: ['kendali-app'],
  mcp__zephyr__worktree: ['kendali-app'],
  mcp__zephyr__focus_pane: ['kendali-app'],
  mcp__zephyr__pane: ['kendali-app'],
};

/** Keluarga kemampuan satu tool. Yang tak terdaftar = keluarga uniknya sendiri. */
export function keluargaTool(nama: string): string[] {
  const k = KELUARGA_TOOL[nama];
  return k ? [...k] : [`tool:${nama}`];
}

/** Keluarga gabungan sebuah daftar tool (dipakai pemeriksa superset). */
export function keluargaDaftar(daftar: readonly string[]): string[] {
  const set = new Set<string>();
  for (const n of daftar) for (const k of keluargaTool(n)) set.add(k);
  return [...set].sort();
}

/**
 * Keluarga yang HILANG ketika `sesudah` dibandingkan dengan `sebelum`.
 *
 * Kosong = tidak ada kemampuan yang berkurang. Inilah pemeriksaan inti syarat
 * (2); `scripts/cek-subset-tugas.mjs` memakainya dua arah: `sebelum` = daftar
 * yang dikirim app hari ini (`subsetAlat.alatUntukTugas`), `sesudah` = daftar
 * hasil pemangkasan modul ini. Wajib SUPERSET.
 */
export function keluargaHilang(sebelum: readonly string[], sesudah: readonly string[]): string[] {
  const ada = new Set(keluargaDaftar(sesudah));
  return keluargaDaftar(sebelum).filter((k) => !ada.has(k));
}

/* ------------------------------------------------------------------ */
/* Kelas tugas                                                        */
/* ------------------------------------------------------------------ */

export type KelasTugas =
  | 'baca'
  | 'tulis'
  | 'tulis-banyak'
  | 'perbaiki'
  | 'uji'
  | 'web'
  | 'panel'
  | 'shell'
  | 'hapus'
  | 'repo-wide'
  | 'git'
  | 'app'
  | 'jadwal'
  | 'memori';

/** Urutan tetap supaya hasil deterministik (bukan urutan kemunculan regex). */
export const URUTAN_KELAS: readonly KelasTugas[] = [
  'baca',
  'tulis',
  'tulis-banyak',
  'perbaiki',
  'uji',
  'web',
  'panel',
  'shell',
  'hapus',
  'repo-wide',
  'git',
  'app',
  'jadwal',
  'memori',
];

const POLA_KELAS: ReadonlyArray<readonly [KelasTugas, RegExp]> = [
  [
    'baca',
    /\b(baca|ringkas|ringkasan|jelaskan|lihat isi|tampilkan isi|tinjau|audit|analisis|analisa|periksa|kesiapan|kenapa|mengapa|apa itu|cari tahu|sebutkan|daftar isi)\b/i,
  ],
  [
    'tulis-banyak',
    /(\b\d{1,3}\s*(berkas|file|komponen|modul|halaman|artikel|tes|test|skrip|script|dokumen|fungsi)\b)|(\b(banyak|puluhan|beberapa)\s+(berkas|file|komponen|modul|halaman|artikel|dokumen)\b)|(\bmulti[- ]?(berkas|file|komponen)\b)/i,
  ],
  [
    'tulis',
    /\b(buat|bikin|tulis|tambah|simpan|generate|hasilkan|scaffold|komponen|berkas baru|file baru|readme|docs\/|tuliskan|dokumentasi)\b/i,
  ],
  [
    'repo-wide',
    /\b(seluruh repo|repo-wide|seluruh berkas|semua berkas|seluruh proyek|migrasi|migrasikan|seluruh|sekujur)\b/i,
  ],
  ['hapus', /\b(hapus|delete|buang|bersihkan|rapikan|prune|pindahkan|pindah|ganti nama)\b/i],
  ['perbaiki', /\b(perbaiki|benerin|benahi|fix|debug|refactor|ubah|sunting|patch|betulkan)\b/i],
  ['uji', /\b(uji|test|tes|lint|build|verifikasi|spec|regresi|jalankan test|jalankan uji)\b/i],
  [
    'web',
    /\b(web|website|situs|internet|online|daring|url|link|tautan|browser|google|scrape|scraping|download|unduh|harga|kurs|berita|news|cuaca|tiket)\b/i,
  ],
  ['panel', /\b(panel|pane|preview|pratinjau|screenshot|tangkapan layar|rekam layar)\b/i],
  [
    'shell',
    /\b(shell|terminal|perintah|command|bash|powershell|npm|pnpm|yarn|node |jalankan|bangun ulang|build ulang)\b/i,
  ],
  ['git', /\b(git|commit|branch|rebase|merge|stash|worktree|diff|checkout)\b/i],
  ['app', /\b(zephyr|setelan|pengaturan|log app|pintasan|shortcut|provider|profil)\b/i],
  ['jadwal', /\b(jadwal|schedule|cron|tiap jam|setiap hari|pengingat|berkala)\b/i],
  ['memori', /\b(ingat|memori|kenangan|lintas sesi|simpan ke memori)\b/i],
];

/**
 * Kelas-kelas tugas yang terdeteksi dari teks. Selalu ada minimal satu kelas:
 * `baca` adalah kelas bawaan (permintaan yang tidak menyebut apa pun tetap butuh
 * membaca). Urutannya mengikuti `URUTAN_KELAS` supaya deterministik.
 */
export function deteksiKelasTugas(teks: string | null | undefined): KelasTugas[] {
  const t = (teks ?? '').trim();
  const ada = new Set<KelasTugas>();
  if (t) {
    for (const [kelas, pola] of POLA_KELAS) if (pola.test(t)) ada.add(kelas);
    if (ada.size === 0) ada.add('baca');
  } else {
    ada.add('baca');
  }
  /* tulis-banyak selalu mengandaikan tulis; repo-wide selalu menyentuh berkas. */
  if (ada.has('tulis-banyak')) ada.add('tulis');
  if (ada.has('repo-wide')) ada.add('tulis');
  return URUTAN_KELAS.filter((k) => ada.has(k));
}

/* ------------------------------------------------------------------ */
/* Keluarga yang WAJIB ada per kelas + rumahnya                       */
/* ------------------------------------------------------------------ */

/** Kelas yang menyentuh jaringan (rumah web/panel ikut). */
const KELAS_WEB: readonly KelasTugas[] = ['web', 'panel'];

/**
 * Kelas yang mengubah berkas TIDAK lagi ditentukan dari daftar kelas di sini:
 * aturannya dipinjam apa adanya dari `bentukTugas` (lihat catatan import), karena
 * `subsetAlat.alatUntukTugas` memakai aturan itu untuk memutuskan apakah permukaan
 * tulis dikirim. Menyalin daftar kelas sendiri pernah membuat modul ini salah pada
 * pesan ambigu ("lanjut"): `subsetAlat` tetap mengirim 23 tool, modul ini cuma 17 -
 * kemampuan hilang justru di kasus yang paling tidak jelas.
 */

/**
 * Keluarga inti yang dibutuhkan SEMUA kelas - tepat keluarga dari 17 tool dasar
 * yang sudah dikirim app hari ini untuk tugas baca.
 *
 * `tulis-berkas` dan `buat-folder` sengaja ada di sini meski tugasnya cuma
 * membaca: syarat (2) meminta kemampuan menulis berkas selalu ada, dan hilangnya
 * permukaan tulis karena salah tebak kelas adalah kegagalan yang jauh lebih mahal
 * dari beberapa token.
 */
const KELUARGA_DASAR: readonly string[] = [
  'baca-berkas',
  'tulis-berkas',
  'buat-folder',
  'daftar-isi-folder',
  'cari-isi',
  'cari-berkas',
  'jalankan-shell',
  'shell-latar',
  'rencana-tugas',
  'temukan-tool',
  'panggil-tool',
  'introspeksi-app',
  'muat-skill',
  'navigasi-kode',
  'delegasi-agen',
];

/**
 * Keluarga tambahan yang dibutuhkan kelas yang MENGUBAH berkas.
 *
 * `subsetAlat` hari ini hanya membuang permukaan tulis untuk tugas kelas `baca`;
 * kelas lain (uji, shell, git, web, panel, app, jadwal, memori) tetap dikirim 23+
 * tool termasuk seluruh permukaan tulis. Superset kemampuan karenanya menuntut
 * keluarga tulis ikut untuk semua kelas selain `baca` - memangkasnya justru yang
 * akan menghilangkan kemampuan.
 */
const KELUARGA_TULIS: readonly string[] = ['ganti-teks-berkas', 'hapus-berkas', 'kelola-berkas'];
/*
 * `kelola-berkas` (pindah/salin) DULU sengaja tidak wajib, dengan alasan
 * `subsetAlat` tidak pernah mengirim `move_file`/`copy_file` untuk kelas mana
 * pun - menuntutnya berarti memaksa satu tool keluar dari jatah tanpa menambah
 * kemampuan. Alasan itu tidak berlaku lagi: `TOOL_DIKIRIM_SELALU` sekarang
 * memuat `move_file`/`copy_file` setiap giliran (prompt me-route namanya), jadi
 * kelas tulis memang menerimanya di `sebelum` - dan membiarkannya di luar
 * `KELUARGA_TULIS` membuat `pilihToolTugas` memangkasnya, keluarga
 * `kelola-berkas` hilang, dan `move_file`/`copy_file` jadi yatim. Yang salah
 * bukan daftarnya, tapi daftar wajib yang ketinggalan. Tetap terjangkau
 * `bash_run` (mv/cp) sebagai jalan cadangan.
 */

/**
 * Keluarga tambahan yang dibutuhkan kelas jaringan.
 *
 * `web-cari` (mencari), `web-ambil-url` (mengambil URL tertentu) dan `baca-panel`
 * (membaca isi panel browser = halaman yang dibuka pengguna, bisa bersesi login)
 * adalah TIGA kemampuan berbeda: menyatukannya pernah membuat `browser_read`
 * terpangkas pada tugas web padahal prompt me-route nama itu (cacat S4).
 */
const KELUARGA_WEB: readonly string[] = ['web-cari', 'web-ambil-url', 'baca-panel', 'panel-kendali'];

/**
 * Rumah tiap keluarga, TERURUT preferensi.
 *
 * Rumah pertama yang tersedia (ada di katalog, aktif di gate, dan tidak butuh
 * folder saat tidak ada folder) yang dipakai. Rumah kedua/ketiga adalah kembar
 * yang tetap terjangkau lewat `tool_search` bila tidak dipilih.
 */
const RUMAH: Record<string, readonly string[]> = {
  'baca-berkas': ['read_file'],
  'tulis-berkas': ['write_file'],
  'buat-folder': ['write_file'],
  'daftar-isi-folder': ['glob', 'list_directory'],
  'cari-isi': ['grep'],
  'cari-berkas': ['glob'],
  'jalankan-shell': ['bash_run'],
  'shell-latar': [],
  'rencana-tugas': ['todo_write'],
  'temukan-tool': ['tool_search'],
  'panggil-tool': ['tool_call'],
  'introspeksi-app': ['zephyr_self'],
  'muat-skill': ['skill_view'],
  'navigasi-kode': ['lsp_definition', 'lsp_symbols', 'lsp_references', 'lsp_diagnostics', 'zephyr_kode'],
  'delegasi-agen': ['run_subagent'],
  'hapus-berkas': ['delete_file'],
  'ganti-teks-berkas': ['multi_edit', 'replace_in_files'],
  /* pindah + salin digabung satu rumah: keduanya juga terjangkau `bash_run` (mv/cp) */
  'kelola-berkas': ['move_file', 'copy_file'],
  /* web: cari (satu rumah), ambil URL (satu rumah), baca panel (satu rumah) */
  'web-cari': ['web_search'],
  'web-ambil-url': ['web_fetch'],
  /* rumah pembaca panel: bukan `browser_open` (yang hanya membuka) */
  'baca-panel': ['browser_read'],
  /* panel: semua aksi panel satu keluarga, rumah dipilih dari kata kunci tugas */
  'panel-kendali': [
    'browser_open',
    'browser_read',
    'browser_list',
    'browser_click',
    'browser_type',
    'browser_close',
    'browser_download_url',
  ],
};

/**
 * Rumah `ganti-teks-berkas` yang paling tepat + cadangannya. Repo-wide butuh yang
 * menyapu banyak berkas sekaligus; satu berkas cukup dengan `edit`.
 */
export function rumahGantiTeks(kelas: readonly KelasTugas[]): { pilih: string; cadangan: string[] } {
  /* Repo-wide menyapu banyak berkas sekaligus; tulis-banyak menyentuh beberapa
     berkas dalam satu langkah (`multi_edit`); sisanya satu berkas (`edit`).
     Memilih `multi_edit` di sini SEKALIGUS menutup kembar: `tambahanKelas`
     juga mendorong `multi_edit` untuk `tulis-banyak`, dan tanpa ini keduanya
     (`edit` sebagai rumah + `multi_edit` sebagai tambahan) terkirim bersamaan -
     dua tool satu keluarga yang cek-subset-tugas tolak. */
  /* `edit` dibuang pada pemangkasan ke 40 inti, jadi `multi_edit` sekarang
     satu-satunya rumah "ganti teks berkas" - dan pemilihannya jadi lebih
     sederhana: banyak berkas -> `replace_in_files`, sisanya -> `multi_edit`. */
  if (kelas.includes('repo-wide')) return { pilih: 'replace_in_files', cadangan: ['multi_edit'] };
  if (kelas.includes('tulis-banyak')) return { pilih: 'multi_edit', cadangan: ['replace_in_files'] };
  return { pilih: 'multi_edit', cadangan: ['replace_in_files'] };
}

/** Rumah `delegasi-agen`: satu-satunya rumahnya kini `run_subagent`. */
export function rumahDelegasi(_kelas: readonly KelasTugas[]): { pilih: string; cadangan: string[] } {
  return { pilih: 'run_subagent', cadangan: [] };
}

/** Rumah `panel-kendali`: aksi yang disebut tugas lebih dulu menang. */
export function rumahPanel(teks: string): { pilih: string; cadangan: string[] } {
  const kandidat: ReadonlyArray<readonly [RegExp, string]> = [
    [/\b(klik|click|tekan|tap|tombol|button|centang)\b/i, 'browser_click'],
    [/\b(ketik|type|isi kolom|form|login|kirim teks)\b/i, 'browser_type'],
    [/\b(baca|read|isi halaman|konten halaman|teks halaman|ambil isi)\b/i, 'browser_read'],
    [/\b(daftar|list|tab|tabel|riwayat)\b/i, 'browser_list'],
    [/\b(tutup|close)\b/i, 'browser_close'],
    [/\b(unduh|download|simpan halaman)\b/i, 'browser_download_url'],
    [/\b(buka|open|navigasi|kunjungi|halaman|url|link|tautan|panel|preview|pratinjau)\b/i, 'browser_open'],
  ];
  const semua = RUMAH['panel-kendali'] ?? [];
  const pilih = kandidat.find(([pola]) => pola.test(teks))?.[1] ?? semua[0] ?? 'browser_open';
  return { pilih, cadangan: semua.filter((n) => n !== pilih) };
}

/**
 * Tambahan per kelas, TERURUT prioritas.
 *
 * Ini KENYAMANAN, bukan kebutuhan: keluarga wajibnya sudah ditutup sebelum daftar
 * ini dilihat. Panjangnya sengaja melebihi sisa jatah, jadi menambah kelas tidak
 * pernah membuat daftar menembus 20 - yang terjadi hanya prioritas teratas yang
 * masuk, sisanya tetap terjangkau lewat `tool_search`.
 */
function tambahanKelas(kelas: readonly KelasTugas[]): string[] {
  const hasil: string[] = [];
  const push = (n: string) => {
    if (!hasil.includes(n)) hasil.push(n);
  };
  if (kelas.includes('baca')) {
    push('list_directory');
    push('zephyr_kode');
    push('lsp_diagnostics');
  }
  if (kelas.includes('tulis') || kelas.includes('perbaiki')) {
    push('list_directory');
  }
  if (kelas.includes('tulis-banyak')) {
    push('list_directory');
    push('multi_edit');
  }
  if (kelas.includes('repo-wide')) {
    push('move_file');
    push('list_directory');
  }
  if (kelas.includes('perbaiki')) push('lsp_diagnostics');
  if (kelas.includes('uji')) {
    push('lsp_diagnostics');
  }
  if (kelas.includes('hapus') || kelas.includes('shell')) {
    push('move_file');
  }
  if (kelas.includes('web') || kelas.includes('panel')) {
    push('web_search');
    push('browser_list');
  }
  if (kelas.includes('git')) {
  }
  if (kelas.includes('app')) {
    push('mcp__zephyr__inspect');
    push('mcp__zephyr__read');
  }
  if (kelas.includes('jadwal')) {
    push('schedule_command');
  }
  if (kelas.includes('memori')) {
    push('ingat');
    push('notes_write');
  }
  return hasil;
}

/* ------------------------------------------------------------------ */
/* Pemilihan                                                          */
/* ------------------------------------------------------------------ */

export interface Dipangkas {
  nama: string;
  keluarga: string[];
  /** Kenapa tool ini tidak ikut kali ini. */
  alasan: string;
}

export interface JejakPemilihan {
  tugas: string;
  kelas: KelasTugas[];
  adaFolder: boolean;
  batas: number;
  /** Rumah per keluarga wajib: keluarga -> rumah yang dipilih. */
  rumahWajib: Array<{ keluarga: string; rumah: string; rumahLain: string[] }>;
  /** Keluarga wajib yang TIDAK punya rumah tersedia (biasanya karena gate user). */
  keluargaTanpaRumah: string[];
  /**
   * Keluarga wajib yang DITAHAN karena jatah `batas` sudah penuh sebelum
   * gilirannya (urutan `wajib` = prioritas: dasar -> web -> tulis). Dicatat
   * supaya yang mengalah terlihat di jejak, bukan hilang tanpa nama.
   */
  rumahDitahan: string[];
  /** Tool inti (selalu ikut) yang benar-benar ada di daftar akhir. */
  inti: string[];
  /** Tambahan kelas yang masih muat di jatah. */
  tambahan: string[];
  /** Daftar akhir yang dikirim ke provider (<= batas). */
  dikirim: string[];
  /** Tool aktif yang tidak dikirim kali ini + alasannya. */
  dipangkas: Dipangkas[];
  keluargaDikirim: string[];
}

const adaDiKatalog = new Set(TOOL_CATALOG.map((t) => t.name));

function boleh(nama: string, aktif: readonly string[], adaFolder: boolean): boolean {
  if (!adaDiKatalog.has(nama)) return false;
  if (!aktif.includes(nama)) return false;
  if (!adaFolder && BUTUH_FOLDER_TUGAS.includes(nama)) return false;
  return true;
}

/**
 * Rencana pemilihan lengkap untuk SATU giliran - dibaca app, harness, dan
 * dokumentasi. Semua yang dipakai `pilihToolTugas` ada di sini, jadi "kenapa tool
 * ini tidak ikut" selalu bisa dijawab tanpa menelusuri ulang kode.
 */
export function jejakPemilihan(
  tugas: string | null | undefined,
  aktif: readonly string[],
  adaFolder = true,
): JejakPemilihan {
  const teks = String(tugas ?? '');
  const kelas = deteksiKelasTugas(teks);
  /* Definisi yang sama dengan `subsetAlat.alatUntukTugas` (lihat catatan import). */
  const cumaBaca = bentukTugas(teks) === 'baca';
  const menulis = !cumaBaca;
  const pakaiWeb = tugasButuhWeb(teks) || kelas.some((k) => KELAS_WEB.includes(k));

  const dikirim: string[] = [];
  const asalTool = new Map<string, string>();
  /** Keluarga yang sudah punya rumah di daftar akhir. */
  const tertutup = new Set<string>();
  const rumahWajib: JejakPemilihan['rumahWajib'] = [];
  /** Keluarga wajib yang DITAHAN karena jatah 20 sudah penuh (urutan = prioritas). */
  const rumahDitahan: string[] = [];
  const keluargaTanpaRumah: string[] = [];

  const tambah = (nama: string, lewat: string) => {
    if (dikirim.includes(nama)) return;
    dikirim.push(nama);
    asalTool.set(nama, lewat);
    for (const k of keluargaTool(nama)) tertutup.add(k);
  };

  /* 1. INTI - sepuluh tool yang tidak pernah dipangkas. */
  for (const n of TOOL_INTI_TUGAS) {
    if (boleh(n, aktif, adaFolder)) tambah(n, 'inti');
  }

  /* 2. SATU rumah untuk setiap keluarga wajib kelas ini. */
  const wajib = [...KELUARGA_DASAR];
  /*
   * Urutan = PRIORITAS saat jatah 20 sempit.
   *
   * Pada gerbang lebar (62 tool aktif) dasar + tulis + web = 21 tool: satu harus
   * mengalah. Permukaan WEB (`browser_open`/`browser_read`/`web_fetch`) adalah
   * nama yang di-ROUTE prompt untuk tugas riset/browser, jadi ia didahulukan;
   * permukaan tulis tambahan (`edit`, `delete_file`) yang mengalah - dan
   * `write_file` sendiri tetap ikut karena ia tool inti. Urutan lama
   * (tulis lalu web) membuat yang tergusur justru `browser_open`, tepat pada
   * tugas yang paling membutuhkannya.
   */
  if (pakaiWeb) wajib.push(...KELUARGA_WEB);
  if (menulis) wajib.push(...KELUARGA_TULIS);
  for (const fam of wajib) {
    if (tertutup.has(fam)) continue;
    /* Jatah penuh: keluarga ini DITAHAN (dicatat di `rumahDitahan`), bukan
       hilang diam-diam. Urutan `wajib` di atas yang menentukan siapa mengalah. */
    if (dikirim.length >= BATAS_TOOL_TUGAS) {
      rumahDitahan.push(fam);
      continue;
    }
    let urutanRumah = RUMAH[fam] ?? [];
    if (fam === 'ganti-teks-berkas' && menulis) {
      const g = rumahGantiTeks(kelas);
      urutanRumah = [g.pilih, ...urutanRumah.filter((x) => x !== g.pilih)];
    }
    if (fam === 'delegasi-agen') {
      const d = rumahDelegasi(kelas);
      urutanRumah = [d.pilih, ...urutanRumah.filter((x) => x !== d.pilih)];
    }
    if (fam === 'panel-kendali') {
      const p = rumahPanel(teks);
      urutanRumah = [p.pilih, ...p.cadangan];
    }
    /*
     * Kandidat rumah harus BENAR-BENAR milik keluarga ini. Tanpa syarat ini
     * `rumahPanel` bisa memilih `browser_read` (keluarganya `baca-panel`) untuk
     * `panel-kendali`: alat itu sudah ada di daftar dari giliran `baca-panel`,
     * jadi `tambah()` diam kembali - `tertutup` tak pernah mencatat
     * `panel-kendali` dan `browser_open` gugur padahal prompt
     * menyebut namanya (systemPrompt.ts:651 "panggil browser_open").
     * Keluarga kemudian dilaporkan hilang oleh `keluargaHilang`. Tercatat dulu:
     * kehilangan itu nyata pada teks tugas uji-kurs-dollar.mjs.
     */
    const tersedia = urutanRumah.filter(
      (n) => boleh(n, aktif, adaFolder) && keluargaTool(n).includes(fam),
    );
    if (tersedia.length === 0) {
      keluargaTanpaRumah.push(fam);
      continue;
    }
    const dipilih = tersedia[0];
    tambah(dipilih, `keluarga ${fam}`);
    rumahWajib.push({ keluarga: fam, rumah: dipilih, rumahLain: tersedia.slice(1) });
  }

  /* 3. Tambahan kelas - selama jatah 20 masih ada. */
  const tambahan: string[] = [];
  for (const n of tambahanKelas(kelas)) {
    if (dikirim.length >= BATAS_TOOL_TUGAS) break;
    if (dikirim.includes(n)) continue;
    if (!boleh(n, aktif, adaFolder)) continue;
    tambahan.push(n);
    tambah(n, 'tambahan kelas');
  }

  /* Jaring keamanan TERAKHIR: konstruksinya sudah <= 20 (rumah keluarga wajib <=
     20, tambahan dijaga jatah), jadi jalur ini hanya menyala kalau ada yang
     menghitung lebih dari perkiraan - dan hanya TAMBAHAN yang boleh dibuang.
     Tool inti dan rumah keluarga wajib tidak pernah dibuang di sini: kemampuan
     tidak boleh hilang diam-diam demi angka. */
  while (dikirim.length > BATAS_TOOL_TUGAS) {
    let dibuang = false;
    for (let i = dikirim.length - 1; i >= 0; i--) {
      const n = dikirim[i];
      if (TOOL_INTI_TUGAS.includes(n)) continue;
      if (asalTool.get(n)?.startsWith('keluarga ')) continue;
      dikirim.splice(i, 1);
      asalTool.delete(n);
      dibuang = true;
      break;
    }
    if (!dibuang) break;
  }

  const dipangkas: Dipangkas[] = aktif
    .filter((n) => adaDiKatalog.has(n) && !dikirim.includes(n))
    .map((n) => ({
      nama: n,
      keluarga: keluargaTool(n),
      alasan: alasanDipangkas(n, kelas, pakaiWeb, menulis, adaFolder),
    }));

  return {
    tugas: teks.slice(0, 300),
    kelas,
    adaFolder,
    batas: BATAS_TOOL_TUGAS,
    rumahWajib,
    rumahDitahan,
    keluargaTanpaRumah,
    inti: TOOL_INTI_TUGAS.filter((n) => dikirim.includes(n)),
    tambahan,
    dikirim,
    dipangkas,
    keluargaDikirim: keluargaDaftar(dikirim),
  };
}

function alasanDipangkas(
  nama: string,
  kelas: readonly KelasTugas[],
  pakaiWeb: boolean,
  menulis: boolean,
  adaFolder: boolean,
): string {
  if (!adaFolder && BUTUH_FOLDER_TUGAS.includes(nama)) return 'tidak ada folder terbuka';
  const fam = keluargaTool(nama);
  if (!pakaiWeb && fam.some((k) => k === 'web-cari' || k === 'panel-kendali')) {
    return 'kelas tugas ini tidak menyentuh jaringan';
  }
  if (fam.includes('panel-kendali')) {
    return 'kembar panel: satu rumah panel sudah dikirim - aksi lain tetap terjangkau lewat tool_search';
  }
  if (!menulis && fam.includes('ganti-teks-berkas')) return 'kelas tugas ini tidak mengubah berkas';
  if (!menulis && fam.includes('hapus-berkas')) return 'kelas tugas ini tidak menghapus berkas';
  if (!menulis && fam.includes('kelola-berkas')) return 'kelas tugas ini tidak memindahkan berkas';
  if (fam.some((k) => (RUMAH[k] ?? []).length > 1)) {
    return 'kembar: satu rumah lain untuk kemampuan yang sama sudah dikirim';
  }
  return `kelas tugas ini (${kelas.join('+') || 'baca'}) tidak membutuhkannya secara langsung - tetap terjangkau lewat tool_search`;
}

/** Daftar akhir untuk provider. Inilah yang dipakai app; selalu <= 20. */
export function pilihToolTugas(
  tugas: string | null | undefined,
  aktif: readonly string[],
  adaFolder = true,
): string[] {
  return jejakPemilihan(tugas, aktif, adaFolder).dikirim;
}

/** Jatah terpakai / sisa - dibaca harness & UI. */
export function jatahTool(tugas: string | null | undefined, aktif: readonly string[], adaFolder = true) {
  const j = jejakPemilihan(tugas, aktif, adaFolder);
  return { dikirim: j.dikirim.length, sisa: Math.max(0, BATAS_TOOL_TUGAS - j.dikirim.length), batas: BATAS_TOOL_TUGAS };
}

/* ------------------------------------------------------------------ */
/* LAMA-a4: paksa rencana di tugas berat                              */
/* ------------------------------------------------------------------ */

/** Satu kata kunci "berat" + alasan manusianya. */
export const KATA_BERAT: ReadonlyArray<{ kata: string; pola: RegExp; kenapa: string }> = [
  { kata: 'bikin', pola: /\bbikin\b/i, kenapa: 'membuat sesuatu dari nol = banyak langkah' },
  { kata: 'buat', pola: /\b(buat|buatkan|bangun|membangun)\b/i, kenapa: 'membuat = banyak langkah' },
  {
    kata: 'perbaiki',
    pola: /\b(perbaiki|benerin|benahi|fix|debug|refactor|restruktur)\b/i,
    kenapa: 'perbaikan menuntut mencari sebab dulu, lalu mengubah, lalu menguji',
  },
  {
    kata: 'semua',
    pola: /\b(semua|seluruh|sekujur|puluhan|banyak)\b/i,
    kenapa: 'cakupan luas = urutan kerja harus dijaga',
  },
  {
    kata: 'migrasi',
    pola: /\b(migrasi|migrasikan|ganti nama|rename)\b/i,
    kenapa: 'perubahan menyeluruh, gampang setengah jalan',
  },
  {
    kata: 'uji',
    pola: /\b(uji|test|tes|lint|verifikasi|regresi|build)\b/i,
    kenapa: 'mengubah keadaan repo: urutan langkah harus jelas',
  },
  {
    kata: 'hapus',
    pola: /\b(hapus|buang|bersihkan|rapikan|prune)\b/i,
    kenapa: 'penghapusan tidak bisa dibatalkan: rencana dulu',
  },
  {
    kata: 'integrasi',
    pola: /\b(integrasi|integrasikan|implementasi|implementasikan|sambungkan|pasang)\b/i,
    kenapa: 'menyentuh beberapa tempat sekaligus',
  },
  {
    kata: 'tambah',
    pola: /\b(tambahkan|tambah)\b/i,
    kenapa: 'penambahan biasanya menyentuh lebih dari satu berkas',
  },
];

/** Cakupan angka: "20 komponen", "3 berkas" - mulai dari 3, itu sudah berat. */
const POLA_JUMLAH =
  /(\d{1,3})\s*(berkas|file|komponen|modul|halaman|artikel|tes|test|skrip|script|dokumen|fungsi|endpoint|tabel)/i;

/** Daftar bernomor/bergaris: tanda tugas disusun beberapa langkah. */
const POLA_DAFTAR = /(^|\n)\s*(?:[-*]|\d+[.)])\s+\S/;

/** Kata kunci berat yang cocok di teks tugas (untuk keputusan yang bisa dibaca). */
export function cocokKataBerat(teks: string | null | undefined): string[] {
  const t = (teks ?? '').trim();
  if (!t) return [];
  return KATA_BERAT.filter((k) => k.pola.test(t)).map((k) => k.kata);
}

export interface KeputusanTodo {
  tugas: string;
  wajibTodo: boolean;
  kelas: KelasTugas[];
  cocok: string[];
  alasan: string[];
  /** Yang harus dilakukan di langkah pertama tugas berat (dibaca app/harness). */
  langkahPertama: string[];
  /** Yang TIDAK boleh dilakukan di langkah pertama tugas berat. */
  larangan: string[];
}

/**
 * Tugas ini WAJIB menulis rencana di langkah pertama?
 *
 * Ringan = tidak. Ringannya diukur dari BENTUK permintaan, bukan panjangnya:
 * "Baca src/lib/aiStore.ts, ringkas fungsi penyimpanan pesan" itu satu langkah
 * baca, dan memaksa rencana di situ hanya membakar satu langkah.
 *
 * Bedanya dengan `subsetAlat.tugasBerat`: fungsi itu mensyaratkan
 * `bentukTugas(teks) === 'tulis'`, sehingga "Perbaiki bug di ... lalu jalankan
 * test-nya" dinilai TIDAK berat (audit: berat=tidak) padahal jelas banyak langkah
 * (audit: 23 tool). Di sini kata kunci perbaiki/uji/hapus/migrasi ikut memicu -
 * dan keputusannya bisa dibaca satu per satu (`alasan`), bukan angka ajaib.
 */
export function wajibTodo(teks: string | null | undefined): boolean {
  return keputusanTodo(teks).wajibTodo;
}

/** Keputusan lengkap yang bisa dibaca manusia - dipakai harness & dokumentasi. */
export function keputusanTodo(teks: string | null | undefined): KeputusanTodo {
  const t = String(teks ?? '').trim();
  const kelas = deteksiKelasTugas(t);
  const cocok = cocokKataBerat(t);
  const alasan: string[] = [];
  if (!t) {
    return {
      tugas: '',
      wajibTodo: false,
      kelas,
      cocok,
      alasan: ['tugas kosong: tidak ada yang perlu dirancang'],
      langkahPertama: [],
      larangan: [],
    };
  }
  for (const k of KATA_BERAT) if (k.pola.test(t)) alasan.push(`kata "${k.kata}": ${k.kenapa}`);
  const jumlah = POLA_JUMLAH.exec(t);
  if (jumlah && Number(jumlah[1]) >= 3) {
    alasan.push(`menyebut ${jumlah[1]} ${jumlah[2]}: cakupannya banyak`);
  }
  if (POLA_DAFTAR.test(t)) alasan.push('permintaan berbentuk daftar: beberapa langkah sekaligus');
  if (t.length >= 200) alasan.push(`teks panjang (${t.length} karakter): biasanya perintah rinci`);
  if (kelas.length >= 3) alasan.push(`menyentuh ${kelas.length} kelas tugas (${kelas.join(', ')})`);

  const wajib =
    cocok.length > 0 ||
    (jumlah !== null && Number(jumlah[1]) >= 3) ||
    POLA_DAFTAR.test(t) ||
    t.length >= 200 ||
    kelas.length >= 3;

  return {
    tugas: t.slice(0, 300),
    wajibTodo: wajib,
    kelas,
    cocok,
    alasan,
    langkahPertama: wajib
      ? ['todo_write: tulis rencana lengkap SEBELUM aksi pertama']
      : ['langsung kerjakan'],
    larangan: wajib
      ? [
          'jangan memanggil tool tulis/hapus sebelum todo_write',
          'jangan menulis rencana sebagian lalu menambahkannya sambil jalan',
        ]
      : [],
  };
}

/** Ringkasan satu baris untuk log/harness. */
export function ringkasKeputusanTodo(teks: string | null | undefined): string {
  const k = keputusanTodo(teks);
  return `${k.wajibTodo ? 'WAJIB TODO' : 'ringan     '} | kelas=${k.kelas.join('+')} | cocok=${
    k.cocok.join(',') || '-'
  } | ${k.alasan[0] ?? '-'}`;
}
