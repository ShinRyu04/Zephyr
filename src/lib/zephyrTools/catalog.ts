/**
 * Katalog tool AI - daftar TUNGGAL yang menjadi sumber kebenaran.
 *
 * Bentuknya dua lapis:
 *
 *   43 tool INTI - 29 bawaan + 14 MCP. Selalu terpasang, selalu aktif.
 *   11 tool web/browser - terpasang, tapi mati sampai user menyalakannya.
 *
 * Aturan yang membuat berkas ini berguna:
 *
 *   1. Nama tool persis, huruf besar-kecil diperhatikan.
 *   2. Nama yang sama muncul dua kali = kesalahan, bukan "yang terakhir menang".
 *      Penggantian diam-diam adalah cara paling mudah membuat satu tool
 *      mengeksekusi handler yang salah.
 *   3. Tool MCP punya nama internal polos (inspect) dan nama yang dilihat
 *      model (mcp__zephyr__inspect). Yang dilihat model itulah yang masuk sini.
 *   4. Setiap tool punya satu kelompok dan satu kelas efek samping. Tool tanpa
 *      kelas tidak boleh dijalankan - jadi kelasnya wajib, bukan hiasan.
 *
 * Kelas efek samping dipakai untuk memutuskan mana yang boleh jalan sendiri
 * dan mana yang harus minta izin. Sebelumnya keputusan itu tersebar di
 * beberapa daftar nama yang dirawat terpisah, dan tool baru bisa lolos tanpa
 * klasifikasi apa pun. Sekarang daftar ini yang menentukan.
 */

import { DESKRIPSI_TOOL_ID } from './deskripsiTool';

/** Sumber tool, untuk ditampilkan di picker sebagai bagian terpisah. */
export type ToolSource = 'builtin' | 'mcp' | 'web';

/**
 * Apa yang bisa dilakukan tool ini.
 *
 * read     - hanya membaca, tidak mengubah apa pun.
 * net      - membaca jaringan (GET). Tidak mengubah workspace.
 * netWrite - mengirim data ke luar (POST, klik browser).
 * appWrite - mengubah keadaan aplikasi (todo, notes, jadwal, setelan).
 * fsWrite  - menulis ke disk.
 * exec     - menjalankan perintah / proses.
 */
export type ToolEffect = 'read' | 'net' | 'netWrite' | 'appWrite' | 'fsWrite' | 'exec';

export interface ToolCatalogEntry {
  /** Nama yang dilihat model. */
  name: string;
  /** Nama internal polos, untuk tool MCP. */
  bare?: string;
  source: ToolSource;
  /** Kelompok di picker. Setiap tool harus punya tepat satu. */
  group: string;
  effect: ToolEffect;
  /** Perlu persetujuan user sebelum dijalankan. */
  needsApproval: boolean;
  /** Deskripsi singkat untuk picker. */
  description: string;
}

/* ------------------------------------------------------------------ */
/* 29 tool BAWAAN - nama diambil persis dari katalog sumber.             */
/* ------------------------------------------------------------------ */

const BUILTIN: Array<[string, string, ToolEffect, boolean, string]> = [
  /* Files - 8 */
  ['read_file', 'Files', 'read', false, 'Baca berkas dari disk, atau buffer editor yang belum tersimpan'],
  ['list_directory', 'Files', 'read', false, 'Daftar isi sebuah folder'],
  ['write_file', 'Files', 'fsWrite', true, 'Tulis berkas ke disk, atau buat berkas baru'],
  ['create_directory', 'Files', 'fsWrite', true, 'Buat folder, termasuk folder induk yang belum ada'],
  ['move_file', 'Files', 'fsWrite', true, 'Pindahkan atau ganti nama berkas/folder'],
  ['copy_file', 'Files', 'fsWrite', true, 'Salin berkas atau folder'],
  ['delete_file', 'Files', 'fsWrite', true, 'Hapus berkas atau folder'],
  ['replace_in_files', 'Files', 'fsWrite', true, 'Ganti teks atau pola di banyak berkas sekaligus'],

  /* Edit - 2 */
  ['edit', 'Edit', 'fsWrite', true, 'Ubah sebagian isi berkas: cari teks lama, ganti teks baru'],
  ['multi_edit', 'Edit', 'fsWrite', true, 'Beberapa penggantian pada satu berkas dalam satu langkah'],

  /* Search - 2 */
  ['grep', 'Search', 'read', false, 'Cari teks di seluruh workspace'],
  ['glob', 'Search', 'read', false, 'Cari berkas berdasarkan pola nama atau jalur'],

  /* Shell - 5 */
  ['bash_run', 'Shell', 'exec', true, 'Jalankan perintah dan tunggu sampai selesai'],
  ['bash_background', 'Shell', 'exec', true, 'Jalankan proses lama (server, watcher) di latar belakang'],
  ['bash_logs', 'Shell', 'read', false, 'Baca keluaran proses latar belakang'],
  ['bash_list', 'Shell', 'read', false, 'Daftar proses latar belakang yang hidup'],
  ['bash_kill', 'Shell', 'exec', true, 'Hentikan proses latar belakang'],

  /* Web / fetch - 1 */
  ['fetch', 'Network', 'net', false, 'Ambil satu halaman web dan kembalikan teksnya'],

  /* Sub-agents - 2 */
  ['run_subagent', 'Sub-agents', 'exec', true, 'Jalankan satu subagent untuk tugas mandiri'],
  ['run_subagents', 'Sub-agents', 'exec', true, 'Jalankan beberapa subagent paralel'],

  /* Tasks - 1 */
  ['todo_write', 'Tasks & Notes', 'appWrite', true, 'Ganti daftar tugas agen untuk tugas ini'],

  /* Code intelligence - 5 */
  /*
   * The language-server queries. Read-only, and grouped apart from `grep`/`glob`
   * because they answer a different question: those find TEXT, these find CODE.
   * A gate that switched these off would leave the agent with only text search,
   * which still works — just less precisely — so they are not in TOOL_WAJIB.
   */
  ['lsp_symbols', 'Code intelligence', 'read', false, 'Daftar simbol di sebuah berkas, dengan jenis dan kedalaman'],
  ['lsp_references', 'Code intelligence', 'read', false, 'Tempat-tempat yang memakai sebuah simbol, menurut language server'],
  ['lsp_definition', 'Code intelligence', 'read', false, 'Lokasi definisi sebuah simbol'],
  ['lsp_hover', 'Code intelligence', 'read', false, 'Tipe dan dokumentasi simbol pada satu posisi'],
  ['lsp_diagnostics', 'Code intelligence', 'read', false, 'Galat dan peringatan language server untuk sebuah berkas'],

  /* Skills - 1 */
  /*
   * Read-only: 'read', not 'appWrite' and not 'exec'. A skill is content the
   * agent reads, and the prompt tells it to read one before work it matches —
   * so a gate that could switch this off would leave the agent holding a list
   * of skills it is not allowed to open.
   */
  ['skill_view', 'Skills', 'read', false, 'Baca isi skill yang terdaftar, atau daftar skillnya'],

  /* Notes - 2 */
  ['notes_read', 'Tasks & Notes', 'read', false, 'Baca catatan dan todo milik user'],
  ['notes_write', 'Tasks & Notes', 'appWrite', true, 'Ubah catatan atau todo milik user'],

  /* Schedule - 3 */
  ['schedule_command', 'Schedules', 'appWrite', true, 'Jadwalkan perintah untuk dijalankan nanti'],
  ['list_schedules', 'Schedules', 'read', false, 'Daftar perintah yang terjadwal'],
  ['cancel_schedule', 'Schedules', 'appWrite', true, 'Batalkan perintah terjadwal'],

  /* Terminal - 3 */
  ['suggest_command', 'Terminal', 'appWrite', true, 'Sarankan satu perintah shell sebagai kartu - user yang menjalankannya'],
  ['get_terminal_output', 'Terminal', 'read', false, 'Baca potongan terakhir scrollback terminal aktif'],
  ['open_preview', 'Terminal', 'appWrite', true, 'Buka pratinjau localhost di pane browser'],

  /* Penalaran - 3. `ask_user` bertanya ke user, tidak mengubah apa pun; diklasifikasikan read. */
  ['think', 'Penalaran', 'read', false, 'Catat penalaran selangkah sebelum bertindak'],
  ['calculator', 'Penalaran', 'read', false, 'Hitung ekspresi aritmetika secara deterministik'],
  ['ask_user', 'Penalaran', 'read', false, 'Tanya user saat keputusan benar-benar ambigu, lalu tunggu jawabannya'],
  /* Bridge progressive disclosure: mencari & memanggil tool yang tidak dikirim setiap saat. */
  ['tool_search', 'Penalaran', 'read', false, 'Cari tool yang tidak ada di daftar utama (web, browser, SSH, MCP, jadwal)'],
  ['tool_call', 'Penalaran', 'exec', true, 'Panggil tool yang ditemukan lewat tool_search'],
];

/* ------------------------------------------------------------------ */
/* 14 tool MCP - nama polos diambil dari tabel handler mcpServer.       */
/* ------------------------------------------------------------------ */

const MCP: Array<[string, string, ToolEffect, boolean, string]> = [
  ['inspect', 'inspect', 'read', false, 'Periksa command, pane, tab, workspace, atau setelan yang tersedia'],
  ['run_command', 'control', 'exec', true, 'Jalankan sebuah command aplikasi berdasarkan id-nya'],
  ['open_file', 'control', 'appWrite', true, 'Buka berkas di editor, bisa langsung ke baris tertentu'],
  ['workspace', 'control', 'appWrite', true, 'Lihat, buat, atau ganti workspace'],
  ['set_setting', 'control', 'appWrite', true, 'Ubah satu preferensi aplikasi'],
  ['extension', 'control', 'appWrite', true, 'Lihat, aktifkan, atau nonaktifkan ekstensi'],
  ['ssh', 'control', 'exec', true, 'Buka atau pakai koneksi SSH tersimpan'],
  ['state', 'inspect', 'read', false, 'Cuplikan keadaan jendela: tab, pane, fokus'],
  ['read', 'inspect', 'read', false, 'Baca satu permukaan: terminal, buffer editor, atau DOM'],
  ['sh', 'terminal', 'exec', true, 'Jalankan perintah di pane terminal milik user'],
  ['wait_for_terminal', 'terminal', 'read', false, 'Tunggu terminal selesai atau memunculkan teks tertentu'],
  ['worktree', 'control', 'appWrite', true, 'Kelola git worktree'],
  ['focus_pane', 'terminal', 'appWrite', true, 'Fokuskan sebuah pane tanpa mengklik'],
  ['pane', 'terminal', 'appWrite', true, 'Buka, bagi, tutup, atau susun pane'],
];

/* ------------------------------------------------------------------ */
/* 11 tool web/browser - tetap terpasang, tapi TIDAK menyala default. */
/* ------------------------------------------------------------------ */

/*
 * Sebelas tool ini sengaja dipisah dari 43 tool inti.
 *
 * Alasannya bukan soal asal-usul, melainkan soal apa yang terjadi kalau alat
 * ini menyala sejak awal. Pane browser bisa membuka halaman apa pun, klik dan
 * ketik bisa mengirim data ke luar, dan unduh menulis berkas dari internet.
 * Itu semua kemampuan yang pantas dipilih, bukan diwariskan diam-diam.
 *
 * Kontraknya:
 *   - tetap ada di katalog, tetap bisa dinyalakan satu per satu atau per grup
 *   - pada profil baru, HANYA yang membaca yang menyala (lihat di bawah)
 *   - 43 tool inti di atas tidak pernah bergantung padanya
 *
 * Empat di antaranya menyala sejak awal - `browser_open`, `browser_read`,
 * `browser_nav`, dan `web_fetch` - karena keempatnya hanya MENAMPILKAN atau
 * MEMBACA. Yang tetap mati adalah yang bertindak: klik, ketik, unduh ke disk,
 * dan buka browser sistem. Batasnya "mengubah vs menampilkan", bukan "di dalam
 * Zephyr vs di internet": `web_fetch` memang menarik data dari luar, tapi ia
 * tidak mengubah apa pun dan tidak menulis berkas.
 *
 * Daftar yang menyala itu tinggal di `toolGate.ts` (`TOOL_WEB_AKTIF_AWAL`),
 * bukan di sini - katalog hanya memutuskan bahwa tool ini ADA dan berisiko
 * net, sedangkan sekat yang memutuskan mana yang dipakai. Kalau nanti tambah
 * tool web baru, tempatkan di sini sebagai mati, lalu pilih sadar di sekat.
 */
const WEB: Array<[string, string, ToolEffect, boolean, string]> = [
  ['web_search', 'Web', 'net', false, 'Cari di internet'],
  ['web_fetch', 'Web', 'net', false, 'Ambil dan bersihkan satu halaman web'],
  ['browser_open', 'Browser', 'net', false, 'Buka URL di pane browser yang terlihat'],
  ['browser_read', 'Browser', 'read', false, 'Baca isi halaman di pane browser'],
  ['browser_click', 'Browser', 'netWrite', true, 'Klik elemen di pane browser'],
  ['browser_type', 'Browser', 'netWrite', true, 'Isi kolom di pane browser lalu tekan Enter'],
  ['browser_nav', 'Browser', 'net', false, 'Maju, mundur, muat ulang, atau pindah URL'],
  ['browser_list', 'Browser', 'read', false, 'Daftar pane browser yang terbuka'],
  ['browser_close', 'Browser', 'appWrite', true, 'Tutup pane browser'],
  ['browser_download_url', 'Browser', 'netWrite', true, 'Unduh URL langsung ke berkas di workspace'],
  ['system_browser_open', 'Browser', 'net', false, 'Buka URL di browser sistem'],
];

/* ------------------------------------------------------------------ */

/**
 * Awalan internal tool MCP - konvensi protokol, bukan bagian dari nama yang
 * dibaca siapa pun. Dispatcher dan prompt model bergantung padanya, jadi tool
 * MCP tetap menyusun namanya dengan awalan ini; yang dilepas hanya di lapisan
 * tampilan (lihat `namaPolos` di `labelAksi.ts`).
 */
export const AWALAN_MCP = 'mcp__zephyr__';

/**
 * Pelepasan awalan yang MASIH MENERIMA prefix lama.
 *
 * Sesi, checkpoint, dan setelan tersimpan dari versi sebelum penggantian nama
 * membawa awalan yang sudah dipensiunkan. Dua tempat membacanya:
 *
 *   - pembacaan: nama lama harus tetap dipetakan ke tool yang sama, kalau tidak
 *     giliran yang dilanjutkan berhenti di tengah jalan.
 *   - tampilan: nama lama harus tetap dilepas sebelum dibaca user, kalau tidak
 *     prefix yang sedang dihapus justru bocor lagi ke layar.
 *
 * Yang TIDAK boleh tetap memakai awalan lama adalah penulisan nama baru: semua
 * nama yang keluar dari katalog memakai `mcp__zephyr__`.
 */
export const POLA_AWALAN_MCP = /^mcp__(?:zephyr|tedi)__/;

function rakit(
  baris: Array<[string, string, ToolEffect, boolean, string]>,
  source: ToolSource,
): ToolCatalogEntry[] {
  return baris.map(([nama, group, effect, needsApproval, description]) => ({
    name: source === 'mcp' ? `${AWALAN_MCP}${nama}` : nama,
    bare: source === 'mcp' ? nama : undefined,
    source,
    group,
    effect,
    needsApproval,
    /* Deskripsi tidak lagi diketik di baris katalog, melainkan diambil dari
       deskripsiTool.ts. Tujuannya supaya katalog hanya memutuskan perilaku
       (nama, kelompok, efek, izin), sedangkan teks yang dibaca manusia bisa
       berganti bahasa tanpa menyentuh keputusan itu. Sumber bawaannya tetap
       Indonesia, sama seperti teks aslinya dulu. */
    description: DESKRIPSI_TOOL_ID[source === 'mcp' ? `${AWALAN_MCP}${nama}` : nama] ?? description,
  }));
}

/**
 * Katalog final: 29 bawaan + 14 MCP + 11 web/browser = 54 tool.
 *
 * Dua puluh sembilan dan empat belas membentuk 43 tool INTI. Sebelas sisanya
 * tersedia tapi tidak menyala sendiri.
 */
export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  ...rakit(BUILTIN, 'builtin'),
  ...rakit(MCP, 'mcp'),
  ...rakit(WEB, 'web'),
];

/** Jumlah yang diharapkan - dipakai verifikasi, bukan untuk ditampilkan. */
export const TOOL_COUNTS = {
  builtin: BUILTIN.length,
  mcp: MCP.length,
  web: WEB.length,
  /** Tool inti: yang wajib terpasang dan wajib aktif. */
  inti: BUILTIN.length + MCP.length,
  total: BUILTIN.length + MCP.length + WEB.length,
} as const;

/**
 * Tool yang aktif pada profil baru.
 *
 * Sengaja hanya yang membaca. Tool yang menulis, menjalankan perintah, atau
 * mengubah keadaan aplikasi dimatikan sampai user menyalakannya sendiri.
 * Alasannya sederhana: tool baru yang langsung menyala bisa melakukan sesuatu
 * yang tidak diminta sebelum user sempat membaca apa yang dia aktifkan.
 */
/**
 * Tool yang aktif pada profil baru: SELURUH 43 tool inti.
 *
 * Dulu berkas ini memuat daftar pendek berisi tool pembaca saja, dengan alasan
 * bahwa tool menulis tidak pantas menyala sendiri. Alasannya tidak salah, tapi
 * akibatnya salah: agen mulai dalam keadaan tidak bisa menulis berkas, tidak
 * bisa menjalankan perintah, dan tidak bisa menyimpan catatan - jadi setiap
 * tugas berhenti di tengah dengan pesan "tool dinonaktifkan", dan user
 * menyimpulkan aplikasinya rusak.
 *
 * Sekarang kontraknya jelas: 43 tool inti selalu aktif. Satu-satunya yang mati
 * sejak awal adalah 11 tool web/browser, karena itu permukaan yang bisa
 * mengirim data ke luar dan memang pantas dipilih user lebih dulu.
 *
 * Diturunkan dari katalog, bukan diketik ulang - daftar manual akan berbeda
 * dari katalognya cepat atau lambat, dan itu sudah terbukti di sini.
 */
export const TOOL_BAWAAN_AKTIF: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.source !== 'web',
).map((t) => t.name);

/**
 * Tool web yang MATI pada profil baru - yang bertindak, bukan yang membaca.
 *
 * ## Kenapa daftar MATI, bukan daftar NYALA
 *
 * Versi sebelumnya menyebut yang NYALA, dan itu arah yang salah. Daftar nyala
 * berarti tool web BARU lahir mati, dan kelahirannya yang perlu disadari
 * seseorang; kalau terlewat, ia mati diam-diam sampai user melihat baris merah
 * di transkrip. Itu yang persis terjadi pada `browser_list`:
 *
 *   1. User meminta agen membuka sebuah URL.
 *   2. Agen memanggil `browser_list` dulu untuk melihat apakah halamannya
 *      sudah terbuka - langkah yang wajar.
 *   3. Sekat menolaknya karena tool itu tidak ada di daftar nyala.
 *   4. Baris merah "List pages - failed" muncul di transkrip.
 *   5. Agen kehilangan jalan membuka pane, lalu beralih ke `web_fetch`
 *      berulang kali, dan pengawas anti-loop menghentikan seluruh giliran.
 *
 * Dengan daftar MATI, arah salahnya terbalik dan jauh lebih aman: tool baru
 * lahir BISA DIPAKAI. Yang perlu disadari seseorang adalah tool yang berbahaya,
 * dan tool berbahaya selalu ditulis dengan sadar - tidak ada yang menambahkan
 * "klik elemen di halaman user" tanpa memikirkannya.
 *
 * ## Isinya: yang mengubah sesuatu di luar Zephyr
 *
 *   browser_click, browser_type   - bertindak atas nama user di halaman web
 *   browser_download_url          - menulis berkas dari internet ke disk
 *   browser_close                 - menutup pane yang mungkin sedang dibaca
 *   system_browser_open           - melempar keluar ke browser sistem
 *
 * `web_search` dan `web_fetch` TIDAK di sini meski efeknya `net`: keduanya
 * cuma mengirim permintaan GET dan mengembalikan teks. Ia mengirim data ke
 * luar, tapi data itu adalah URL yang diminta agen sendiri - bukan isi mesin
 * user, bukan isi berkas, bukan sesuatu yang perlu izin.
 */
const WEB_MATI: readonly string[] = [
  'browser_click',
  'browser_type',
  'browser_download_url',
  'browser_close',
  'system_browser_open',
];

/**
 * Tool web yang nyala pada profil baru: katalog web DIKURANGI daftar mati.
 *
 * Tinggal di sini, bukan di `toolGate.ts`, karena `periksaKatalog()` di berkas
 * ini yang memeriksanya - pemeriksaan yang membaca daftarnya dari berkas lain
 * akan menyeret impor melingkar.
 */
export const TOOL_WEB_AKTIF_AWAL: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.source === 'web' && !WEB_MATI.includes(t.name),
).map((t) => t.name);

/** Peta nama -> entri, untuk pencarian cepat. */
export { deskripsiTool } from './deskripsiTool';

export const TOOL_BY_NAME: ReadonlyMap<string, ToolCatalogEntry> = new Map(
  TOOL_CATALOG.map((t) => [t.name, t]),
);

/** Nama semua tool yang terlihat model. */
export const TOOL_NAMES: readonly string[] = TOOL_CATALOG.map((t) => t.name);

/**
 * Periksa katalog sendiri. Dipanggil verifikasi statis DAN saat pengembangan,
 * supaya kesalahan di katalog tidak menunggu sampai runtime.
 */
export function periksaKatalog(): string[] {
  const masalah: string[] = [];

  /* Nama ganda = kesalahan. Jangan pernah diselesaikan dengan "yang terakhir
     menang": itu membuat satu nama menunjuk handler yang tidak diduga. */
  const terlihat = new Set<string>();
  for (const t of TOOL_CATALOG) {
    if (terlihat.has(t.name)) masalah.push(`nama ganda: ${t.name}`);
    terlihat.add(t.name);
  }

  /* Nama MCP polos tidak boleh bocor ke model - ia akan bertabrakan dengan
     tool bawaan (mis. read vs read_file) dan membingungkan pemilihan. */
  for (const t of TOOL_CATALOG) {
    if (t.source === 'mcp' && !t.name.startsWith(AWALAN_MCP)) {
      masalah.push(`tool MCP tanpa awalan: ${t.name}`);
    }
    if (t.source !== 'mcp' && t.name.startsWith('mcp__')) {
      masalah.push(`tool non-MCP berawalan mcp: ${t.name}`);
    }
  }

  /* Setiap tool butuh kelompok dan kelas. Tool tanpa kelas tidak bisa
     diputuskan izinnya, jadi itu kesalahan, bukan default. */
  for (const t of TOOL_CATALOG) {
    if (!t.group) masalah.push(`tanpa kelompok: ${t.name}`);
    if (!t.effect) masalah.push(`tanpa kelas efek: ${t.name}`);
  }

  /* Tool yang menulis wajib minta izin. Kalau tidak, daftar ini berbohong. */
  for (const t of TOOL_CATALOG) {
    if ((t.effect === 'fsWrite' || t.effect === 'exec') && !t.needsApproval) {
      masalah.push(`menulis tanpa izin: ${t.name}`);
    }
  }

  /* Default aktif harus benar-benar ada. */
  for (const n of TOOL_BAWAAN_AKTIF) {
    if (!TOOL_BY_NAME.has(n)) masalah.push(`default aktif tidak ada di katalog: ${n}`);
  }

  /*
   * Kelima tool web/browser yang punya efek tulis WAJIB minta izin.
   *
   * Browser bisa mengirim data ke luar - mengklik tombol kirim di halaman
   * adalah POST yang nyata - jadi memperlakukannya sebagai pembaca biasa akan
   * membuat sesuatu yang mengirim data terlihat seperti sesuatu yang tidak.
   */
  for (const t of TOOL_CATALOG) {
    if (t.source !== 'web') continue;
    if (t.effect === 'netWrite' && !t.needsApproval) {
      masalah.push(`tool web mengirim data tanpa izin: ${t.name}`);
    }
  }

  /*
   * Tool web BACA yang menyala default - dan hanya yang efeknya membaca.
   *
   * ## Kenapa pemeriksaan ini TIDAK memakai daftar nama sendiri
   *
   * Versi sebelumnya menulis ulang keempat nama di sini
   * (`['browser_open','browser_read','browser_nav','web_fetch']`), jadi aturan
   * "web baca boleh nyala" hidup di DUA tempat: di `toolGate.ts` sebagai
   * keputusan, dan di sini sebagai salinan. Salinan itulah yang membuat
   * `browser_list` bisa tertinggal di kedua-duanya sekaligus, tanpa satu pun
   * pemeriksaan berbunyi - karena pemeriksaannya membandingkan daftar dengan
   * dirinya sendiri.
   *
   * Sekarang yang diperiksa adalah ATURANNYA, bukan namanya: setiap tool web
   * ber-efek `read` harus ada, harus benar-benar bersumber web, dan - yang
   * paling penting - TIDAK boleh menuntut izin per panggilan. Membaca yang
   * minta izin berarti dua lapis penjagaan untuk perbuatan yang tidak mengubah
   * apa pun; user akan menekan "izinkan" puluhan kali untuk hal yang tidak
   * berisiko, dan itu melatihnya mengklik tanpa membaca.
   */
  const webSemua = TOOL_CATALOG.filter((t) => t.source === 'web');
  if (webSemua.length === 0) {
    masalah.push('tidak ada satu pun tool web - blok WEB di katalog hilang?');
  }
  /* Gagal-terbuka bukan berarti gagal-aman: tool yang mengubah sesuatu di luar
     Zephyr tetap harus meminta izin per panggilan. Kalau daftar mati berubah
     dan sebuah tool bertindak jadi nyala, izin inilah jaring terakhirnya. */
  for (const t of webSemua) {
    const bertindak = t.effect === 'netWrite' || t.effect === 'fsWrite' || t.effect === 'appWrite';
    if (bertindak && !t.needsApproval) {
      masalah.push(`tool web yang bertindak harus minta izin: ${t.name}`);
    }
  }
  /* Keputusan sekat dan aturan katalog harus sepakat. Kalau sekat menyalaikan
     sesuatu yang efeknya bukan membaca, itu perluasan izin yang tidak disengaja
     dan harus ketahuan di sini, bukan saat user melihatnya gagal. */
  for (const n of TOOL_WEB_AKTIF_AWAL) {
    const t = TOOL_BY_NAME.get(n);
    if (!t) masalah.push(`tool web aktif-default tidak ada di katalog: ${n}`);
    else if (t.source !== 'web') masalah.push(`bukan tool web: ${n}`);
    else if (t.effect !== 'read' && t.effect !== 'net') {
      masalah.push(`tool web aktif-default tidak boleh mengubah sesuatu: ${n}`);
    }
  }

  /*
   * Dan `TOOL_BAWAAN_AKTIF` tetap harus bersih dari web.
   *
   * Ia turunan katalog yang dibaca pemanggil lama, dan pada profil baru yang
   * dianggap "selalu menyala" adalah 43 - empat tambahan itu datang dari sekat,
   * bukan dari katalog. Kalau ada nama web menyusup ke sini, dua sumber itu
   * mulai berbeda diam-diam.
   */
  for (const n of TOOL_BAWAAN_AKTIF) {
    const t = TOOL_BY_NAME.get(n);
    if (t?.source === 'web') masalah.push(`tool web menyala default: ${n}`);
  }

  return masalah;
}

/** Nama 43 tool inti: yang wajib terpasang dan wajib aktif. */
export const TOOL_INTI: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.source !== 'web',
).map((t) => t.name);

/**
 * Tool yang DIKIRIM ke provider setiap permintaan (progressive disclosure).
 *
 * Ini subset kecil dari TOOL_INTI - hanya yang dipakai hampir setiap tugas:
 * membaca/menulis/mengubah berkas, mencari, menjalankan perintah, merencanakan,
 * dan bertanya. Sisanya (web, browser, SSH, MCP, jadwal, catatan, preview, dan
 * tool tulis lain) TIDAK dikirim setiap kali; model menemukannya lewat
 * `tool_search` lalu memanggilnya lewat `tool_call`.
 *
 * Kenapa: mengirim 50+ skema tool setiap permintaan memakan ~22 KB - lebih besar
 * dari seluruh percakapan - dan ukuran itulah yang membuat gateway lambat lalu
 * balas 502. opencode dan Hermes melakukan hal yang sama (kirim inti, sisanya
 * on-demand). Yang penting: tidak ada tool yang HILANG dari model, hanya satu
 * langkah lebih jauh.
 *
 * `tool_call` ada di daftar karena ia jembatannya; `tool_search` juga, supaya
 * model bisa menemukan tool lain kapan saja.
 *
 * Tool web/browser BACA ikut di sini karena prompt me-ROUTE ke sana dengan
 * nama: "buka URL -> browser_open", "baca halaman -> browser_read/web_fetch".
 * Kalau prompt menyebut sebuah tool tapi tool-nya tidak dikirim, model tidak
 * bisa memanggilnya dan jatuh ke bash_run (`start <url>`) - itu yang membuat
 * YouTube terbuka di browser sistem alih-alih pane browser Zephyr. Aturannya:
 * apa pun yang di-route prompt WAJIB ikut dikirim.
 */
export const TOOL_DIKIRIM_SELALU: readonly string[] = [
  'read_file',
  'write_file',
  'edit',
  'multi_edit',
  'replace_in_files',
  'delete_file',
  'list_directory',
  'create_directory',
  'grep',
  'glob',
  'bash_run',
  /*
   * Long-running commands.
   *
   * `bash_run` blocks until the command exits, so a dev server or a watch task
   * either times out or holds the whole agent loop. The background pair is what
   * makes those expressible at all, and an agent that cannot reach it has no way
   * to start something that does not finish — which is a common enough need to
   * justify the cost of two more specs on every request.
   */
  'bash_background',
  'bash_logs',
  'todo_write',
  /*
   * Code intelligence.
   *
   * `lsp_definition` saja yang ikut setiap permintaan.
   *
   * Awalnya kelima `lsp_*` dikirim, dan itu pemborosan yang mahal: skemanya
   * ~500 karakter masing-masing, jadi lima tool itu menambah ~2,5 KB di SETIAP
   * langkah - untuk kemampuan yang jarang dipakai. `lsp_definition` adalah
   * satu-satunya yang benar-benar sulit ditiru: menemukan definisi sebuah simbol
   * tanpa language server berarti menebak nama berkas lalu grep di sana.
   *
   * `lsp_symbols`, `lsp_references`, `lsp_hover`, dan `lsp_diagnostics` tetap
   * TERPASANG dan tetap AKTIF - hanya tidak dikirim setiap kali. Model
   * menemukannya lewat `tool_search` ("cari simbol", "error language server")
   * lalu memanggilnya lewat `tool_call`. Tidak ada yang hilang, hanya satu
   * langkah lebih jauh untuk yang memang jarang dipakai.
   *
   * `grep` dan `glob` tetap selalu dikirim: berkas yang bahasanya tidak punya
   * language server tetap harus bisa dicari.
   */
  'lsp_definition',
  'skill_view',
  'think',
  'ask_user',
  'run_subagent',
  /*
   * The plural form.
   *
   * `run_subagent` takes one prompt; a task that decomposes into several
   * independent parts is the normal case, and hiding the parallel version behind
   * a search means the model runs them one at a time instead — slower and more
   * expensive than the thing the search was saving.
   */
  'run_subagents',
  'tool_search',
  'tool_call',
  /*
   * Browser/web.
   *
   * Empat yang benar-benar dipakai tugas sehari-hari: buka pane, baca isinya,
   * ambil halaman sebagai teks, dan cari di web.
   *
   * Dua yang DILEPAS dari daftar ini:
   *
   *   `browser_nav` - maju/mundur/reload. Semua yang dibutuhkannya bisa
   *     dicapai lewat `browser_open` dengan URL yang dituju; model yang butuh
   *     mundur bisa membuka URL sebelumnya. Skemanya tidak sebanding dengan
   *     frekuensinya.
   *
   *   `web_search` - paling sering menyeret model ke jalan samping. Kalau
   *     halaman bisa dibuka langsung di pane, mencari dulu hanya menambah
   *     langkah; kalau tidak bisa, `web_fetch` dengan URL yang sudah diketahui
   *     lebih langsung.
   *
   * Keduanya tetap terpasang dan tetap aktif, hanya diakses lewat
   * `tool_search` -> `tool_call`.
   */
  'browser_open',
  'browser_read',
  'web_fetch',
];

/** Rincian per kelompok, untuk picker. */
export function kelompokKatalog(): Array<{ group: string; source: ToolSource; names: string[] }> {
  const peta = new Map<string, { group: string; source: ToolSource; names: string[] }>();
  for (const t of TOOL_CATALOG) {
    /* Sumber ikut jadi kunci: kelompok Network ada di dua sumber berbeda,
       dan keduanya harus tampil di bagian yang benar. */
    const kunci = `${t.source}:${t.group}`;
    let k = peta.get(kunci);
    if (!k) {
      k = { group: t.group, source: t.source, names: [] };
      peta.set(kunci, k);
    }
    k.names.push(t.name);
  }
  return [...peta.values()];
}
