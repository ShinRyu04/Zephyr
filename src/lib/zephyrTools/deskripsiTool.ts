/**
 * Deskripsi tampilan tool, dipisah dari katalog supaya bahasa bisa berganti.
 *
 * Kenapa dipisah:
 *
 *   `catalog.ts` tetap menjadi SATU-SATUNYA sumber kebenaran untuk hal yang
 *   menentukan perilaku: nama tool, kelompok, kelas efek samping, dan
 *   needsApproval. Yang TIDAK ikut tinggal di sana adalah teks yang dibaca
 *   manusia, karena teks itu tidak boleh ikut menentukan apa yang dijalankan.
 *
 *   Sebelumnya deskripsi tinggal sebagai elemen kelima di setiap baris katalog
 *   dan selalu berbahasa Indonesia. Akibatnya user berbahasa Inggris tetap
 *   melihat teks Indonesia di panel Tools, walaupun seluruh sisa antarmuka
 *   sudah mengikuti bahasa aktif.
 *
 * Peta di bawah tidak pernah menentukan tool mana yang ADA:
 *
 *   - `DESKRIPSI_TOOL_ID` memuat teks Indonesia apa adanya, disalin persis
 *     dari katalog, supaya `deskripsiTool` bisa mengembalikannya.
 *   - `DESKRIPSI_TOOL_EN` memuat padanan Inggrisnya.
 *   - Himpunan kunci KEDUANYA harus sama persis dengan nama tool di katalog.
 *     Kalau katalog menambah tool baru, dua peta ini yang harus menyusul.
 *
 * Dipakai lewat `deskripsiTool(nama, bahasa)`, supaya pemanggil tidak perlu
 * tahu peta mana yang berlaku. Bahasa selain `id` memakai teks Inggris -
 * Inggris adalah bahasa cadangan, bukan salah satu dari sekian banyak pilihan,
 * jadi tool yang baru ditambahkan tetap punya deskripsi yang bisa dibaca.
 */

/** Deskripsi Indonesia asli, disalin persis dari catalog.ts. */
export const DESKRIPSI_TOOL_ID: Record<string, string> = {
  read_file: 'Baca berkas dari disk, atau buffer editor yang belum tersimpan',
  list_directory: 'Daftar isi sebuah folder',
  write_file: 'Tulis berkas ke disk, atau buat berkas baru',
  create_directory: 'Buat folder, termasuk folder induk yang belum ada',
  move_file: 'Pindahkan atau ganti nama berkas/folder',
  copy_file: 'Salin berkas atau folder',
  delete_file: 'Hapus berkas atau folder',
  replace_in_files: 'Ganti teks atau pola di banyak berkas sekaligus',
  edit: 'Ubah sebagian isi berkas: cari teks lama, ganti teks baru',
  multi_edit: 'Beberapa penggantian pada satu berkas dalam satu langkah',
  grep: 'Cari teks di seluruh workspace',
  glob: 'Cari berkas berdasarkan pola nama atau jalur',
  bash_run: 'Jalankan perintah dan tunggu sampai selesai',
  bash_background: 'Jalankan proses lama (server, watcher) di latar belakang',
  bash_logs: 'Baca keluaran proses latar belakang',
  bash_list: 'Daftar proses latar belakang yang hidup',
  bash_kill: 'Hentikan proses latar belakang',
  fetch: 'Ambil satu halaman web dan kembalikan teksnya',
  run_subagent: 'Jalankan satu subagent untuk tugas mandiri',
  run_subagents: 'Jalankan beberapa subagent paralel',
  todo_write: 'Ganti daftar tugas agen untuk tugas ini',
  notes_read: 'Baca catatan dan todo milik user',
  notes_write: 'Ubah catatan atau todo milik user',
  schedule_command: 'Jadwalkan perintah untuk dijalankan nanti',
  list_schedules: 'Daftar perintah yang terjadwal',
  cancel_schedule: 'Batalkan perintah terjadwal',
  suggest_command: 'Sarankan satu perintah shell sebagai kartu - user yang menjalankannya',
  get_terminal_output: 'Baca potongan terakhir scrollback terminal aktif',
  open_preview: 'Buka pratinjau localhost di pane browser',
  /* Pola OpenJarvis (think.py, Apache-2.0): scratchpad penalaran tanpa efek samping. */
  think: 'Catat penalaran selangkah sebelum bertindak',
  /* Pola OpenJarvis (calculator.py, Apache-2.0): aritmetika deterministik tanpa eval. */
  calculator: 'Hitung ekspresi aritmetika secara deterministik',
  inspect: 'Periksa command, pane, tab, workspace, atau setelan yang tersedia',
  run_command: 'Jalankan sebuah command aplikasi berdasarkan id-nya',
  open_file: 'Buka berkas di editor, bisa langsung ke baris tertentu',
  workspace: 'Lihat, buat, atau ganti workspace',
  set_setting: 'Ubah satu preferensi aplikasi',
  extension: 'Lihat, aktifkan, atau nonaktifkan ekstensi',
  ssh: 'Buka atau pakai koneksi SSH tersimpan',
  state: 'Cuplikan keadaan jendela: tab, pane, fokus',
  read: 'Baca satu permukaan: terminal, buffer editor, atau DOM',
  sh: 'Jalankan perintah di pane terminal milik user',
  wait_for_terminal: 'Tunggu terminal selesai atau memunculkan teks tertentu',
  worktree: 'Kelola git worktree',
  focus_pane: 'Fokuskan sebuah pane tanpa mengklik',
  pane: 'Buka, bagi, tutup, atau susun pane',
  web_search: 'Cari di internet',
  web_fetch: 'Ambil dan bersihkan satu halaman web',
  browser_open: 'Buka URL di pane browser yang terlihat',
  browser_read: 'Baca isi halaman di pane browser',
  browser_click: 'Klik elemen di pane browser',
  browser_type: 'Isi kolom di pane browser lalu tekan Enter',
  browser_nav: 'Maju, mundur, muat ulang, atau pindah URL',
  browser_list: 'Daftar pane browser yang terbuka',
  browser_close: 'Tutup pane browser',
  browser_download_url: 'Unduh URL langsung ke berkas di workspace',
  system_browser_open: 'Buka URL di browser sistem',
};

/** Padanan Inggrisnya, satu kunci untuk setiap nama tool di katalog. */
export const DESKRIPSI_TOOL_EN: Record<string, string> = {
  read_file: 'Read a file from disk, or an unsaved editor buffer',
  list_directory: 'List the contents of a folder',
  write_file: 'Write a file to disk, or create a new one',
  create_directory: 'Create a folder, including any missing parent folders',
  move_file: 'Move or rename a file or folder',
  copy_file: 'Copy a file or folder',
  delete_file: 'Delete a file or folder',
  replace_in_files: 'Replace text or a pattern across many files at once',
  edit: 'Change part of a file: find old text, replace it with new text',
  multi_edit: 'Several replacements in one file, in a single step',
  grep: 'Search for text across the whole workspace',
  glob: 'Find files by name or path pattern',
  bash_run: 'Run a command and wait for it to finish',
  bash_background: 'Run a long-lived process (server, watcher) in the background',
  bash_logs: 'Read the output of a background process',
  bash_list: 'List the background processes that are running',
  bash_kill: 'Stop a background process',
  fetch: 'Fetch a single web page and return its text',
  run_subagent: 'Run one subagent for a self-contained task',
  run_subagents: 'Run several subagents in parallel',
  todo_write: "Replace the agent's task list for this task",
  notes_read: "Read the user's notes and todos",
  notes_write: "Change the user's notes or todos",
  schedule_command: 'Schedule a command to run later',
  list_schedules: 'List the scheduled commands',
  cancel_schedule: 'Cancel a scheduled command',
  suggest_command: 'Suggest a shell command as a card - the user runs it themselves',
  get_terminal_output: 'Read the latest chunk of the active terminal scrollback',
  open_preview: 'Open a localhost preview in the browser pane',
  think: 'Record one step of reasoning before acting',
  calculator: 'Evaluate an arithmetic expression deterministically',
  inspect: 'Inspect the available commands, panes, tabs, workspaces, or settings',
  run_command: 'Run an application command by its id',
  open_file: 'Open a file in the editor, optionally at a specific line',
  workspace: 'View, create, or switch workspace',
  set_setting: 'Change a single application preference',
  extension: 'View, enable, or disable extensions',
  ssh: 'Open or use a saved SSH connection',
  state: 'A snapshot of the window state: tabs, panes, focus',
  read: 'Read one surface: terminal, editor buffer, or DOM',
  sh: "Run a command in the user's terminal pane",
  wait_for_terminal: 'Wait until the terminal finishes or prints certain text',
  worktree: 'Manage git worktrees',
  focus_pane: 'Focus a pane without clicking it',
  pane: 'Open, split, close, or arrange panes',
  web_search: 'Search the internet',
  web_fetch: 'Fetch and clean up a single web page',
  browser_open: 'Open a URL in the visible browser pane',
  browser_read: 'Read the page content in the browser pane',
  browser_click: 'Click an element in the browser pane',
  browser_type: 'Fill a field in the browser pane and press Enter',
  browser_nav: 'Go forward, go back, reload, or navigate to a URL',
  browser_list: 'List the open browser panes',
  browser_close: 'Close a browser pane',
  browser_download_url: 'Download a URL straight to a file in the workspace',
  system_browser_open: 'Open a URL in the system browser',
};

/**
 * Pelepasan awalan MCP untuk nama tool yang dibaca manusia.
 *
 * Sama seperti di katalog, awalan yang sudah dipensiunkan ikut diterima:
 * giliran yang dilanjutkan dari sesi tersimpan masih membawa awalan lama, dan
 * kalau awalan itu tidak dilepas di sini, baris tool itu tampil polos tanpa
 * deskripsi.
 */
export const POLA_AWALAN_MCP = /^mcp__(?:zephyr|tedi)__/;

/**
 * Deskripsi satu tool dalam bahasa yang diminta.
 *
 * Bahasa selain `id` memakai teks Inggris. Nama yang tidak dikenal
 * mengembalikan string kosong, bukan teks Indonesia: deskripsi kosong membuat
 * panel menyembunyikan barisnya (lihat ToolGatePanel), sedangkan teks asing
 * yang muncul begitu saja lebih membingungkan daripada tidak ada teks.
 */
export function deskripsiTool(nama: string, bahasa: string): string {
  /*
   * Awalan protokol MCP dilepas di sini.
   *
   * Katalog menyimpan tool MCP dengan nama lengkap `mcp__zephyr__inspect`,
   * sedangkan kedua peta di atas memakai nama polos `inspect` - nama polos itu
   * yang bermakna bagi pembaca. Tanpa pelepasan ini, keempat belas tool MCP
   * tampil TANPA deskripsi: terbukti dari uji, 14 deskripsi kosong dan
   * semuanya berawalan `mcp__zephyr__`.
   */
  const polos = nama.replace(POLA_AWALAN_MCP, '');
  const peta = bahasa === 'id' ? DESKRIPSI_TOOL_ID : DESKRIPSI_TOOL_EN;
  return peta[polos] ?? peta[nama] ?? '';
}

