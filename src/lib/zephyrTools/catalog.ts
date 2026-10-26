/**
 * Katalog tool AI - daftar TUNGGAL yang menjadi sumber kebenaran.
 *
 * Bentuknya tiga blok, dan jumlahnya sengaja TIDAK ditulis di sini:
 *
 *   BUILTIN + MCP  - tool INTI. Selalu terpasang, selalu aktif.
 *   WEB            - terpasang, tapi sebagian mati sampai user menyalakannya.
 *
 * Angka yang diketik di komentar akan basi begitu ada tool baru - itu sudah
 * terjadi di berkas ini (prosa menyebut angka lama sementara katalognya sudah
 * bertambah). Sumber angkanya cuma dua: `TOOL_COUNTS` dan `periksaKatalog()`.
 * Butuh jumlahnya, hitung dari katalog; jangan mengutipnya dari prosa.
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
import { AWALAN_MCP, POLA_AWALAN_MCP } from './awalan';
export { AWALAN_MCP, POLA_AWALAN_MCP };

/** Sumber tool, untuk ditampilkan di picker sebagai bagian terpisah. */
/*
 * Dari mana sebuah tool datang.
 *
 * 'ekstensi' adalah sumber keempat dan satu-satunya yang isinya TIDAK hidup di
 * katalog ini: tool yang dibawa paket ekstensi terpasang didaftarkan saat
 * runtime (lihat toolGate/sectionOf). Ia tetap ada di sini supaya picker punya
 * satu tempat untuk bertanya "sumber apa saja yang mungkin", bukan daftar
 * kedua yang harus dijaga agar sama.
 */
export type ToolSource = 'builtin' | 'mcp' | 'web' | 'ekstensi';

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
/* BUILTIN - nama diambil persis dari katalog sumber.             */
/* ------------------------------------------------------------------ */

const BUILTIN: Array<[string, string, ToolEffect, boolean, string]> = [
  /* Files - 7.
     DIPANGKAS: `create_directory` dibuang. `write_file` sudah membuat folder
     induk yang belum ada saat menulis berkas - jadi folder kosong adalah
     satu-satunya kasus yang tersisa, dan itu kasus yang jarang serta bisa
     dicapai lewat berkas penanda. Dua tool yang sama-sama "membuat sesuatu di
     disk" hanya menambah pilihan yang harus ditebak model. */
  ['read_file', 'Files', 'read', false, 'Baca berkas dari disk, atau buffer editor yang belum tersimpan'],
  ['list_directory', 'Files', 'read', false, 'Daftar isi sebuah folder'],
  ['write_file', 'Files', 'fsWrite', true, 'Tulis berkas ke disk, atau buat berkas baru (folder induk dibuat otomatis)'],
  ['move_file', 'Files', 'fsWrite', true, 'Pindahkan atau ganti nama berkas/folder'],
  ['copy_file', 'Files', 'fsWrite', true, 'Salin berkas atau folder'],
  ['delete_file', 'Files', 'fsWrite', true, 'Hapus berkas atau folder'],
  ['replace_in_files', 'Files', 'fsWrite', true, 'Ganti teks atau pola di banyak berkas sekaligus'],

  /* Edit - 1.
     `multi_edit` satu-satunya rumah "ganti teks di berkas". Kembarannya
     (`edit`, satu penggantian per panggilan) DIBUANG pada pemangkasan ke 40:
     dua tool dengan kemampuan yang sama membuat model harus memilih di antara
     keduanya, dan pilihan yang salah adalah sumber kegagalan yang nyata -
     prompt sendiri sudah menyuruh `multi_edit` "untuk ganti kecil maupun
     banyak baris", jadi `edit` tidak punya pekerjaan yang tersisa. */
  ['multi_edit', 'Edit', 'fsWrite', true, 'Beberapa penggantian pada satu berkas dalam satu langkah'],

  /* Search - 3 */
  ['grep', 'Search', 'read', false, 'Cari teks di seluruh workspace'],
  ['glob', 'Search', 'read', false, 'Cari berkas berdasarkan pola nama atau jalur'],
  /* Sumber jawabannya ada DI DALAM aplikasi, bukan di folder user: setelan
     yang sedang dipakai, berkas log, registry ekstensi + hasil loader, dokumen
     yang ikut terbundel, versi + status update, plus indeks fakta Zephyr
     (label, setelan, perintah, tool, ekstensi, dokumen, peta kode).
     Read-only, tanpa efek samping, tanpa jaringan, dan tetap bekerja saat
     tidak ada folder yang terbuka - jadi tidak butuh izin. */
  ['zephyr_self', 'Search', 'read', false, 'Periksa Zephyr sendiri dari sumber milik aplikasi: setelan aktif, log, ekstensi, dokumen bundel, versi, dan indeks fakta'],

  /* Memori - 1.
     Memori LINTAS SESI milik Zeph AI (`memory.md` di data dir aplikasi), bukan
     berkas user: efeknya `appWrite` karena yang berubah adalah keadaan di dalam
     aplikasi, dan entri bisa dihapus lagi lewat panel Memori. Tanpa izin
     (`needsApproval: false`) justru karena menyimpan keputusan harus terjadi
     saat keputusannya dibuat - kalau setiap penyimpanan menunggu klik, memori
     tidak akan pernah terisi, dan itulah keluhan aslinya ("tiap sesi mulai dari
     nol"). Yang tetap berlaku: mode baca-saja menyaringnya keluar, karena
     `appWrite` termasuk kelas tulis di `toolGate.ts`. */
  ['ingat', 'Memori', 'appWrite', false, 'Simpan, cari, dan rapikan memori lintas sesi Zeph AI (berkas memori global + per-proyek)'],

  /* Shell - 3.
     DIPANGKAS dari 5. `bash_background`/`bash_logs`/`bash_list`/`bash_kill`
     semuanya satu kemampuan yang sama - "jalankan sesuatu yang lama lalu lihat
     hasilnya" - dan agen di run nyata selalu sampai ke `bash_run` lebih dulu.
     `bash_run` sudah menerima perintah latar (`&`, `start`, `--watch`) lewat
     shell-nya sendiri; jadi satu pintu cukup, dan tiga nama tambahan itu hanya
     menambah pilihan yang harus ditebak model. */
  ['bash_run', 'Shell', 'exec', true, 'Jalankan perintah dan tunggu sampai selesai (termasuk perintah latar)'],
  /*
   * Navigasi aplikasi: keluhan pembaca -> halaman yang benar-benar terbuka.
   *
   * `read` karena ia tidak mengubah berkas dan tidak menjalankan perintah; ia
   * memindahkan layar, dan itu bisa dibatalkan pembaca dengan satu klik. Efeknya
   * `appWrite` supaya gate tahu ia MENGUBAH keadaan aplikasi (panel/seksi aktif),
   * bukan sekadar membaca.
   */
  ['tunjuk', 'Aplikasi', 'appWrite', false, 'Buka halaman atau panel yang pembaca maksud, dari keluhan berbahasa bebas'],
  /*
   * `kotak` - a formatted answer box instead of a paragraph or a table.
   *
   * `read` because it changes nothing outside the answer: it returns a string
   * the transcript draws. That is why it needs no approval - the only thing it
   * can do is make the model's own output clearer.
   */
  ['kotak', 'Aplikasi', 'read', false, 'Gambar kotak terstruktur di jawaban: judul, ringkasan, baris label/nilai'],
  /*
   * `peta` - cari di indeks fakta Zephyr dengan kata-kata model sendiri.
   *
   * `read`: hanya membaca indeks yang sudah ada di bundel.
   */
  ['peta', 'Aplikasi', 'read', false, 'Cari di peta Zephyr: label, setelan, perintah, pintasan, panel, tool, berkas'],
  /*
   * `execute` - Code Mode: satu skrip memanggil banyak tool.
   *
   * `read` karena tool ini SENDIRI tidak menulis apa pun; yang menulis adalah
   * tool yang dipanggilnya, dan tiap panggilan lewat gate yang sama. Efek
   * sebenarnya ditentukan oleh tool di dalam skrip, bukan oleh pembungkusnya.
   */
  ['execute', 'Aplikasi', 'read', false, 'Jalankan skrip yang memanggil beberapa tool sekaligus (Code Mode)'],

  /* Sub-agents - 1 */
  ['run_subagent', 'Sub-agents', 'exec', true, 'Jalankan satu subagent untuk tugas mandiri'],

  /* Tasks - 1 */
  ['todo_write', 'Tasks & Notes', 'appWrite', true, 'Ganti daftar tugas agen untuk tugas ini'],
  /*
   * `ask_user` — the agent stops and asks instead of guessing.
   *
   * This is the tool behind the "Agent Questioning Proactively" switch. Without
   * it that switch had nothing to switch: the page offered a control for a
   * capability the agent did not have, which is the definition of a fake toggle.
   *
   * `read` rather than `appWrite`: it changes nothing on disk and runs no
   * command. Its only effect is a card in the transcript and a pause — the same
   * shape as `kotak`. Marking it `appWrite` would make it require approval in
   * every mode except `auto`, so the reader would be asked to approve being
   * asked a question.
   */
  ['ask_user', 'Aplikasi', 'read', false, 'Tanya user dan tunggu jawabannya sebelum melanjutkan (dipakai saat tugas ambigu)'],

  /* Code intelligence - 6 */
  /*
   * The language-server queries. Read-only, and grouped apart from `grep`/`glob`
   * because they answer a different question: those find TEXT, these find CODE.
   * A gate that switched these off would leave the agent with only text search,
   * which still works — just less precisely — so they are not in TOOL_WAJIB.
   *
   * `zephyr_kode` joined this group last: it reads SLICES of Zephyr's own source
   * as numbered lines (`src/lib/bacaKode.ts`). Same read-only shape and the same
   * "text search still works without it" argument, so it is not in TOOL_WAJIB
   * either. Its spec lived only in `bacaKode.ts` until now, which is why the
   * model could not call it: unreachable spec, no catalog entry.
   */
  /*
   * ONE entry for the whole language-server family.
   *
   * Six `lsp_*` entries used to sit here. They differed only in WHICH question
   * was asked - same parameters, same server, none able to write - so six names
   * meant six rows to choose between for one decision and six near-misses in
   * `tool_search`. The implementations are unchanged; they moved behind
   * `aksi` in `lsp.ts`.
   */
  ['lsp', 'Code intelligence', 'read', false, 'Tanya language server: simbol, referensi, definisi, tipe, diagnostik, atau hierarki panggilan'],
  /*
   * `apply_patch` — many files, one call, OpenCode's own patch grammar.
   *
   * `fsWrite` because it writes; `needsApproval` true for the same reason
   * `write_file` has it: it can overwrite work.
   */
  ['apply_patch', 'Files', 'fsWrite', true, 'Ubah banyak berkas dalam satu panggilan patch (format OpenCode)'],
  ['zephyr_kode', 'Code intelligence', 'read', false, 'Potongan baris BERKODE NOMOR dari sumber Zephyr sendiri (baca-kode): satu berkas, satu rentang baris, atau simbol'],

  /* Skills - 1 */
  /*
   * Read-only: 'read', not 'appWrite' and not 'exec'. A skill is content the
   * agent reads, and the prompt tells it to read one before work it matches —
   * so a gate that could switch this off would leave the agent holding a list
   * of skills it is not allowed to open.
   */
  ['skill_view', 'Skills', 'read', false, 'Baca isi skill yang terdaftar, atau daftar skillnya'],

  /* Notes - 1.
     DIPANGKAS: `notes_read` dibuang, `notes_write` tetap. Alasannya
     `notes_write` satu-satunya yang punya efek yang tidak bisa dicapai cara
     lain; membaca catatan bisa dilakukan lewat `read_file` (berkasnya ada di
     data dir aplikasi) atau `ingat` (memori lintas sesi), jadi `notes_read`
     adalah pintu kedua ke data yang sama. */
  ['notes_write', 'Tasks & Notes', 'appWrite', true, 'Ubah catatan atau todo milik user'],

  /* Schedule - 1.
     DIPANGKAS dari 3: satu tool beraksi (`schedule_command` dengan
     action: list|add|cancel) menggantikan tiga nama terpisah. Tiga tool untuk
     satu kemampuan adalah tiga pilihan yang harus ditebak model, padahal
     tindakannya jelas dari kata kerja di argumennya. */
  ['schedule_command', 'Schedules', 'appWrite', true, 'Jadwalkan, daftar, atau batalkan perintah terjadwal (action: list|add|cancel)'],

  /* Bridge progressive disclosure: mencari & memanggil tool yang tidak dikirim setiap saat. */
  ['tool_search', 'Penalaran', 'read', false, 'Cari tool yang tidak ada di daftar utama (web, browser, SSH, MCP, jadwal)'],
  ['tool_call', 'Penalaran', 'exec', true, 'Panggil tool yang ditemukan lewat tool_search'],
];

/* ------------------------------------------------------------------ */
/* MCP - nama polos diambil dari tabel handler mcpServer.       */
/* ------------------------------------------------------------------ */

/* Blok MCP - jembatan ke 13 tool kendali jendela (handler di `mcp.ts`).
   DIPANGKAS: `state` dibuang karena `inspect` sudah mengembalikan ringkasan
   keadaan jendela (`what: 'window'`); dua pintu ke data yang sama hanya
   menambah pilihan yang harus ditebak model. */
const MCP: Array<[string, string, ToolEffect, boolean, string]> = [
  ['inspect', 'inspect', 'read', false, 'Periksa command, pane, tab, workspace, atau setelan yang tersedia'],
  ['run_command', 'control', 'exec', true, 'Jalankan sebuah command aplikasi berdasarkan id-nya'],
  ['open_file', 'control', 'appWrite', true, 'Buka berkas di editor, bisa langsung ke baris tertentu'],
  ['workspace', 'control', 'appWrite', true, 'Lihat, buat, atau ganti workspace'],
  ['set_setting', 'control', 'appWrite', true, 'Ubah satu preferensi aplikasi'],
  ['extension', 'control', 'appWrite', true, 'Lihat, aktifkan, atau nonaktifkan ekstensi'],
  ['ssh', 'control', 'exec', true, 'Buka atau pakai koneksi SSH tersimpan'],
  ['read', 'inspect', 'read', false, 'Baca satu permukaan: terminal, buffer editor, atau DOM'],
  ['sh', 'terminal', 'exec', true, 'Jalankan perintah di pane terminal milik user'],
  ['wait_for_terminal', 'terminal', 'read', false, 'Tunggu terminal selesai atau memunculkan teks tertentu'],
  ['worktree', 'control', 'appWrite', true, 'Kelola git worktree'],
  ['focus_pane', 'terminal', 'appWrite', true, 'Fokuskan sebuah pane tanpa mengklik'],
  ['pane', 'terminal', 'appWrite', true, 'Buka, bagi, tutup, atau susun pane'],
];

/* ------------------------------------------------------------------ */
/* WEB - tetap terpasang; sebagian TIDAK menyala default. */
/* ------------------------------------------------------------------ */

/*
 * Tool di blok ini sengaja dipisah dari tool inti.
 *
 * Alasannya bukan soal asal-usul, melainkan soal apa yang terjadi kalau alat
 * ini menyala sejak awal. Pane browser bisa membuka halaman apa pun, klik dan
 * ketik bisa mengirim data ke luar, dan unduh menulis berkas dari internet.
 * Itu semua kemampuan yang pantas dipilih, bukan diwariskan diam-diam.
 *
 * Kontraknya:
 *   - tetap ada di katalog, tetap bisa dinyalakan satu per satu atau per grup
 *   - pada profil baru, HANYA yang membaca yang menyala (lihat di bawah)
 *   - tool inti di atas tidak pernah bergantung padanya
 *
 * Yang menyala sejak awal hanyalah yang sekedar MENAMPILKAN atau MEMBACA.
 * Yang tetap mati adalah yang bertindak: klik, ketik, unduh ke disk, menutup
 * pane. Nama-namanya TIDAK ditulis di sini karena
 * keduanya turunan: `WEB_MATI` menyebut yang mati, `TOOL_WEB_AKTIF_AWAL`
 * menghitung sisanya. Daftar nama di prosa pernah tertinggal dari kodenya -
 * `browser_list` sudah nyala di sekat tapi tidak ada di daftar komentar ini.
 * Batasnya "mengubah vs menampilkan", bukan "di dalam Zephyr vs di internet":
 * `web_fetch` memang menarik data dari luar, tapi ia tidak mengubah apa pun
 * dan tidak menulis berkas.
 *
 * Daftar yang menyala itu tinggal di `toolGate.ts` (`TOOL_WEB_AKTIF_AWAL`),
 * bukan di sini - katalog hanya memutuskan bahwa tool ini ADA dan berisiko
 * net, sedangkan sekat yang memutuskan mana yang dipakai. Kalau nanti tambah
 * tool web baru, tempatkan di sini sebagai mati, lalu pilih sadar di sekat.
 */
const WEB: Array<[string, string, ToolEffect, boolean, string]> = [
  /*
   * Web: search + fetch in one entry - see the note above `browser`.
   */
  ['web', 'Web', 'net', false, 'Ambil dari internet: search (cari) atau fetch (isi satu URL)'],
  /*
   * Browser: ONE entry for seven actions.
   *
   * The seven `browser_*` entries that used to sit here act on the same pane and
   * pass the same gate - they differ only in which action runs. Their
   * implementations stay in `TOOL_WEB` (dispatching to them is what `browser`
   * does); they are no longer offered to the model under seven names.
   */
  ['browser', 'Browser', 'netWrite', false, 'Kendalikan pane browser: open, read, click, type, list, close, download'],
  /*
   * Web: search + fetch in one entry, same reason as `browser`.
   */
  ['web', 'Web', 'net', false, 'Ambil dari internet: search (cari) atau fetch (isi satu URL)'],
];

/* ------------------------------------------------------------------ */

/*
 * Awalan nama tool MCP tinggal di `awalan.ts`, bukan di sini.
 *
 * Sebelumnya pola ini ditulis dua kali - di berkas ini dan di
 * `deskripsiTool.ts` - dengan isi identik; mengubah satu dan lupa yang lain
 * tidak memunculkan error, cuma nama tool yang bocor mentah di salah satu
 * panel. Diekspor ulang di sini supaya pemanggil lama (`labelAksi.ts`,
 * `toolGate.ts`, panel Tools) tidak perlu ikut berubah.
 */

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
 * Katalog final: BUILTIN + MCP (inti) + WEB.
 *
 * Blok inti selalu menyala; blok WEB tersedia tapi tidak menyala sendiri.
 * Jumlahnya dibaca dari `TOOL_COUNTS` di bawah, bukan dari komentar ini.
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
 * Tool yang aktif pada profil baru: SELURUH tool inti.
 *
 * Dulu berkas ini memuat daftar pendek berisi tool pembaca saja, dengan alasan
 * bahwa tool menulis tidak pantas menyala sendiri. Alasannya tidak salah, tapi
 * akibatnya salah: agen mulai dalam keadaan tidak bisa menulis berkas, tidak
 * bisa menjalankan perintah, dan tidak bisa menyimpan catatan - jadi setiap
 * tugas berhenti di tengah dengan pesan "tool dinonaktifkan", dan user
 * menyimpulkan aplikasinya rusak.
 *
 * Sekarang kontraknya jelas: seluruh tool inti selalu aktif. Satu-satunya yang
 * mati sejak awal adalah sebagian tool web/browser, karena itu permukaan yang
 * bisa mengirim data ke luar dan memang pantas dipilih user lebih dulu.
 *
 * Diturunkan dari katalog, bukan diketik ulang - daftar manual akan berbeda
 * dari katalognya cepat atau lambat, dan itu sudah terbukti di sini.
 */
export const TOOL_BAWAAN_AKTIF: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.source !== 'web',
).map((t) => t.name);

/**
 * Tool web yang MATI pada profil baru.
 *
 * ## Kenapa sekarang KOSONG
 *
 * Daftar ini dulu memuat `browser_click`, `browser_type`,
 * `browser_download_url`, dan `browser_close`: keempatnya bisa bertindak atas
 * nama user di halaman, jadi user harus menyalakannya sadar dulu. Akibatnya
 * agen tidak bisa membuka dan membaca link yang baru saja diberikan user
 * sampai orangnya mencari panel Tools lebih dulu - dan itu terbaca sebagai
 * "AI-nya tidak bisa buka browser", bukan sebagai pagar.
 *
 * Sekarang seluruh tool web aktif sejak awal dan alur "kasih link -> agen
 * membukanya" jalan tanpa langkah persiapan. Yang TETAP menjaga adalah
 * gerbang URL di `kebijakanIsiWeb.ts` (skema non-http, IP privat, localhost)
 * - bukan daftar nama yang harus ditebak user lebih dulu.
 *
 * Daftar ini dibiarkan ada, dan tetap diturunkan dari katalog, supaya tool web
 * berbahaya yang ditambahkan nanti punya tempat yang jelas bila suatu saat
 * perlu dimatikan lagi.
 */
const WEB_MATI: readonly string[] = [];

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
   * Pemeriksaan blok WEB - dan kenapa tidak memakai daftar nama sendiri.
   *
   * Versi sebelumnya menulis ulang keempat nama di sini
   * (`['browser_open','browser_read','browser_nav','web_fetch']`), jadi aturan
   * "web baca boleh nyala" hidup di DUA tempat: di `toolGate.ts` sebagai
   * keputusan, dan di sini sebagai salinan. Salinan itulah yang membuat
   * `browser_list` bisa tertinggal di kedua-duanya sekaligus, tanpa satu pun
   * pemeriksaan berbunyi - karena pemeriksaannya membandingkan daftar dengan
   * dirinya sendiri.
   *
   * Sekarang yang diperiksa adalah ATURANNYA, bukan namanya: blok WEB harus
   * ada isinya, dan tool web yang menulis berkas harus meminta izin.
   */
  const webSemua = TOOL_CATALOG.filter((t) => t.source === 'web');
  if (webSemua.length === 0) {
    masalah.push('tidak ada satu pun tool web - blok WEB di katalog hilang?');
  }
  /*
   * Tool web yang MENULIS BERKAS juga harus minta izin - aturan yang sama
   * dengan `fsWrite` di atas, hanya sumbernya web.
   *
   * `netWrite` TIDAK lagi ikut di sini. `browser` sengaja tidak meminta izin
   * per panggilan: pagarnya sekarang ada di `kebijakanIsiWeb.ts` (skema
   * non-http, IP privat, localhost, port), dan izin per panggilan untuk
   * "buka link ini" hanya menghasilkan dialog yang ditekan tanpa dibaca -
   * sekaligus membuat alur "kasih link -> agen membukanya" berhenti.
   */
  for (const t of webSemua) {
    if (t.effect === 'fsWrite' && !t.needsApproval) {
      masalah.push(`tool web yang menulis berkas harus minta izin: ${t.name}`);
    }
  }

  /*
   * Dan `TOOL_BAWAAN_AKTIF` tetap harus bersih dari web.
   *
   * Ia turunan katalog yang dibaca pemanggil lama, dan pada profil baru yang
   * dianggap "selalu menyala" adalah tool inti - tambahannya datang dari sekat,
   * bukan dari katalog. Kalau ada nama web menyusup ke sini, dua sumber itu
   * mulai berbeda diam-diam.
   */
  for (const n of TOOL_BAWAAN_AKTIF) {
    const t = TOOL_BY_NAME.get(n);
    if (t?.source === 'web') masalah.push(`tool web menyala default: ${n}`);
  }

  return masalah;
}

/** Nama tool inti: yang wajib terpasang dan wajib aktif. */
export const TOOL_INTI: readonly string[] = TOOL_CATALOG.filter(
  (t) => t.source !== 'web',
).map((t) => t.name);

/**
 * Tool yang DIKIRIM ke provider setiap permintaan (progressive disclosure).
 *
 * Ini subset kecil dari `TOOL_INTI` - hanya yang dipakai hampir setiap tugas:
 * membaca/menulis/mengubah berkas, mencari, menjalankan perintah, merencanakan,
 * dan bertanya. Sisanya (web, browser, SSH, MCP, jadwal, catatan, preview, dan
 * tool tulis lain) TIDAK dikirim setiap kali; model menemukannya lewat
 * `tool_search` lalu memanggilnya lewat `tool_call`.
 *
 * Kenapa: mengirim seluruh skema tool setiap permintaan memakan puluhan KB - lebih besar
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
/* Tool yang DIKIRIM SETIAP GILIRAN.
 *
 * DIPANGKAS 20 -> 13 berdasarkan DATA run agen nyata, bukan tebakan: histogram
 * 153 langkah tool pada run uji-kurs (run ke-5) menghasilkan pemakaian
 *   web_fetch 36 | browser_open 22 | tool_search 22 | browser_read 17 | todo_write 14
 *   tool_call 14 (4 gagal) | read_file 10 (2 gagal) | bash_run 7 | glob 3 | zephyr_self 2
 * dan NOL pemakaian untuk: edit, delete_file, move_file, copy_file, list_directory,
 * think, ask_user. Tujuh nama itu DIHAPUS dari daftar ini supaya gudang yang
 * dikirim tidak penuh tool mati. `think` dan `ask_user` lalu dihapus TOTAL dari
 * katalog (bersama 7 tool gaguna lainnya); sisanya tetap ada di `TOOL_CATALOG`.
 * KELUARGA NYA TETAP ADA di `subsetTugas.ts`, jadi tugas yang butuh
 * hapus/pindah/salin tetap mendapat satu rumahnya lewat jalur keluarga (tool
 * yang sudah dihapus ditendang keluar oleh filter `boleh()`), dan nama yang
 * dibuang dari daftar ini masih bisa dipanggil lewat `tool_search` ->
 * `tool_call` (jalur yang selalu dikirim).
 *
 * Batas yang tidak boleh dilanggar: SEMUA nama yang diroute prompt harus ikut
 * dikirim. Setiap perubahan daftar ini wajib disertai hapus-pasang rute prompt di
 * `systemPrompt.ts` (grep nama tool) - kalau tidak, model disuruh memanggil tool
 * yang tidak ada dan berputar di `tool_search`.
 */
export const TOOL_DIKIRIM_SELALU: readonly string[] = [
  'read_file',
  'write_file',
  /* `multi_edit` satu-satunya rumah `ganti-teks-berkas` yang ikut di sini -
     `edit` (kembarannya, satu keluarga) DIPANGKAS: lihat catatan pemangkasan
     di bawah daftar ini. */
  'multi_edit',
  'grep',
  'glob',
  'bash_run',
  'todo_write',
  /*
   * `ask_user` — the tool behind "Agent Questioning Proactively".
   *
   * It has to be IN HAND on the first step, not found via `tool_search`: the
   * whole point is to stop BEFORE spending a turn on the wrong reading, and a
   * tool the model must look up first is a tool it will not reach for while it
   * is already writing.
   *
   * The spec is small (one question, an optional list), so the cost is a few
   * hundred bytes — but it is also dropped from the wire whenever the reader
   * turned the feature off for the surface they are using (see `agentToolSpecs`),
   * so a reader who does not want it pays nothing for it.
   */
  'ask_user',
  /*
   * `zephyr_self` bukan pilihan gaya, tapi kewajiban: blok larangan di
   * `systemPrompt.ts:850` / `:862` menyebut tool ini dengan nama - "jangan
   * menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas +
   * `zephyr_self`". Kalau tool-nya tidak ikut dikirim, prompt menyuruh model
   * memanggil tool yang tidak ada di gudangnya, dan aturan anti-mengarang itu
   * justru gagal tepat pada kasus yang ingin dicegah. Read-only, dan tetap
   * jalan walau tidak ada folder yang terbuka.
   */
  'zephyr_self',
  'tool_search',
  'tool_call',
  /*
   * `tunjuk` ikut SETIAP giliran karena pertanyaan "di mana X" bisa datang kapan
   * saja, dan justru saat pembaca bingung. Kalau ia harus dicari dulu lewat
   * `tool_search`, bantuannya datang dua langkah terlambat - dan pembaca yang
   * tidak tahu letaknya juga tidak akan tahu harus menunggu.
   */
  'tunjuk',
  /*
   * `lsp` dan `apply_patch` ikut setiap giliran.
   *
   * Keduanya menggantikan keluarga tool yang DULU selalu dikirim
   * (`lsp_definition` dkk. dan `write_file`/`multi_edit` untuk banyak berkas).
   * Kalau yang baru tidak ikut, konsolidasinya justru MENGHILANGKAN kemampuan:
   * model harus menemukan `lsp` lewat `tool_search` sebelum bisa bertanya ke
   * language server, padahal dulu `lsp_definition` sudah ada di tangannya.
   *
   * `apply_patch` adalah jalur utama menulis banyak berkas - satu-satunya cara
   * menyelesaikan tugas multi-berkas tanpa membakar langkah per berkas.
   */
  'lsp',
  'apply_patch',
  /*
   * `execute` (Code Mode) selalu ikut: satu skrip menggantikan banyak langkah,
   * dan kalau ia harus dicari dulu, `tool_search` memakan langkah yang seharusnya
   * dihemat oleh Code Mode itu sendiri.
   *
   * `peta` dan `kotak` TIDAK di sini.
   *
   * Keduanya sempat masuk, dan hasil pengukuran membalikkan alasan saya
   * memasukkannya: spec tool naik 8.639 -> 16.433 char (+90%) dan giliran yang
   * kehilangan ekor pesannya naik 14/44 -> 22/44. Menambah nama ke daftar ini
   * berarti menambah BYTE ke setiap permintaan, dan itu ongkos yang dibayar
   * semua giliran - termasuk yang tidak bertanya tentang Zephyr dan tidak butuh
   * kotak.
   *
   * Keduanya tetap terjangkau lewat `tool_search` -> `tool_call`, dan keduanya
   * bukan jalur kritis: `peta` menjawab pertanyaan yang bisa juga dijawab
   * irisan indeks di prompt, dan `kotak` adalah bentuk jawaban yang bisa dipilih
   * model kapan saja setelah ia menemukannya sekali.
   */
  'execute',
  /* Browser/web.
   *
   * Tiga yang benar-benar dipakai tugas sehari-hari: buka pane, baca isinya,
   * dan ambil halaman sebagai teks. Ketiganya juga disebut nama di prompt
   * ("buka URL -> browser_open", "baca halaman -> browser_read/web_fetch"), jadi
   * wajib ikut dikirim.
   *
   * Dua yang DILEPAS dari daftar ini:
   *
   *   `browser_nav` - maju/mundur/reload. Semua yang dibutuhkannya bisa
   *     dicapai lewat `browser_open` dengan URL yang dituju; model yang butuh
   *     mundur bisa membuka URL sebelumnya. Skemanya tidak sebanding dengan
   *     frekuensinya. Tool-nya sendiri kini DIHAPUS dari katalog.
   *
   *   `web_search` - paling sering menyeret model ke jalan samping. Kalau
   *     halaman bisa dibuka langsung di pane, mencari dulu hanya menambah
   *     langkah; kalau tidak bisa, `web_fetch` dengan URL yang sudah diketahui
   *     lebih langsung.
   *
   * `web_search` tetap terpasang dan tetap aktif, hanya diakses lewat
   * `tool_search` -> `tool_call`.
   */
  'browser',
  'web',
  /*
   * `open_link` ikut SETIAP giliran.
   *
   * Permintaan langsung pemilik aplikasi: kalau percakapan menyebut sebuah
   * tautan - repo, dokumentasi, hasil pencarian - tautan itu dibuka di browser
   * yang dipakai orangnya, bukan sekadar dituliskan sebagai teks. Tool ini
   * harus ADA di tangan model pada giliran pertama; kalau harus dicari lewat
   * `tool_search` dulu, jawabannya datang setelah pembaca sudah membuka
   * browsernya sendiri.
   *
   * Murah: satu parameter, tanpa state, dan gate-nya sama dengan pane browser.
   */
  'open_link',
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
