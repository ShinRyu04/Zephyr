/**
 * Tool bawaan - implementasi untuk 40 nama pertama di katalog.
 *
 * ## Kenapa berkas ini ada
 *
 * Registry tool sebelumnya tumbuh satu tool demi satu, dan nama-namanya
 * mengikuti kebiasaan orang yang menambahkannya: `file_read` di sebelah
 * `editor_read`, `shell_exec` di sebelah `terminal_exec`, `file_edit` di
 * sebelah `file_patch`. Yang menanggung akibatnya adalah model: dengan dua nama
 * untuk satu pekerjaan, ia harus menebak - dan tebakannya berubah-ubah antar
 * panggilan.
 *
 * Berkas ini menulis ulang kumpulan itu dengan satu nama per pekerjaan, dan
 * nama itu diambil dari sumber yang sama dengan katalog. Jadi daftar tool,
 * izin, dan implementasinya tidak bisa lagi berbeda pendapat.
 *
 * ## Yang sengaja TIDAK berubah
 *
 * Perilaku. Setiap handler memakai fungsi, command Rust, dan store yang SAMA
 * dengan handler lama yang digantikannya. Yang berubah hanya nama dan jalan
 * masuknya. Menulis ulang logikanya akan berarti menguji ulang semuanya dari
 * nol, dan risikonya tidak dibayar oleh apa pun.
 *
 * ## Catatan penamaan yang menipu
 *
 * Dua command Rust bernama lebih sempit daripada yang sebenarnya:
 *
 *   `agent_exec`    menjalankan perintah di SHELL milik user, bukan di agen
 *                   terpisah. Karena itu keluarannya bisa memuat apa pun yang
 *                   ada di sesi itu.
 *   `search_replace` mengganti di dalam daftar berkas yang DIKIRIM, bukan
 *                   menyisir seluruh workspace sendiri.
 *
 * Keduanya dipakai apa adanya, tapi perilakunya disebut di sini supaya tidak
 * ada yang menebak dari namanya.
 *
 * ## Batas yang dipegang semua handler
 *
 * - Operasi tulis hanya boleh di dalam workspace. Penolakannya ada di sisi
 *   Rust, bukan di berkas ini: berkas ini bisa dilewati, command Rust tidak.
 * - Tidak ada handler yang mencetak API key atau token.
 * - Hasil panjang dipotong, dan pemotongannya DIKATAKAN. Pemotongan diam
 *   membuat model menghitung berkas dari baris yang dia lihat, lalu menyimpulkan
 *   isi yang salah dengan yakin.
 */
import { useStore } from '../store';
import { useAi, MAX_TODOS, todoTerpangkas } from '../aiStore';
import * as cmd from '../commands';
import type { AgentTool } from '../agentTools';
import type { SearchOpts } from '../types';
import { periksaBaca, periksaTulis, periksaPerintahShell } from '../agentGuard';
import { kutipUrlDiPerintah } from '../kutipPerintah';
/*
 * `zephyr_self` membaca indeks fakta yang dibundel bersama aplikasi (ratusan
 * kilobyte). Import-nya HANYA tipe: yang nyata dimuat di dalam badan tool,
 * dengan alasan yang sama seperti helper LSP di bawah - daftar tool ini
 * dievaluasi saat aplikasi menyal, dan indeks berisi ribuan entri yang tidak
 * ada gunanya di jalur boot.
 */
import type { FaktaKategori } from '../zephyrCari';

/*
 * The LSP helpers are imported lazily inside the tool bodies rather than here.
 * `agentLsp` pulls in `lspStore`, which pulls in the editor's language-client
 * plumbing — and `agentTools` is evaluated during startup, before the editor is
 * mounted. A top-level import would put that whole chain on the boot path for
 * tools an agent may never call.
 */
const lspSymbols = async (path: string) => (await import('../agentLsp')).lspDocumentSymbolsTool(path);
const lspRefs = async (path: string, pos: { line: number; column: number }, dekl: boolean) =>
  (await import('../agentLsp')).lspReferencesTool(path, pos, dekl);
const lspDef = async (path: string, pos: { line: number; column: number }) =>
  (await import('../agentLsp')).lspDefinitionTool(path, pos);
const lspHover = async (path: string, pos: { line: number; column: number }) =>
  (await import('../agentLsp')).lspHoverTool(path, pos);
const lspDiagnostics = async (path: string) => (await import('../agentLsp')).lspDiagnosticsTool(path);
const lspCallHierarchy = async (path: string, pos: { line: number; column: number }) =>
  (await import('../agentLsp')).lspCallHierarchyTool(path, pos);

/** Tolak jalur rahasia/terproteksi sebelum tool menyentuhnya. */
function jagaBaca(...paths: string[]): void {
  for (const p of paths) {
    const r = periksaBaca(p);
    if (!r.ok) throw new Error(`ERROR: ${r.alasan}`);
  }
}

/** Sama seperti jagaBaca, plus larangan direktori sistem untuk tulis. */
function jagaTulis(...paths: string[]): void {
  for (const p of paths) {
    const r = periksaTulis(p);
    if (!r.ok) throw new Error(`ERROR: ${r.alasan}`);
  }
}

/* ------------------------------------------------------------------ */
/* Batas dan pemotongan                                               */
/* ------------------------------------------------------------------ */

/** Batas keluaran yang dikembalikan ke model. */
export const BATAS_HASIL = 40 * 1024;

/** Jumlah baris yang didaftar dari satu direktori. */
export const BATAS_DAFTAR = 300;

/**
 * Potong keluaran yang kepanjangan, dan KATAKAN bahwa ia dipotong.
 *
 * Versi pertama fungsi ini hanya memotong, diam-diam. Model lalu membaca daftar
 * yang terpotong sebagai daftar yang lengkap. Menyebutkan berapa yang
 * disembunyikan membuat kesimpulan seperti itu tidak mungkin lagi.
 *
 * Sejak itu ada perbaikan kedua yang sama pentingnya: EKORNYA ikut disimpan.
 * Memotong kepala saja membuang kesimpulan setiap keluaran berbentuk log -
 * `error: could not compile`, baris `N failed`, jejak tumpukan - dan justru
 * itulah bagian yang dicari model. Yang dibuang sekarang adalah TENGAHNYA,
 * bagian yang paling sedikit memberi informasi pada log build dan pada
 * pembacaan berkas yang panjang.
 */
export const POTONG_EKOR_RASIO = 0.4;

export function potong(teks: string, batas = BATAS_HASIL): string {
  if (teks.length <= batas) return teks;
  const ekor = Math.floor(batas * POTONG_EKOR_RASIO);
  const kepala = batas - ekor;
  const hilang = teks.length - kepala - ekor;
  return (
    teks.slice(0, kepala) +
    `\n\n[terpotong: ${hilang} karakter di TENGAH tidak ditampilkan; ` +
    'yang tersisa adalah bagian awal dan bagian akhir. ' +
    'Persempit permintaannya, misalnya dengan pola, kedalaman, atau offset/limit.]\n\n' +
    teks.slice(teks.length - ekor)
  );
}

/** Ukuran di atas mana keluaran tool diarsipkan, bukan dikirim utuh. */
export const BATAS_ARSIP = 8 * 1024;

/**
 * Buang keluaran besar ke disk dan kirim penunjuknya.
 *
 * Sebuah hasil tool yang panjang TINGGAL DI RIWAYAT untuk sisa percakapan, dan
 * itu ditagih di setiap giliran berikutnya — satu `read_file` 40 KB berarti
 * ~10.000 token yang dikirim ulang puluhan kali untuk jawaban yang mungkin cuma
 * memakai tiga barisnya. Pendekatan "potong saja" lebih buruk lagi: model
 * kehilangan sisanya secara diam-diam dan menyimpulkan dari daftar yang tidak
 * lengkap.
 *
 * Jadi isinya disimpan utuh, dan model diberi path plus ringkasan awal. Ia bisa
 * membaca ulang bagian mana pun (dengan offset/limit) kalau memang butuh, dan
 * kalau tidak, yang dikirim ke konteks hanya beberapa ratus karakter.
 *
 * Gagal menulis TIDAK boleh menggagalkan tool-nya: arsip adalah penghematan,
 * bukan tujuan. Kalau disk menolak, keluaran aslinya yang dikembalikan —
 * lebih baik mahal daripada kosong.
 */
export async function arsipkan(teks: string, nama: string): Promise<string> {
  if (teks.length <= BATAS_ARSIP) return teks;

  /*
   * Written through Rust, not through the workspace writer.
   *
   * The archive has to work when NO workspace is open — that is precisely when a
   * workspace-relative path does not exist, and it is also when a long agent run
   * is most likely to be piling up output. The command writes under the app's
   * own data folder, outside the workspace guard the same way `secrets.json` is.
   */
  let berkas = '';
  try {
    const { aiArchiveToolOutput } = await import('../commands');
    berkas = await aiArchiveToolOutput(nama, teks);
  } catch {
    /* Failing to archive must not fail the tool: the archive is a saving, not
       the goal. Falls back to an honest truncation. */
    return potong(teks);
  }
  if (!berkas) return potong(teks);

  const kepala = teks.slice(0, 1200);

  return (
    `${kepala}\n\n` +
    `[hasil lengkap ${teks.length.toLocaleString()} karakter disimpan di:\n  ${berkas}\n` +
    'Baca bagian yang kamu butuhkan dengan read_file (pakai offset dan limit); ' +
    'jangan membaca seluruhnya kalau tidak perlu.]'
  );
}

/* ------------------------------------------------------------------ */
/* Penerjemah argumen                                                 */
/* ------------------------------------------------------------------ */

/*
 * Model kadang mengirim angka sebagai string ("10") dan kadang sebagai number.
 * Memaksa satu bentuk di skema tidak cukup: penyedia yang berbeda memperlakukan
 * `type: "number"` secara berbeda, dan sebagian mengirimnya sebagai teks. Jadi
 * setiap pembaca angka dan boolean menerima keduanya. Kalau tidak, agent gagal
 * pada panggilan yang sebenarnya benar hanya karena bentuk nilainya.
 */
export function bacaAngka(v: unknown, bawaan?: number): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return bawaan;
}

export function bacaBool(v: unknown, bawaan = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'ya') return true;
    if (s === 'false' || s === '0' || s === 'tidak') return false;
  }
  if (typeof v === 'number') return v !== 0;
  return bawaan;
}

/** Wajib ada, dan tidak boleh kosong. Kesalahan menyebut nama argumennya. */
export function wajib(args: Record<string, unknown>, nama: string): string {
  const v = args[nama];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`ERROR: argumen "${nama}" wajib diisi dan tidak boleh kosong.`);
  }
  return v;
}

/*
 * Find a deferred tool by free-text query, for `tool_search`.
 *
 * "Deferred" = everything NOT in the always-sent core, minus the bridge tools
 * themselves (searching for tool_search is a dead end). Loaded lazily so this
 * module does not import the full tool table at load time - the same cycle
 * `tool_call` avoids.
 *
 * Scoring is deliberately simple and forgiving: a name or description hit on
 * any word of the query wins, with name hits weighted higher. A model that
 * types "buka halaman web" should find `browser_open` even though no single
 * token matches exactly - so the query is split and matched loosely.
 */
/*
 * Padanan kata Indonesia <-> Inggris untuk `tool_search`.
 *
 * Deskripsi tool di katalog ini campur: yang bawaan berbahasa Indonesia, yang
 * web/browser berbahasa Inggris. Model mencari dengan kata yang paling wajar
 * dalam bahasa percakapannya, dan pencarian yang cuma mencocokkan string akan
 * gagal lintas bahasa - tool jadi tidak terjangkau walau terpasang dan aktif.
 *
 * Ini bukan teori. Dengan daftar inti yang dipangkas, `tool_search("cari di
 * internet")` TIDAK menemukan `web_search` (deskripsinya "Search the web
 * through DuckDuckGo"), dan `tool_search("maju mundur muat ulang")` TIDAK
 * menemukan `browser_nav` ("Navigate the browser pane: back, forward, reload").
 * Padahal keduanya sudah dilepas dari daftar yang dikirim setiap request, jadi
 * tidak ada jalan lain menuju tool itu.
 *
 * Peta ini menutup celah tersebut di satu tempat. Kuncinya kata Indonesia yang
 * muncul di query, nilainya kata Inggris yang muncul di deskripsi atau di nama
 * tool. Arah sebaliknya tidak perlu: query berbahasa Inggris sudah cocok apa
 * adanya dengan deskripsi berbahasa Inggris.
 *
 * Menambah entri di sini jauh lebih murah - dan jauh lebih kecil risikonya -
 * daripada menerjemahkan 60 deskripsi tool, yang pasti akan basi begitu satu
 * deskripsi disunting.
 */
const PADANAN_KATA = new Map<string, readonly string[]>([
  ['cari', ['search', 'find']],
  ['mencari', ['search', 'find']],
  ['pencarian', ['search']],
  ['internet', ['web', 'internet']],
  ['situs', ['web', 'site']],
  ['halaman', ['page', 'browser']],
  ['buka', ['open', 'navigate']],
  ['membuka', ['open', 'navigate']],
  ['browsing', ['browser']],
  ['maju', ['forward', 'navigate']],
  ['mundur', ['back', 'navigate']],
  ['kembali', ['back', 'navigate']],
  ['muat', ['reload', 'load']],
  ['ulang', ['reload']],
  ['segarkan', ['reload']],
  ['pindah', ['change', 'navigate']],
  ['alamat', ['url', 'address']],
  ['simbol', ['symbol']],
  ['fungsi', ['symbol']],
  ['kelas', ['symbol']],
  ['metode', ['symbol']],
  ['definisi', ['definition']],
  ['referensi', ['references']],
  ['rujukan', ['references']],
  ['galat', ['diagnostics']],
  ['kesalahan', ['diagnostics']],
  ['peringatan', ['diagnostics']],
  ['dokumentasi', ['hover', 'documentation']],
  ['unduh', ['download']],
  ['tutup', ['close']],
  ['klik', ['click']],
  ['ketik', ['type']],
  ['catatan', ['notes']],
  ['jadwal', ['schedule']],
  ['jadwalkan', ['schedule']],
  ['tangkap', ['screenshot', 'capture']],
  ['layar', ['screenshot', 'screen']],
  ['pratinjau', ['preview']],
  ['perintah', ['command']],
  ['jalankan', ['run', 'command']],
  /* Kendali jendela: kata yang benar-benar dipakai user/model saat minta
     sesuatu DIMUNCULKAN. Tanpa entri ini, tool yang membuka panel dan bagian
     Settings ditemukan hanya lewat kata Inggris ("panel" kebetulan sama),
     sementara "setelan" dan "jendela" tidak cocok dengan deskripsi mana pun -
     tool-nya terpasang dan aktif, tapi tidak terjangkau lewat pencarian. */
  ['setelan', ['setting', 'settings']],
  ['pengaturan', ['setting', 'settings']],
  ['jendela', ['window']],
  ['berkas', ['file']],
  ['folder', ['directory', 'folder']],
  ['direktori', ['directory']],
]);

async function cariToolTerdefer(
  query: string,
  limit: number,
): Promise<Array<{ nama: string; deskripsi: string; params: Record<string, unknown> }>> {
  const [{ AGENT_TOOLS }, { TOOL_DIKIRIM_SELALU }] = await Promise.all([
    import('../agentTools'),
    import('./catalog'),
  ]);
  /*
   * Exclude what is ALREADY SENT, not what the catalog calls "core". Those are
   * different sets: TOOL_INTI is the 43 tools installable by default, but only
   * TOOL_DIKIRIM_SELALU (17) ride every request. Filtering by TOOL_INTI hid
   * every default-on-but-deferred tool - schedule, notes, background bash -
   * from search, so the model could not find them at all.
   */
  const dikirim = new Set<string>(TOOL_DIKIRIM_SELALU);
  const bridge = new Set(['tool_search', 'tool_call']);
  const kata = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 2);
  const skor: Array<{ nama: string; deskripsi: string; params: Record<string, unknown>; nilai: number }> = [];
  for (const t of AGENT_TOOLS) {
    const nama = t.spec.name;
    if (dikirim.has(nama) || bridge.has(nama)) continue;
    const namaLc = nama.toLowerCase();
    const descLc = String(t.spec.description ?? '').toLowerCase();
    let nilai = 0;
    /*
     * Pencocokan dua bahasa dalam SATU putaran.
     *
     * `w` sendiri dicocokkan apa adanya, lalu padanannya dicocokkan juga. Yang
     * penting: pencarian ini tetap longgar - query bebas ("buka halaman web")
     * tetap bekerja karena tiap kata diuji terpisah, bukan sebagai frasa.
     */
    for (const w of kata) {
      if (namaLc.includes(w)) nilai += 3;
      if (descLc.includes(w)) nilai += 1;
      const padanan = PADANAN_KATA.get(w);
      if (!padanan) continue;
      /*
       * Padanan diberi bobot lebih kecil dari kata aslinya. Query campuran
       * ("cari web") bisa mencocokkan dua kata yang artinya sama, dan tanpa
       * pembedaan ini tool yang cuma cocok lewat padanan bisa mengalahkan tool
       * yang namanya benar-benar disebut user.
       */
      for (const p of padanan) {
        if (namaLc.includes(p)) nilai += 2;
        if (descLc.includes(p)) nilai += 1;
      }
    }
    if (nilai > 0) {
      skor.push({
        nama,
        deskripsi: String(t.spec.description ?? '').split('\n')[0].slice(0, 200),
        params: (t.spec.parameters as { properties?: Record<string, unknown> })?.properties ?? {},
        nilai,
      });
    }
  }
  skor.sort((a, b) => b.nilai - a.nilai);
  return skor.slice(0, limit).map(({ nama, deskripsi, params }) => ({ nama, deskripsi, params }));
}

/**
 * Akar workspace saat ini, atau `null` kalau belum ada yang dibuka.
 *
 * Mengembalikan `null` — BUKAN `'.'` — dan itu bukan detail gaya.
 *
 * `'.'` adalah folder kerja PROSES APLIKASI, bukan folder yang sedang
 * dikerjakan user. Selama aplikasi dijalankan dari `npm run tauri dev`, `'.'`
 * kebetulan berarti akar repo dan tidak ada yang terlihat salah. Tetapi begitu
 * aplikasi dijalankan dari folder lain — hasil build, shortcut Start Menu,
 * pemanggilan dari direktori mana pun — `'.'` menunjuk tempat yang sama sekali
 * berbeda. Perintah user lalu berjalan di folder yang salah, dan pesan
 * kegagalannya menyebut jalur yang tidak pernah dipilih siapa pun.
 *
 * Ada alasan kedua yang lebih langsung: backend SUDAH menyimpan workspace-nya
 * sendiri, dan `search_grep` memakai simpanan itu ketika `root` tidak dikirim
 * (`search.rs`: `None => state.workspace_path()`). Mengirim `'.'` menutupi
 * fallback yang benar itu dengan tebakan dari sisi frontend. `null` membiarkan
 * backend memakai sumber yang otoritatif.
 *
 * Karena itu setiap pemanggil harus memutuskan sendiri: kalau jalurnya WAJIB
 * (mis. `list_directory` yang memang butuh folder), pakai `akarWajib` supaya
 * pesannya jelas; kalau jalurnya OPSIONAL (cwd perintah, akar pencarian),
 * teruskan `undefined` dan biarkan backend yang menentukan.
 */
function akar(): string | null {
  return useStore.getState().workspace;
}

/**
 * Akar workspace, atau lempar dengan pesan yang bisa ditindaklanjuti.
 *
 * Dipakai tool yang memang tidak punya arti tanpa workspace. Melempar di sini
 * menghasilkan kalimat yang menjelaskan APA yang kurang, alih-alih membiarkan
 * jalur `'.'` berjalan diam-diam ke folder yang salah lalu gagal jauh di
 * belakang sebagai pesan sistem berkas yang membingungkan.
 */
/**
 * Folder kerja untuk perintah SHELL: folder berkas yang sedang dibuka, bukan
 * selalu akar folder yang terbuka.
 *
 * Kenapa dipisah dari akar(): user membuka satu folder besar (mis. sumber
 * Zephyr sendiri) lalu bertanya soal proyek lain. Kalau setiap perintah
 * dijalankan dari akar folder yang terbuka, agen terlihat "selalu mengarah ke
 * Zephyr" dan `npm test` berjalan di proyek yang salah. Berkas yang sedang
 * dilihat user adalah petunjuk terbaik soal "di mana kita sekarang"; tanpa
 * berkas terbuka, folder yang terbuka masih jawaban yang masuk akal; tanpa
 * keduanya `null` diserahkan ke backend supaya ia yang memutuskan.
 */
function akarCwd(): string | null {
  const s = useStore.getState();
  const tab = s.activeTabId ? s.tabs.find((t) => t.id === s.activeTabId) : undefined;
  const berkas = tab?.path ?? '';
  if (berkas) {
    const potong = Math.max(berkas.lastIndexOf('/'), berkas.lastIndexOf('\\'));
    /* `potong > 1` menolak akar telanjang seperti `C:file.txt`, yang foldernya
       tidak bisa ditentukan dari stringnya. */
    if (potong > 1 && !/^[A-Za-z]:$/.test(berkas.slice(0, potong))) return berkas.slice(0, potong);
  }
  return s.workspace;
}

function akarWajib(apa: string): string {
  const a = akar();
  if (!a) {
    throw new Error(
      `Belum ada folder yang terbuka, jadi ${apa} tidak punya tempat untuk dijalankan. ` +
        'Kalau user sudah menyebut folder atau path tertentu, pakai path itu apa adanya. ' +
        'Kalau tugasnya memang perlu seluruh proyek, baru minta user membuka foldernya (File -> Open Folder), lalu ulangi.',
    );
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Bantuan berkas                                                     */
/* ------------------------------------------------------------------ */

/** Berkas yang sedang terbuka di editor, kalau ada. */
function tabUntuk(path: string) {
  return useStore.getState().tabs.find((t) => t.path && t.path === path) ?? null;
}

/**
 * Baca berkas untuk agen: buffer editor lebih dulu, disk sebagai cadangan.
 *
 * Urutannya penting dan bukan pilihan gaya. Ketika user sedang mengedit berkas,
 * DISK sudah basi: ia berisi versi sebelum perubahan terakhir. Membaca disk di
 * situ berarti agen menjawab berdasarkan kode yang sudah tidak ada di layar -
 * dan itu menghasilkan jawaban yang tampak yakin tapi salah.
 *
 * Karena itu buffer menang, dan hasilnya selalu menyebut dari mana isinya
 * datang. Tanpa penanda itu, user tidak punya cara tahu apakah agen membaca
 * pekerjaannya yang belum tersimpan atau versi lama di disk.
 */
export async function bacaBerkas(
  path: string,
  offset?: number,
  limit?: number,
  dariDisk = false,
): Promise<string> {
  const mulai = offset === undefined ? 0 : Math.max(0, offset);
  const jumlah = limit === undefined ? undefined : Math.max(0, limit);
  const tab = dariDisk ? null : tabUntuk(path);

  if (tab) {
    const baris = (tab.content ?? '').split('\n');
    const potongBaris = jumlah === undefined ? baris.slice(mulai) : baris.slice(mulai, mulai + jumlah);
    const tanda = tab.unsaved ? ', ada perubahan belum tersimpan' : '';
    return `[buffer editor${tanda}; ${baris.length} baris]\n` + potongBaris.join('\n');
  }

  const hasil = await cmd.fsRead(path);
  const baris = hasil.content.split('\n');
  const potongBaris = jumlah === undefined ? baris.slice(mulai) : baris.slice(mulai, mulai + jumlah);
  const tanda = hasil.readOnly ? ', READ-ONLY' : '';
  const catatan = hasil.note ? ` (${hasil.note})` : '';
  return (
    `[dari disk; ${baris.length} baris; ${hasil.bytes} byte; encoding ${hasil.detectedEncoding}${tanda}${catatan}]\n` +
    potongBaris.join('\n')
  );
}

/** Terapkan penjaga shell bersama ke semua tool yang menjalankan perintah. */
export function periksaPerintah(command: string): void {
  const hasil = periksaPerintahShell(command);
  if (!hasil.ok) throw new Error(`ERROR: ${hasil.alasan}`);
}

/* ------------------------------------------------------------------ */
/* Kolom pencarian                                                    */
/* ------------------------------------------------------------------ */

/**
 * Susun opsi pencarian dari argumen tool.
 *
 * `include` dan `exclude` di SearchOpts adalah SATU string pola, bukan daftar.
 * Beberapa pola digabung dengan `|` - itu bentuk yang dimengerti mesin glob
 * yang dipakai di bawahnya. Daftar glob dari model diterima dalam bentuk array
 * maupun string, karena keduanya muncul di praktik.
 */
function opsiCari(a: Record<string, unknown>, query: string): SearchOpts {
  const keSatu = (v: unknown): string => {
    if (Array.isArray(v)) return v.map(String).filter(Boolean).join('|');
    if (typeof v === 'string') return v;
    return '';
  };
  return {
    query,
    caseSensitive: bacaBool(a.caseSensitive),
    wholeWord: bacaBool(a.wholeWord),
    regex: bacaBool(a.regex, true),
    include: keSatu(a.glob ?? a.include),
    exclude: keSatu(a.exclude),
    respectGitignore: true,
    includeHidden: bacaBool(a.all),
    maxResults: Math.min(2000, bacaAngka(a.limit, 200) ?? 200),
    root: a.root ? String(a.root) : undefined,
  };
}

/**
 * Evaluator aritmetika tanpa eval: tokenizer + shunting-yard + RPN.
 *
 * Kenapa tidak eval/Function: ekspresi datang dari model (dan kadang dari
 * teks user) - eval mengeksekusi kode apa pun, sedangkan yang dibutuhkan
 * hanya angka dan operator. Mendukung + - * / ^ % ( ), unary minus, desimal,
 * dan notasi 1e3. Operator tak dikenal, kurung tak seimbang, atau pembagian
 * nol melempar - dan toolGate mengubahnya jadi hasil tool yang gagal, bukan
 * crash.
 */
function hitungAman(expr: string): string {
  const s = String(expr ?? '').trim();
  if (!s) throw new Error('Ekspresi kosong.');
  if (s.length > 500) throw new Error('Ekspresi terlalu panjang (maks 500 karakter).');
  if (!/^[0-9+\-*/^%().,\s eE]+$/.test(s)) {
    throw new Error('Hanya angka dan operator + - * / ^ % ( ) yang diterima.');
  }
  const normal = s.replace(/,/g, '.');
  type Tok = { t: 'n'; v: number } | { t: 'op'; v: string } | { t: '(' } | { t: ')' };
  const toks: Tok[] = [];
  let i = 0;
  const pres: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, u: 4 };
  const kanan = new Set(['^', 'u']);
  const angkaRe = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
  let harapOperand = true;
  while (i < normal.length) {
    const c = normal[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(') { toks.push({ t: '(' }); i++; harapOperand = true; continue; }
    if (c === ')') { toks.push({ t: ')' }); i++; harapOperand = false; continue; }
    if (harapOperand && (c === '+' || c === '-')) {
      toks.push({ t: 'op', v: c === '-' ? 'u' : 'p' });
      i++; continue;
    }
    if (!harapOperand && '+-*/%^'.includes(c)) { toks.push({ t: 'op', v: c }); i++; harapOperand = true; continue; }
    const m = angkaRe.exec(normal.slice(i));
    if (m) {
      const v = Number(m[0]);
      if (!Number.isFinite(v)) throw new Error(`Angka tidak valid: ${m[0]}`);
      toks.push({ t: 'n', v }); i += m[0].length; harapOperand = false; continue;
    }
    throw new Error(`Karakter tak terduga: '${c}'`);
  }
  // Shunting-yard ke RPN.
  const out: Tok[] = [];
  const ops: Tok[] = [];
  for (const tk of toks) {
    if (tk.t === 'n') { out.push(tk); continue; }
    if (tk.t === '(') { ops.push(tk); continue; }
    if (tk.t === ')') {
      let ketemu = false;
      while (ops.length) {
        const o = ops.pop()!;
        if (o.t === '(') { ketemu = true; break; }
        out.push(o);
      }
      if (!ketemu) throw new Error('Kurung tutup tanpa pasangan.');
      continue;
    }
    const o1 = (tk as { v: string }).v;
    if (o1 === 'p') continue; // unary plus: tidak mengubah apa pun
    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top.t !== 'op') break;
      const o2 = (top as { v: string }).v;
      const p1 = pres[o1] ?? 0; const p2 = pres[o2] ?? 0;
      if (p2 > p1 || (p2 === p1 && !kanan.has(o1))) out.push(ops.pop()!);
      else break;
    }
    ops.push(tk);
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o.t === '(') throw new Error('Kurung buka tanpa pasangan.');
    out.push(o);
  }
  // Evaluasi RPN.
  const st: number[] = [];
  for (const tk of out) {
    if (tk.t === 'n') { st.push(tk.v); continue; }
    const op = (tk as { v: string }).v;
    if (op === 'u') {
      const a = st.pop();
      if (a === undefined) throw new Error('Ekspresi tidak lengkap.');
      st.push(-a); continue;
    }
    const b = st.pop(); const a = st.pop();
    if (a === undefined || b === undefined) throw new Error('Ekspresi tidak lengkap.');
    let h: number;
    switch (op) {
      case '+': h = a + b; break;
      case '-': h = a - b; break;
      case '*': h = a * b; break;
      case '/':
        if (b === 0) throw new Error('Pembagian dengan nol.');
        h = a / b; break;
      case '%':
        if (b === 0) throw new Error('Modulo dengan nol.');
        h = a % b; break;
      case '^': h = Math.pow(a, b); break;
      default: throw new Error(`Operator tak dikenal: ${op}`);
    }
    if (!Number.isFinite(h)) throw new Error('Hasil di luar jangkauan angka.');
    st.push(h);
  }
  if (st.length !== 1) throw new Error('Ekspresi tidak lengkap.');
  const hasil = st[0];
  const teks = Number.isInteger(hasil) ? String(hasil) : String(Math.round(hasil * 1e12) / 1e12);
  return `${s} = ${teks}`;
}

/* ------------------------------------------------------------------ */
/* 28 tool                                                            */
/* ------------------------------------------------------------------ */

export const TOOL_BAWAAN: AgentTool[] = [
  /* ---------------- Files ---------------- */

  {
    spec: {
      name: 'read_file',
      description:
        'Baca sebuah berkas. Kalau berkasnya sedang terbuka di editor, isi yang BELUM TERSIMPAN yang dibaca - hasilnya menyebutkan dari mana asalnya. Pakai offset dan limit untuk berkas besar.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas.' },
          offset: { type: ['number', 'string'], description: 'Baris awal, dihitung dari 0.' },
          limit: { type: ['number', 'string'], description: 'Jumlah baris yang dibaca.' },
          fromDisk: { type: ['boolean', 'string'], description: 'Paksa baca dari disk, abaikan buffer editor.' },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      /*
       * An archived tool output is read through its own door.
       *
       * The archive lives under the app's data folder, which the workspace guard
       * correctly refuses — so without this branch the model was handed a
       * pointer to its own earlier output and then denied the file, which is
       * worse than never archiving at all. The check is on the path SHAPE, not a
       * glob: only something inside `tool-output/` goes this way, and everything
       * else keeps the ordinary guarded read.
       */
      if (/[\\/]tool-output[\\/]/.test(path)) {
        const teks = await cmd.aiReadToolOutput(path);
        return potong(teks);
      }
      jagaBaca(path);
      const isi = await bacaBerkas(path, bacaAngka(a.offset), bacaAngka(a.limit), bacaBool(a.fromDisk));
      /* Sebuah berkas besar TINGGAL di riwayat dan ditagih tiap giliran; yang
         dikirim cukup kepala plus path untuk membaca sisanya kalau perlu. */
      return arsipkan(isi, path.split(/[\\/]/).pop() || 'berkas');
    },
  },

  {
    spec: {
      name: 'list_directory',
      description:
        'Daftar isi sebuah direktori, satu tingkat. Untuk masuk lebih dalam, pakai depth (maksimum 3). Jangan menyisir seluruh pohon dengan satu panggilan: hasilnya terpotong dan kamu akan menyimpulkan isi yang salah.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Direktori. Kosongkan untuk akar workspace.' },
          depth: { type: ['number', 'string'], description: 'Kedalaman rekursif, maksimum 3.' },
          all: { type: ['boolean', 'string'], description: 'Ikut sertakan entri tersembunyi.' },
        },
        required: [],
      },
    },
    run: async (a) => {
      /*
       * `list_directory` memang tidak punya arti tanpa folder, jadi di sini
       * `akarWajib` dipakai - bukan `akar()` yang bisa `null`. Melempar dengan
       * kalimat "belum ada workspace" jauh lebih menolong daripada menyisir
       * folder kerja proses aplikasi lalu melaporkan isinya sebagai milik user.
       */
      const path = String(a.path ?? '') || akarWajib('mendaftar isi folder');
      const depth = Math.min(3, Math.max(1, bacaAngka(a.depth, 1) ?? 1));
      const simpul = await cmd.scanDir(path);
      const baris: string[] = [];
      const jelajah = (daftar: typeof simpul, sisa: number, awalan: string) => {
        for (const n of daftar) {
          if (baris.length >= BATAS_DAFTAR) return;
          baris.push(`${n.isDir ? 'dir ' : 'file'}  ${awalan}${n.name}`);
          if (n.isDir && sisa > 1 && n.hasChildren) {
            /* Kedalaman kedua dan seterusnya dimuat malas: `scan_dir` hanya
               membaca satu tingkat, jadi anaknya harus diminta sendiri. Kalau
               `hasChildren` salah, panggilan ini gagal - dan kegagalannya
               ditelan, karena satu direktori yang tidak terbaca tidak boleh
               menggagalkan seluruh daftar. */
            // dimuat di bawah secara berurutan
          }
        }
      };
      jelajah(simpul, depth, '');

      if (depth > 1) {
        let tingkat = simpul.filter((n) => n.isDir && n.hasChildren);
        let level = 1;
        while (level < depth && tingkat.length && baris.length < BATAS_DAFTAR) {
          const berikut: typeof simpul = [];
          for (const dir of tingkat) {
            const anak = await cmd.scanDir(dir.path).catch(() => [] as typeof simpul);
            for (const n of anak) {
              if (baris.length >= BATAS_DAFTAR) break;
              baris.push(`${n.isDir ? 'dir ' : 'file'}  ${dir.name}/${n.name}`);
            }
            berikut.push(...anak.filter((n) => n.isDir && n.hasChildren).map((n) => ({ ...n, name: `${dir.name}/${n.name}` })));
          }
          tingkat = berikut;
          level++;
        }
      }

      if (!baris.length) return `Direktori kosong: ${path}`;
      const lebih = baris.length >= BATAS_DAFTAR ? `\n[... daftar dibatasi ${BATAS_DAFTAR} entri; persempit kedalamannya]` : '';
      return potong(`${path}\n` + baris.join('\n') + lebih);
    },
  },

  {
    spec: {
      name: 'write_file',
      description:
        'Tulis isi ke sebuah berkas, menimpa isinya. Untuk perubahan kecil pada berkas yang sudah ada, pakai edit - ia tidak menghapus bagian yang tidak kamu sentuh.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas. Harus di dalam workspace.' },
          content: { type: 'string', description: 'Isi lengkap berkas.' },
          createOnly: { type: ['boolean', 'string'], description: 'Gagal kalau berkasnya sudah ada.' },
        },
        required: ['path', 'content'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      jagaTulis(path);
      const isi = String(a.content ?? '');
      if (bacaBool(a.createOnly)) {
        const ada = await cmd.fsExists(path).catch(() => false);
        if (ada) throw new Error(`ERROR: berkas sudah ada, dan createOnly disetel: ${path}`);
      }
      /*
       * Isi lama dibaca SEBELUM menulis, supaya diffnya bisa dihitung.
       *
       * Sebuah berkas BARU juga menghasilkan diff. Versi sebelumnya
       * melewatkannya (`lama ? buatDiff(...) : ''`) dengan alasan "tidak ada
       * yang berguna untuk dibandingkan" — dan alasan itu salah, terbukti dari
       * run sungguhan: membuat tiga berkas baru menghasilkan NOL diff, sehingga
       * pembaca tidak melihat satu baris pun dari apa yang ditulis, padahal
       * menambah berkas adalah perubahan yang paling jelas (seluruh isinya
       * baru). Diff dari kosong menampilkan tepat itu: setiap baris sebagai
       * tambahan.
       */
      const lama = await bacaLengkap(path).catch(() => '');
      /*
       * Recorded for the turn's checkpoint BEFORE the write.
       *
       * This call site writes through `cmd.fsWrite` rather than `tulis()`
       * because it needs the OLD content for a diff, and `tulis` does not
       * return it. That made it a second write path, and the checkpoint only
       * watched the first — so a file created by this tool was invisible to
       * "put back what this turn changed". Exactly the failure the note in
       * `checkpoint.ts` warns about: recording at the call sites means
       * remembering to add it to the next one.
       */
      await (await import('../checkpoint')).catat(path);
      await cmd.fsWrite(path, isi, undefined, undefined, { allowMissing: true });
      await segarkanTab(path);
      const diff = buatDiff(path, lama, isi);
      return `Ditulis: ${path} (${isi.length} karakter)` + (diff ? `\n${diff}` : '');
    },
  },

  {
    spec: {
      name: 'create_directory',
      description: 'Buat sebuah direktori, termasuk direktori induk yang belum ada.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Jalur direktori baru.' } },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      jagaTulis(path);
      await cmd.fsCreateDir(path);
      return `Direktori dibuat: ${path}`;
    },
  },

  {
    spec: {
      name: 'move_file',
      description: 'Pindahkan atau ganti nama sebuah berkas atau direktori.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Jalur asal.' },
          to: { type: 'string', description: 'Jalur tujuan.' },
        },
        required: ['from', 'to'],
      },
    },
    run: async (a) => {
      const from = wajib(a, 'from');
      const to = wajib(a, 'to');
      jagaTulis(from, to);
      await cmd.fsRename(from, to);
      /* Tab yang menunjuk berkas itu harus ikut pindah. Tanpa ini, tab-nya
         masih menunjuk jalur lama, dan menyimpannya akan MENULIS ULANG berkas
         di tempat lama - menghidupkan kembali berkas yang baru saja
         dipindahkan. */
      useStore.getState().renamePathInTabs(from, to);
      return `Dipindahkan: ${from} -> ${to}`;
    },
  },

  {
    spec: {
      name: 'copy_file',
      description:
        'Salin sebuah berkas. Untuk direktori, salin isinya berkas demi berkas - menyalin seluruh pohon dengan satu panggilan tidak didukung.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Jalur asal.' },
          to: { type: 'string', description: 'Jalur tujuan.' },
        },
        required: ['from', 'to'],
      },
    },
    run: async (a) => {
      const from = wajib(a, 'from');
      const to = wajib(a, 'to');
      jagaBaca(from);
      jagaTulis(to);
      const hasil = await cmd.fsRead(from);
      /* The destination is a file this turn creates. Recorded so the checkpoint
         can delete it — same reason as the create path above. */
      await (await import('../checkpoint')).catat(to);
      await cmd.fsWrite(to, hasil.content, undefined, undefined, { allowMissing: true });
      return `Disalin: ${from} -> ${to} (${hasil.content.length} karakter)`;
    },
  },

  {
    spec: {
      name: 'delete_file',
      description:
        'Hapus berkas atau direktori. TIDAK BISA DIBATALKAN. Baca dulu apa yang kamu hapus, dan sebutkan alasannya kepada user.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur yang dihapus.' },
          recursive: { type: ['boolean', 'string'], description: 'Perlu untuk direktori yang tidak kosong.' },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      jagaTulis(path);
      await cmd.fsDelete([path], bacaBool(a.recursive));
      useStore.getState().closeTabsUnder([path]);
      return `Dihapus: ${path}`;
    },
  },

  {
    spec: {
      name: 'replace_in_files',
      description:
        'Ganti teks atau pola di banyak berkas sekaligus. Jalankan dulu grep dengan pola yang sama untuk melihat APA yang akan kena: satu pola yang terlalu luas bisa merusak seluruh repo dalam satu panggilan. Gunakan dryRun untuk melihat dampaknya tanpa mengubah apa pun.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pola pencarian (regex).' },
          replacement: { type: 'string', description: 'Teks pengganti. Boleh memakai $1, ${nama}.' },
          glob: { type: ['array', 'string'], items: { type: 'string' }, description: 'Batasi ke pola jalur tertentu.' },
          root: { type: 'string', description: 'Akar pencarian. Bawaannya workspace.' },
          dryRun: { type: ['boolean', 'string'], description: 'Hanya laporkan, jangan ubah apa pun.' },
        },
        required: ['pattern', 'replacement'],
      },
    },
    run: async (a) => {
      const pattern = wajib(a, 'pattern');
      const replacement = String(a.replacement ?? '');
      const opsi = opsiCari(a, pattern);
      /*
       * `undefined`, bukan `'.'`, ketika belum ada workspace.
       *
       * `search_grep` sudah menangani `root` yang kosong dengan memakai
       * workspace yang disimpan backend (`search.rs`: `None => state
       * .workspace_path()`), jadi mengirim `'.'` justru MENUTUPI fallback yang
       * benar itu dengan tebakan dari sini - dan `'.'` berarti folder kerja
       * proses aplikasi, bukan folder user.
       */
      opsi.root = a.root ? String(a.root) : (akar() ?? undefined);
      opsi.regex = true;

      /* Mode uji jalan memakai pencarian yang SAMA dengan penggantian, supaya
         yang dilaporkan benar-benar yang akan berubah. Menghitung dengan cara
         lain akan membuat laporannya berbeda dari akibatnya. */
      const ringkas = await cmd.searchGrep(opsi);
      if (ringkas.error) throw new Error(`ERROR: pencarian gagal: ${ringkas.error}`);
      if (ringkas.files === 0) return `Tidak ada berkas yang cocok, jadi tidak ada yang diubah.`;

      if (bacaBool(a.dryRun)) {
        return `Uji jalan: ${ringkas.files} berkas, ${ringkas.hits} kecocokan akan diganti. Tidak ada yang diubah.`;
      }

      /* Daftar berkas harus dikumpulkan sendiri: `search_replace` mengganti di
         dalam berkas yang DIKIRIM, ia tidak menyisir workspace. Itu disebut di
         kepala berkas ini supaya tidak ada yang menebaknya dari nama. */
      const berkas = await kumpulkanBerkas(opsi);
      if (!berkas.length) return 'Tidak ada berkas yang cocok, jadi tidak ada yang diubah.';

      const hasil = await cmd.searchReplace(berkas, opsi, replacement);
      const berubah = hasil.filter((h) => h.jumlah > 0);
      for (const h of berubah) await segarkanTab(h.path);
      const baris = berubah.map((h) => `  ${h.path}  (${h.jumlah} penggantian)`);
      const galat = hasil.filter((h) => h.error);
      const total = berubah.reduce((n, h) => n + h.jumlah, 0);
      const kepala = `Diganti di ${berubah.length} berkas, ${total} penggantian.`;
      const kaki = galat.length ? '\nGagal:\n' + galat.map((h) => `  ${h.path}: ${h.error}`).join('\n') : '';
      return potong(kepala + '\n' + baris.join('\n') + kaki);
    },
  },

  /* ---------------- Edit ---------------- */

  {
    spec: {
      name: 'edit',
      description:
        'Ubah sebagian isi berkas: cari teks lama, ganti teks baru. Teks lama harus muncul TEPAT SEKALI kecuali replace_all disetel. Pakai ini, bukan write_file, untuk perubahan kecil.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Berkas yang diubah.' },
          old_string: { type: 'string', description: 'Teks yang dicari. Harus persis, termasuk indentasi.' },
          new_string: { type: 'string', description: 'Teks pengganti.' },
          replace_all: { type: ['boolean', 'string'], description: 'Ganti semua kemunculan, bukan hanya satu.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      jagaTulis(path);
      const lama = String(a.old_string ?? '');
      const baru = String(a.new_string ?? '');
      if (lama === '') throw new Error('ERROR: old_string tidak boleh kosong.');
      if (lama === baru) throw new Error('ERROR: old_string dan new_string sama, tidak ada yang berubah.');

      const isi = await bacaLengkap(path);
      const semua = bacaBool(a.replace_all);
      const jumlah = isi.split(lama).length - 1;

      if (jumlah === 0) {
        /* Kesalahan yang paling sering: indentasi berbeda. Disebutkan apa
           adanya supaya model bisa memperbaiki sendiri. */
        throw new Error(
          `ERROR: teks lama tidak ditemukan di ${path}. Periksa indentasi dan spasi. ` +
            'Kalau berkasnya sudah berubah, baca ulang dengan read_file.',
        );
      }
      if (jumlah > 1 && !semua) {
        throw new Error(
          `ERROR: teks lama muncul ${jumlah} kali di ${path}. Persempit teksnya supaya unik, ` +
            'atau setel replace_all untuk mengganti semuanya.',
        );
      }

      const hasil = semua ? isi.split(lama).join(baru) : isi.replace(lama, baru);
      await tulis(path, hasil);
      /* Barisan kalimatnya tetap ada, tapi diffnya menyusul: panel AI hanya
         merender DiffViewer kalau hasilnya memuat hunk `@@`. Ringkasan saja
         membuat setiap perubahan berkas tampil sebagai satu baris teks. */
      const diff = buatDiff(path, isi, hasil);
      return `${jumlah} penggantian di ${path}.` + (diff ? `\n${diff}` : '');
    },
  },

  {
    spec: {
      name: 'multi_edit',
      description:
        'Beberapa penggantian pada SATU berkas dalam satu langkah. Dipakai ketika perubahan saling bergantung dan harus berhasil bersama: kalau ada satu yang gagal, TIDAK ADA yang diterapkan.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Berkas yang diubah.' },
          edits: {
            type: 'array',
            description: 'Daftar penggantian, dijalankan berurutan.',
            items: {
              type: 'object',
              properties: {
                old_string: { type: 'string' },
                new_string: { type: 'string' },
                replace_all: { type: ['boolean', 'string'] },
              },
              required: ['old_string', 'new_string'],
            },
          },
        },
        required: ['path', 'edits'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      jagaTulis(path);
      const daftar = Array.isArray(a.edits) ? a.edits : [];
      if (!daftar.length) throw new Error('ERROR: edits kosong.');

      let kerja = await bacaLengkap(path);
      /* Disalin sebelum diubah: diff dihitung terhadap isi SEBELUM semua
         penggantian, bukan terhadap keadaan setengah jalan. */
      const isiAwal = kerja;
      const laporan: string[] = [];

      for (let i = 0; i < daftar.length; i++) {
        const e = daftar[i] as Record<string, unknown>;
        const lama = String(e.old_string ?? '');
        const baru = String(e.new_string ?? '');
        const semua = bacaBool(e.replace_all);
        if (!lama) throw new Error(`ERROR: edits[${i}].old_string kosong.`);

        const jumlah = kerja.split(lama).length - 1;
        if (jumlah === 0) {
          /* Batalkan SELURUHNYA. Menerapkan sebagian meninggalkan berkas
             setengah jadi yang tidak dikompilasi - lebih buruk daripada tidak
             mengubah apa pun. */
          throw new Error(
            `ERROR: edits[${i}] tidak menemukan teksnya. Tidak ada perubahan diterapkan; ` +
              `${path} tetap seperti semula.`,
          );
        }
        if (jumlah > 1 && !semua) {
          throw new Error(
            `ERROR: edits[${i}] menemukan ${jumlah} kemunculan. Persempit teksnya atau setel replace_all. ` +
              'Tidak ada perubahan diterapkan.',
          );
        }
        kerja = semua ? kerja.split(lama).join(baru) : kerja.replace(lama, baru);
        laporan.push(`  edits[${i}]: ${jumlah} penggantian`);
      }

      await tulis(path, kerja);
      const diff = buatDiff(path, isiAwal, kerja);
      return (
        `Diterapkan ${daftar.length} penggantian di ${path}.\n` +
        laporan.join('\n') +
        (diff ? `\n${diff}` : '')
      );
    },
  },

  /* ---------------- Search ---------------- */

  {
    spec: {
      name: 'grep',
      description:
        'Cari teks atau pola di seluruh workspace. Hasilnya dibatasi; kalau terlalu banyak, persempit polanya atau tambahkan glob.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pola pencarian (regex).' },
          glob: { type: ['array', 'string'], items: { type: 'string' }, description: 'Batasi ke pola jalur.' },
          root: { type: 'string', description: 'Akar pencarian.' },
          ignoreCase: { type: ['boolean', 'string'], description: 'Abaikan besar-kecil huruf.' },
          limit: { type: ['number', 'string'], description: 'Jumlah hasil maksimum.' },
        },
        required: ['pattern'],
      },
    },
    run: async (a) => {
      const pattern = wajib(a, 'pattern');
      const opsi = opsiCari(a, pattern);
      /* Sama seperti `replace_in_files`: `undefined` membiarkan `search_grep`
         memakai workspace yang disimpan backend, sedangkan `'.'` mengarahkan
         pencarian ke folder kerja proses aplikasi. */
      opsi.root = a.root ? String(a.root) : (akar() ?? undefined);
      /* Model menulis pola dengan asumsi case-insensitive lebih sering daripada
         tidak; `caseSensitive` disetel terbalik dari `ignoreCase` supaya
         argumennya bisa dibaca apa adanya. */
      opsi.caseSensitive = !bacaBool(a.ignoreCase);
      const ringkas = await cmd.searchGrep(opsi);
      if (ringkas.error) throw new Error(`ERROR: pencarian gagal: ${ringkas.error}`);
      const berkas = await kumpulkanBerkas(opsi);
      if (!berkas.length) return `Tidak ada hasil untuk ${JSON.stringify(pattern)}.`;
      const kepala = `[${ringkas.files} berkas, ${ringkas.hits} kecocokan]`;
      const daftar = potong(berkas.join('\n'));
      return `${kepala}\n${daftar}`;
    },
  },

  {
    spec: {
      name: 'glob',
      description: 'Cari berkas berdasarkan pola nama atau jalur.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pola glob, mis. **/*.ts.' },
          root: { type: 'string', description: 'Akar pencarian.' },
          limit: { type: ['number', 'string'], description: 'Jumlah berkas maksimum.' },
        },
        required: ['pattern'],
      },
    },
    run: async (a) => {
      const pattern = wajib(a, 'pattern');
      const batas = Math.min(2000, bacaAngka(a.limit, 200) ?? 200);
      const semua = await cmd.listWorkspaceFiles(batas);
      /* `list_workspace_files` mengembalikan daftar cepat berkas di workspace,
         jadi penyaringan pola dilakukan di sini. Ia mencari NAMA, bukan isi -
         untuk isi, pakai grep. */
      const re = polaKeRegex(pattern);
      /* Cocokkan path ber-slash maju: daftarnya memakai `\` Windows sementara
         regex glob memakai `/` sebagai pemisah - tanpa normalisasi ini glob
         tak pernah cocok. Lihat catatan di `kumpulkanBerkas`. */
      const cocok = semua.map((f) => f.path).filter((p) => re.test(p.replace(/\\/g, '/'))).slice(0, batas);
      if (!cocok.length) return `Tidak ada berkas yang cocok dengan ${pattern}.`;
      const kepala = cocok.length >= batas ? `[dibatasi ${batas} berkas]\n` : '';
      return potong(kepala + cocok.join('\n'));
    },
  },

  /* ---------------- Shell ---------------- */

  {
    spec: {
      name: 'bash_run',
      description:
        'Jalankan perintah dan tunggu sampai selesai. Perintah dijalankan di folder berkas yang sedang dibuka; tanpa berkas terbuka, di folder yang dibuka. HOST ADALAH WINDOWS: gunakan perintah Windows atau CLI portabel (git, npm, cargo, npx). JANGAN gunakan sintaks bash Linux seperti `pwd && ls -la`, `which`, atau `export` karena akan gagal. Untuk proses panjang (server/watcher), pakai bash_background. Perintah berat (build, install, test suite) boleh berjalan sampai 5 menit; isi `timeout` (milidetik) bila perintahnya butuh lebih lama lagi.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah yang dijalankan.' },
          timeout: {
            type: ['number', 'string'],
            description:
              'Batas waktu dalam milidetik. Bawaan 300000 (5 menit); maksimum 600000 (10 menit).',
          },
        },
        required: ['command'],
      },
    },
    run: async (a) => {
      const command = wajib(a, 'command');
      periksaPerintah(command);
      /*
       * URL dengan `&` dikutip DULU - `agent_exec` menjalankan perintah lewat
       * `cmd.exe /c`, jadi `&` di situ adalah pemisah perintah, bukan teks.
       * Tanpa ini, `yt-dlp https://...?v=a&list=b` dijalankan sebagai tiga
       * perintah: yang pertama dilepas ke background, dua sisanya gagal. Keluar
       * dengan cepat, agen mengira belum jalan, mengirim lagi - berulang.
       */
      const { perintah: aman, diubah } = kutipUrlDiPerintah(command);
      /*
       * `cwd` diteruskan apa adanya - termasuk `undefined` ketika belum ada
       * workspace - supaya `tentukan_cwd` di Rust memakai `state
       * .workspace_path()` miliknya sendiri. Mengirim `'.'` di sini adalah
       * bug yang dilaporkan sebagai `cwd bukan folder: .`: `'.'` bukan folder
       * yang dipilih user, dan `lexical_clean` dulu menghapusnya sampai jadi
       * path kosong sehingga validasinya menolak folder yang jelas ada.
       *
       * Kalau frontend mengirim jalur eksplisit, jalur itu tetap divalidasi
       * backend sebelum apa pun dijalankan.
       */
      const r = await cmd.agentExec(aman, bacaAngka(a.timeout), akarCwd() ?? undefined);
      const bagian = [
        `exit=${r.exitCode}${r.timedOut ? ' (WAKTU HABIS)' : ''} (${r.ms} ms)`,
        diubah ? '(URL dikutip otomatis agar & tidak memecah perintah)' : '',
        r.stdout ? `--- stdout ---\n${r.stdout}` : '',
        r.stderr ? `--- stderr ---\n${r.stderr}` : '',
      ].filter(Boolean);
      return potong(bagian.join('\n'));
    },
  },

  {
    spec: {
      name: 'bash_background',
      description:
        'Jalankan proses yang berumur panjang - dev server, watcher - sebagai tugas yang dipantau aplikasi, dan kembalikan segera dengan id-nya. Baca keluarannya dengan bash_logs, hentikan dengan bash_kill.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah yang dijalankan.' },
          id: { type: 'string', description: 'Id tugas yang didefinisikan di settings.tasks.json.' },
        },
        required: ['command'],
      },
    },
    run: async (a) => {
      const command = wajib(a, 'command');
      periksaPerintah(command);

      /*
       * Bangun dari perintah apa adanya, TANPA menyisipkan apa pun.
       *
       * Versi pertama fungsi ini memecah perintah dengan `split(' ')` lalu
       * meneruskannya sebagai `args`. Itu kelihatan rapi sampai kena perintah
       * yang memuat tanda kutip, mis. `node -e "console.log('x')"`. Pecahan
       * seperti itu menghasilkan argumen yang berbeda dari yang ditulis, dan
       * kegagalannya membingungkan karena perintah yang sama berhasil di
       * bash_run. Karena itu seluruh perintah dioper sebagai satu kesatuan.
       */
      /*
       * `navigator.userAgent` dipakai, bukan `process.platform`: kode ini
       * berjalan di WebView, bukan di Node, dan nama `process` tidak ada di
       * sana. Menyentuhnya membuat bundel gagal pada saat runtime - bukan saat
       * kompilasi, jadi kesalahannya baru muncul jauh dari sini.
       */
      const windows = /Windows/i.test(navigator.userAgent);
      const shell = windows ? 'pwsh' : 'sh';
      const bendera = windows ? '-Command' : '-c';

      const id = a.id ? String(a.id) : `agent-${Date.now().toString(36)}`;
      const runId = await cmd.tasksRun({
        id,
        label: a.id ? String(a.id) : command.slice(0, 60),
        kind: 'shell',
        command: shell,
        args: [bendera, command],
        /* `undefined` = serahkan ke backend, sama seperti `bash_run`. Proses
           latar yang dijalankan di folder kerja aplikasi alih-alih folder user
           adalah kegagalan yang paling sulit dilacak, karena ia terlihat
           "jalan" sambil menulis ke tempat yang salah. */
        cwd: akarCwd() ?? undefined,
        isBackground: true,
      });

      return (
        `Proses latar belakang dimulai.\n  id: ${runId}\n  command: ${command}\n` +
        'Keluaran awal mungkin belum siap. Tunggu sebentar, lalu panggil bash_logs - jangan menebak isinya.'
      );
    },
  },

  {
    spec: {
      name: 'bash_logs',
      description:
        'Baca keluaran sebuah proses latar belakang. Pakai since_offset dari panggilan sebelumnya untuk membaca tambahannya saja.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Id proses dari bash_background atau bash_list.' },
          since_offset: { type: ['number', 'string'], description: 'Mulai dari baris keluaran ini.' },
        },
        required: ['id'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'id');
      const offset = bacaAngka(a.since_offset) ?? 0;

      /*
       * Tunggu sebentar dulu, baru baca.
       *
       * `tasks_runs` melaporkan BERAPA BARIS yang sudah dihasilkan, bukan
       * isinya; keluaran diambil dari terminal lewat `pty_tail`. Tanpa jeda,
       * pembacaan pertama hampir selalu kosong - dan model lalu menyimpulkan
       * prosesnya gagal padahal baru saja dimulai.
       */
      if (offset === 0) await new Promise((r) => setTimeout(r, 1200));

      const semua = await cmd.tasksRuns();
      const run = semua.find((r) => r.id === id);
      if (!run) {
        const ids = semua.map((r) => r.id).join(', ') || '(tidak ada)';
        throw new Error(`ERROR: tidak ada proses dengan id "${id}". Yang ada: ${ids}`);
      }

      /*
       * `pty_tail` mengembalikan EKOR riwayat sejumlah N baris - ia tidak
       * menerima offset. Jadi `since_offset` diperlakukan sebagai "berapa baris
       * terakhir yang mau dilihat", dan itu memang arti yang berguna di sini:
       * yang dicari adalah keluaran TERBARU, bukan yang paling awal.
       *
       * `run.lines` memberi tahu total baris; kalau ada baris yang sudah
       * tergeser keluar dari riwayat, itu disebutkan supaya model tidak
       * menyimpulkan bahwa isinya hanya sebanyak yang dia lihat.
       */
      const maksBaris = offset > 0 ? Math.max(20, Math.min(2000, offset)) : 400;
      const teks = await cmd.ptyTail(id, maksBaris).catch(() => '');

      const dilihat = teks ? teks.split('\n').length : 0;
      const terlewat = run.lines > dilihat ? `  (${run.lines - dilihat} baris lebih awal tidak ditampilkan)` : '';
      const masalah = run.problems.length
        ? `\nMasalah yang terdeteksi:\n` +
          run.problems
            .slice(0, 20)
            .map((p) => `  ${p.file}:${p.line}  ${p.message}`)
            .join('\n')
        : '';

      const kepala =
        `status=${run.active ? 'berjalan' : 'selesai'}` +
        `  exit=${run.exitCode ?? 'n/a'}  baris=${run.lines}${terlewat}`;
      return potong(`${kepala}\n${teks || '(belum ada keluaran)'}${masalah}`);
    },
  },

  {
    spec: {
      name: 'bash_list',
      description: 'Daftar semua proses latar belakang, termasuk yang sudah selesai.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    run: async () => {
      const daftar = await cmd.tasksRuns();
      if (!daftar.length) return 'Tidak ada tugas latar belakang yang terdaftar.';
      return daftar
        .map(
          (t) =>
            `${t.id}  ${t.active ? 'berjalan' : 'selesai'}  ${t.label}  ` +
            `exit=${t.exitCode ?? 'n/a'}  ${t.lines} baris`,
        )
        .join('\n');
    },
  },

  {
    spec: {
      name: 'bash_kill',
      description:
        'Hentikan sebuah proses latar belakang beserta seluruh proses turunannya. Tidak apa-apa dipanggil pada proses yang sudah selesai.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Id proses dari bash_background atau bash_list.' } },
        required: ['id'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'id');
      const ada = await cmd.tasksRuns();
      if (!ada.some((r) => r.id === id)) {
        const ids = ada.map((r) => r.id).join(', ') || '(tidak ada)';
        throw new Error(`ERROR: tidak ada proses dengan id "${id}". Yang ada: ${ids}`);
      }
      /*
       * Dua langkah, dan keduanya perlu.
       *
       * `tasks_kill` menandai tugasnya berhenti dan mematikannya dari sudut
       * pandang aplikasi, tapi proses anak yang sudah di-spawn - mis. server
       * yang dijalankan oleh `npm run dev` - bisa tetap hidup dan memegang
       * portnya. Karena itu PTY-nya ikut dimatikan. Tanpa langkah kedua,
       * menjalankan ulang tugas yang sama gagal karena portnya masih terpakai,
       * dan penyebabnya tidak terlihat dari mana pun.
       */
      await cmd.tasksKill(id);
      await cmd.ptyKill(id).catch(() => undefined);
      return `Proses ${id} dihentikan.`;
    },
  },

  /* ---------------- Sub-agents ---------------- */

  {
    spec: {
      name: 'run_subagent',
      description:
        'Jalankan satu subagent untuk tugas mandiri, dan kembalikan ringkasannya. Subagent TIDAK punya ingatan percakapan ini, jadi tulis instruksinya lengkap: apa yang dicari, di mana, dan dalam bentuk apa jawabannya.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Instruksi lengkap untuk subagent.' },
          type: { type: 'string', description: 'Jenis subagent.' },
          description: { type: 'string', description: 'Label singkat untuk kartunya.' },
        },
        required: ['prompt'],
      },
    },
    run: async (a) => {
      const prompt = wajib(a, 'prompt');
      return potong(await jalankanSubagent([prompt]));
    },
  },

  {
    spec: {
      name: 'run_subagents',
      description:
        'Jalankan beberapa subagent SEKALIGUS, masing-masing dengan tugas mandiri. Jauh lebih cepat daripada memanggil run_subagent berulang kali. Beri setiap subagent kumpulan berkas yang TIDAK tumpang tindih.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: 'Daftar tugas.',
            items: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['prompt'],
            },
          },
        },
        required: ['tasks'],
      },
    },
    run: async (a) => {
      const tugas = Array.isArray(a.tasks) ? a.tasks : [];
      if (!tugas.length) throw new Error('ERROR: tasks kosong.');
      const prompts = tugas.map((t) => String((t as Record<string, unknown>).prompt ?? '').trim()).filter(Boolean);
      if (!prompts.length) throw new Error('ERROR: tidak ada tugas yang punya "prompt".');
      return potong(await jalankanSubagent(prompts));
    },
  },

  /* ---------------- Tasks & Notes ---------------- */

  /*
   * ── Language-server queries ────────────────────────────────────────────────
   *
   * Why these exist next to `grep` and `glob`: those two match TEXT, and text is
   * a poor stand-in for code. Asking for `lsp_references` on a function returns
   * the calls; asking `grep` returns the calls, the definition, every comment
   * that mentions the name, and any string containing it — leaving the agent to
   * read them all and guess. That difference is the reason this block is here.
   *
   * All five are `read` effect, none can write. A `lsp_rename` would be a
   * workspace-wide edit the reader never saw, and deliberate changes already go
   * through the diff-review path.
   *
   * Every one degrades to a plain sentence when no language server is available
   * for the file. That matters: an agent told "no results" concludes the symbol
   * does not exist, where the truth may be that nobody was asked.
   */
  {
    spec: {
      name: 'lsp_symbols',
      description:
        'Daftar simbol (fungsi, kelas, metode, variabel) di sebuah berkas, dengan jenis dan kedalamannya. Pakai ini untuk memahami struktur berkas tanpa membacanya penuh. Berbasis language server, bukan pencarian teks.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas.' },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const r = await lspSymbols(path);
      if (!r.ok) return r.pesan;
      if (r.hasil.length === 0) return `Tidak ada simbol yang dilaporkan untuk ${path}.`;
      return r.hasil
        .map((s) => `${'  '.repeat(Math.min(s.depth, 4))}${s.name} (${s.kind}) - baris ${s.line}`)
        .join('\n');
    },
  },

  {
    spec: {
      name: 'lsp_references',
      description:
        'Cari semua TEMPAT yang memakai simbol pada posisi tertentu. Berbasis language server: hasilnya pemakaian yang sebenarnya, bukan kemunculan teks. Pakai sebelum mengubah tanda tangan fungsi atau menghapus simbol, untuk tahu apa saja yang akan terdampak.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas yang memuat simbolnya.' },
          line: { type: ['number', 'string'], description: 'Baris simbol, dihitung dari 1.' },
          column: { type: ['number', 'string'], description: 'Kolom simbol, dihitung dari 1.' },
          includeDeclaration: {
            type: ['boolean', 'string'],
            description: 'Ikutkan baris deklarasinya. Bawaan: tidak.',
          },
        },
        required: ['path', 'line'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const pos = { line: bacaAngka(a.line) ?? 1, column: bacaAngka(a.column) ?? 1 };
      const r = await lspRefs(path, pos, bacaBool(a.includeDeclaration));
      if (!r.ok) return r.pesan;
      if (r.hasil.length === 0) {
        return `Tidak ada pemakaian lain yang dilaporkan untuk simbol di ${path}:${pos.line}:${pos.column}.`;
      }
      return (
        `${r.hasil.length} pemakaian:\n` +
        r.hasil.map((l) => `${l.file}:${l.line}:${l.column}  ${l.teks ?? ''}`.trimEnd()).join('\n')
      );
    },
  },

  {
    spec: {
      name: 'lsp_call_hierarchy',
      description:
        'Siapa yang MEMANGGIL fungsi pada posisi tertentu, dan fungsi itu memanggil apa. Berbeda dari lsp_references: yang itu mengembalikan LOKASI pemakaian, yang ini mengembalikan FUNGSI yang memuatnya, sudah bernama. Pakai untuk memahami alur sebelum mengubah perilaku - "kalau aku ubah ini, siapa yang terpengaruh" dan "ini bergantung pada apa".',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas yang memuat fungsinya.' },
          line: { type: ['number', 'string'], description: 'Baris NAMA fungsi, dihitung dari 1.' },
          column: { type: ['number', 'string'], description: 'Kolom NAMA fungsi, dihitung dari 1.' },
        },
        required: ['path', 'line'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const pos = { line: bacaAngka(a.line) ?? 1, column: bacaAngka(a.column) ?? 1 };
      const r = await lspCallHierarchy(path, pos);
      if (!r.ok) return r.pesan;

      /*
       * Both directions in one answer, and said plainly when one is empty.
       *
       * "No callers" and "the server said nothing" look identical if the
       * section is just omitted, and an agent reading a missing section
       * concludes the function is unused — which is the wrong conclusion to
       * draw from a server that does not implement this.
       */
      const bagian = (judul: string, daftar: { file: string; line: number; column: number; teks?: string }[]) =>
        daftar.length === 0
          ? `${judul}: tidak ada.`
          : `${judul} (${daftar.length}):\n` +
            daftar.map((l) => `  ${l.file}:${l.line}:${l.column}  ${l.teks ?? ''}`.trimEnd()).join('\n');

      return (
        `${r.simbol}\n\n` +
        bagian('Dipanggil oleh', r.pemanggil) +
        '\n\n' +
        bagian('Memanggil', r.dipanggil)
      );
    },
  },

  {
    spec: {
      name: 'lsp_definition',
      description:
        'Lokasi definisi simbol pada posisi tertentu, menurut language server. Lebih tepat daripada mencari nama dengan grep, terutama saat nama yang sama dipakai di banyak tempat.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas yang memuat simbolnya.' },
          line: { type: ['number', 'string'], description: 'Baris simbol, dihitung dari 1.' },
          column: { type: ['number', 'string'], description: 'Kolom simbol, dihitung dari 1.' },
        },
        required: ['path', 'line'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const pos = { line: bacaAngka(a.line) ?? 1, column: bacaAngka(a.column) ?? 1 };
      const r = await lspDef(path, pos);
      if (!r.ok) return r.pesan;
      if (r.hasil.length === 0) return `Definisi tidak ditemukan untuk simbol di ${path}:${pos.line}.`;
      return r.hasil.map((l) => `${l.file}:${l.line}:${l.column}\n  ${l.teks ?? ''}`).join('\n');
    },
  },

  {
    spec: {
      name: 'lsp_hover',
      description:
        'Tipe dan dokumentasi simbol pada posisi tertentu, seperti yang muncul saat kursor diarahkan di editor. Pakai untuk mengetahui tanda tangan fungsi atau tipe variabel tanpa membaca seluruh berkas.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas.' },
          line: { type: ['number', 'string'], description: 'Baris, dihitung dari 1.' },
          column: { type: ['number', 'string'], description: 'Kolom, dihitung dari 1.' },
        },
        required: ['path', 'line'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const pos = { line: bacaAngka(a.line) ?? 1, column: bacaAngka(a.column) ?? 1 };
      const r = await lspHover(path, pos);
      if (!r.ok) return r.pesan;
      return r.teks.trim() || `Tidak ada informasi tipe untuk simbol di ${path}:${pos.line}.`;
    },
  },

  {
    spec: {
      name: 'lsp_diagnostics',
      description:
        'Galat dan peringatan yang dilaporkan language server untuk sebuah berkas. Pakai setelah mengubah kode, untuk memeriksa hasilnya dengan alat yang sama yang dipakai editor - bukan dengan menebak dari isi berkas.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Jalur berkas.' },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const r = await lspDiagnostics(path);
      if (!r.ok) return r.pesan;
      if (r.hasil.length === 0) {
        return `Tidak ada galat atau peringatan yang dilaporkan untuk ${path}.`;
      }
      const jumlah = r.hasil.filter((d) => d.severity === 'error').length;
      return (
        `${r.hasil.length} masalah (${jumlah} galat):\n` +
        r.hasil
          .map((d) => `${d.line}:${d.column} [${d.severity}] ${d.pesan} (${d.sumber})`)
          .join('\n')
      );
    },
  },

  /*
   * `skill_view` — the tool the prompt has been promising all along.
   *
   * `skills.rs` injects a list of available skills into the system prompt with
   * the line "read one with the skill_view tool before starting work it
   * matches". That tool did not exist: it was named in the prompt, absent from
   * every registry, so an agent that followed the instruction got an unknown
   * tool back and either gave up or invented the skill's contents. The list was
   * real and the reader was pointed at a door that was not there.
   *
   * Read-only by construction. A skill is CONTENT the agent reads; nothing here
   * changes what the agent is allowed to do, and a skill whose body says "run
   * the deploy script" still goes through the same tool gate as the reader
   * typing that command.
   */
  {
    spec: {
      name: 'skill_view',
      description:
        'Baca isi sebuah skill yang terdaftar di daftar AVAILABLE SKILLS. Pakai sebelum menjalankan pekerjaan yang cocok dengan deskripsi skill itu. Tanpa argumen name, kembalikan daftar skill beserta deskripsinya.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nama skill, persis seperti di daftar AVAILABLE SKILLS.',
          },
        },
      },
    },
    run: async (a) => {
      const daftar = await cmd.skillsList().catch(() => []);
      const nama = typeof a.name === 'string' ? a.name.trim() : '';

      if (!nama) {
        if (daftar.length === 0) {
          return 'Belum ada skill yang terpasang. Skill disimpan di .zephyr/skills/<nama>/ (workspace) atau folder data Zephyr (global).';
        }
        return daftar
          .map((s) => `- ${s.name} [${s.scope}]: ${s.description || '(tanpa deskripsi)'}`)
          .join('\n');
      }

      /*
       * Resolve by NAME across both scopes before reading, so the path handed to
       * `skill_read` is one the backend just listed. Passing the model's string
       * straight through would let it probe names that do not exist, and the
       * error it got back would be indistinguishable from a real skill whose
       * file had been deleted.
       */
      const kunci = nama.toLowerCase();
      const ketemu = daftar.find((s) => s.name.toLowerCase() === kunci);
      if (!ketemu) {
        const mirip = daftar
          .filter((s) => s.name.toLowerCase().includes(kunci) || kunci.includes(s.name.toLowerCase()))
          .map((s) => s.name)
          .slice(0, 5);
        return mirip.length > 0
          ? `Skill "${nama}" tidak ada. Yang mirip: ${mirip.join(', ')}.`
          : `Skill "${nama}" tidak ada. Skill yang terpasang: ${daftar.map((s) => s.name).join(', ') || '(tidak ada)'}.`;
      }

      const isi = await cmd.skillRead(ketemu.name).catch((e) => {
        return `Gagal membaca skill "${ketemu.name}": ${String(e)}`;
      });
      return potong(isi);
    },
  },

  {
    spec: {
      name: 'todo_write',
      description:
        'Ganti daftar tugas agen untuk pekerjaan ini. Pakai untuk memecah tugas berlapis menjadi langkah kecil. Kirim daftar LENGKAP setiap kali - ini mengganti, bukan menambah.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'Daftar tugas lengkap.',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description:
                    'Id tetap untuk tugas ini. Saat mengubah status tugas yang SUDAH ada, kirim idnya saja - teksnya tidak perlu diulang.',
                },
                title: {
                  type: 'string',
                  description: 'Teks tugas. Diperlukan untuk tugas BARU; untuk tugas yang sudah ada cukup idnya.',
                },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
              required: ['status'],
            },
          },
        },
        required: ['todos'],
      },
    },
    run: async (a) => {
      const daftar = Array.isArray(a.todos) ? a.todos : [];
      const bersih = daftar.map((t, i) => {
        const x = t as Record<string, unknown>;
        /*
         * Medannya bernama `content`, bukan `title`.
         *
         * `setAgentTodos` menyaring entri yang `content`-nya kosong - dan
         * penyaring itu benar: baris tugas tanpa teks tidak ada gunanya. Tapi
         * artinya mengirim `title` saja membuat SELURUH daftar tersaring habis,
         * dan hasilnya kartu tugas yang tidak pernah muncul walaupun toolnya
         * melaporkan sukses.
         *
         * Karena itu `title` tetap diterima sebagai jalan masuk yang wajar
         * (model sering memakai nama itu), lalu dipetakan ke `content`.
         */
        return {
          /* Id wajib. Tanpa id, daftar dipasangkan ke URUTAN, dan karena urutan
             berubah setiap putaran, tanda centang dan durasi melompat ke tugas
             yang salah. Kalau model tidak memberi id, nomornya dibuat di sini -
             lebih baik daripada membiarkannya kosong. */
          id: x.id ? String(x.id) : `t${i + 1}`,
          /*
           * Teksnya BOLEH kosong - dan itu bukan kelalaian.
           *
           * Baris ini dulu selalu menulis string, jadi entri `{id, status}`
           * (cara paling wajar menandai tugas selesai) tiba di setAgentTodos
           * dengan `content: ''` dan tersaring habis. Akibatnya to-do list
           * TIDAK PERNAH bisa ditandai selesai, dan toolnya melaporkan gagal
           * untuk panggilan yang sebenarnya benar.
           *
           * `undefined` dikirim apa adanya supaya setAgentTodos bisa mengambil
           * teksnya dari tugas yang sudah ada lewat id. Perhatikan: `??` tidak
           * cukup di sana - `''` bukan null, jadi cadangannya tidak akan
           * terpakai. Yang harus hilang adalah string kosongnya sendiri.
           */
          content: (String(x.content ?? x.title ?? '').trim() || undefined) as string,
          status: String(x.status ?? 'pending'),
        };
      });
      const diterima = useAi.getState().setAgentTodos(bersih);
      const selesai = bersih.filter(
        (t) => t.status === 'done' || t.status === 'completed',
      ).length;
      /*
       * Kalau tidak ada satu pun yang diterima, itu bukan sukses - dan
       * melaporkannya sebagai sukses adalah cara paling halus membuat agen
       * mengulang panggilan yang sama tanpa henti. Sebutkan sebabnya.
       */
      if (bersih.length > 0 && diterima === 0) {
        throw new Error(
          'ERROR: tidak ada tugas yang diterima karena teksnya kosong. ' +
            'Isi medan "title" atau "content" pada setiap tugas.',
        );
      }
      const dipangkas = todoTerpangkas();
      return (
        `Daftar tugas diperbarui: ${diterima} tugas, ${selesai} selesai.` +
        (dipangkas > 0
          ? ` PERINGATAN: ${dipangkas} tugas terakhir TIDAK disimpan karena batas ${MAX_TODOS} tugas per panggilan - kirim sisanya di panggilan berikutnya supaya tidak ada langkah yang hilang.`
          : '')
      );
    },
  },

  {
    spec: {
      name: 'notes_read',
      description:
        'Baca catatan dan preferensi yang tersimpan tentang user. Baca dulu sebelum menulis, supaya tidak menimpa atau menggandakan yang sudah ada.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    run: async () => {
      const m = await cmd.memoryRead();
      const bagian = [
        `=== memori (${m.memory_chars}/${m.memory_limit} karakter) ===\n${m.memory || '(kosong)'}`,
        `=== catatan tentang user (${m.user_chars}/${m.user_limit} karakter) ===\n${m.user || '(kosong)'}`,
      ];
      return potong(bagian.join('\n\n'));
    },
  },

  {
    spec: {
      name: 'notes_write',
      description:
        'Ubah catatan yang tersimpan tentang user. Ini TIDAK bisa dibaca-tulis sebagian: kirim bentuk lengkap yang kamu inginkan, bukan tambahannya.',
      parameters: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'replace', 'remove'] },
          section: { type: 'string', enum: ['memory', 'user'], description: 'Bagian yang diubah.' },
          content: { type: 'string', description: 'Teks untuk add, atau teks pengganti untuk replace.' },
          oldText: { type: 'string', description: 'Teks yang dicari, untuk replace dan remove.' },
        },
        required: ['op', 'section'],
      },
    },
    run: async (a) => {
      const op = wajib(a, 'op') as 'add' | 'replace' | 'remove';
      const section = wajib(a, 'section') as 'memory' | 'user';
      if ((op === 'replace' || op === 'remove') && !a.oldText) {
        throw new Error(`ERROR: op "${op}" butuh argumen "oldText" - sebutkan teks yang mau dicari.`);
      }
      const pesan = await cmd.memoryWrite({
        section,
        action: op,
        content: a.content ? String(a.content) : undefined,
        oldText: a.oldText ? String(a.oldText) : undefined,
      });
      return pesan || `Catatan diperbarui: ${op} pada ${section}.`;
    },
  },

  /* ---------------- Schedules ---------------- */

  {
    spec: {
      name: 'schedule_command',
      description:
        'Jadwalkan perintah untuk dijalankan nanti, di terminal aplikasi ini. Untuk sekali jalan setelah sekian detik, isi delaySeconds. Untuk berulang, isi everyMinutes atau atHour.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah yang dijadwalkan.' },
          delaySeconds: { type: ['number', 'string'], description: 'Sekali jalan, setelah sekian detik.' },
          everyMinutes: { type: ['number', 'string'], description: 'Berulang setiap sekian menit.' },
          atHour: { type: ['number', 'string'], description: 'Berulang setiap jam ini (0-23).' },
          label: { type: 'string', description: 'Nama pendek untuk dikenali.' },
        },
        required: ['command'],
      },
    },
    run: async (a) => {
      const command = wajib(a, 'command');
      /* Jadwal menyimpan perintah untuk dijalankan NANTI, tanpa agen di
         sekitarnya. Pembatas yang berlaku di bash_run harus berlaku di sini
         juga - kalau tidak, satu panggilan schedule_command menjadi jalan
         memutar untuk menjalankan apa pun. */
      periksaPerintah(command);
      const delay = bacaAngka(a.delaySeconds);
      const every = bacaAngka(a.everyMinutes);
      const jam = bacaAngka(a.atHour);
      if (delay === undefined && every === undefined && jam === undefined) {
        throw new Error(
          'ERROR: tentukan kapan perintah dijalankan - isi delaySeconds, everyMinutes, atau atHour.',
        );
      }

      /*
       * `cron_create` Rust hanya mengenal penjadwalan BERULANG (every_minutes
       * atau at_hour). Sekali jalan tidak bisa disimpan apa adanya, jadi
       * diterjemahkan: jalankan sekali setelah N detik, lalu matikan dirinya
       * sendiri. Bunyi perintahnya dibuat eksplisit supaya user bisa melihat
       * tujuan aslinya di daftar jadwal.
       */
      if (delay !== undefined && every === undefined && jam === undefined) {
        const menit = Math.max(1, Math.round(delay / 60));
        const job = await cmd.cronCreate({
          name: a.label ? String(a.label) : `sekali: ${command.slice(0, 40)}`,
          command,
          everyMinutes: menit,
        });
        const sampai = new Date(Date.now() + delay * 1000).toLocaleString();
        return (
          `Jadwal dibuat dengan id ${job.id}.\n` +
          `Perintah akan dijalankan sekali sekitar ${sampai} (${delay} detik dari sekarang).\n` +
          'Catatan: mesin penjadwal aplikasi ini berulang, jadi entri ini akan tetap terdaftar. ' +
          `Hapus dengan cancel_schedule (id ${job.id}) setelah perintahnya berjalan.`
        );
      }

      const job = await cmd.cronCreate({
        name: a.label ? String(a.label) : `berulang: ${command.slice(0, 40)}`,
        command,
        everyMinutes: every,
        atHour: jam,
      });
      const pola =
        every !== undefined ? `setiap ${every} menit` : `setiap jam ${jam}:00`;
      return `Jadwal dibuat dengan id ${job.id}: ${pola}.`;
    },
  },

  {
    spec: {
      name: 'list_schedules',
      description: 'Daftar perintah yang terjadwal. Read-only.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    run: async () => {
      const daftar = await cmd.cronList();
      if (!daftar.length) return 'Tidak ada jadwal.';
      return daftar.map((c) => formatJadwal(c)).join('\n');
    },
  },

  {
    spec: {
      name: 'cancel_schedule',
      description: 'Batalkan sebuah perintah terjadwal berdasarkan id-nya.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Id jadwal dari list_schedules.' } },
        required: ['id'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'id');
      await cmd.cronDelete(id);
      return `Jadwal ${id} dibatalkan.`;
    },
  },

  /* ---------------- Terminal ---------------- */

  {
    spec: {
      name: 'suggest_command',
      description:
        'SARAN, bukan eksekusi: tampilkan satu perintah shell sebagai kartu di panel AI, dengan tombol Insert supaya user sendiri yang menjalankannya. Pakai ini kalau user minta perintah atau menanyakan cara melakukan sesuatu di terminal. JANGAN pakai ini untuk menjalankan sesuatu - untuk itu ada bash_run.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah lengkap yang disarankan, siap tempel.' },
          alasan: { type: 'string', description: 'Satu kalimat: apa yang dilakukan perintah ini.' },
        },
        required: ['command'],
      },
    },
    run: async (a) => {
      const command = wajib(a, 'command');
      if (/[\r\n]/.test(command)) {
        /*
         * Satu baris saja. Perintah multi-baris yang ditempel ke terminal
         * dijalankan baris demi baris, dan user tidak pernah melihat mana yang
         * dimaksud sebagai satu perintah.
         */
        throw new Error('ERROR: suggest_command menerima SATU baris perintah; kirim perintah majemuk dengan && atau ;.');
      }
      const alasan = String(a.alasan ?? '').trim();
      useAi.getState().setCommandSuggestion({ command, alasan: alasan || undefined });
      return `Kartu saran ditampilkan (belum dijalankan): ${command}${alasan ? `\nAlasan: ${alasan}` : ''}`;
    },
  },

  {
    spec: {
      name: 'get_terminal_output',
      description:
        'Baca potongan TERAKHIR dari scrollback terminal yang sedang aktif - keluaran yang sudah terlihat di layar. Pakai untuk memeriksa hasil perintah yang baru dijalankan. Terminal private tidak bisa dibaca dan akan menjawab demikian.',
      parameters: {
        type: 'object',
        properties: {
          lines: { type: ['number', 'string'], description: 'Jumlah baris terakhir, default 80.' },
          paneId: { type: 'string', description: 'ID pane tertentu; kosongkan untuk pane yang sedang aktif.' },
        },
        required: [],
      },
    },
    run: async (a) => {
      /*
       * `terminalStore` di-import DINAMIS, bukan di puncak berkas.
       *
       * Store itu menarik xterm, yang hanya jalan di browser. Import statis di
       * sini membuat seluruh rantai `agentTools -> builtins -> terminalStore`
       * gagal dimuat di Node (`self is not defined`), dan itu mematikan
       * `scripts/verify-tools-runtime.mjs` yang menjalankan bundel di Node
       * untuk memeriksa tool yang benar-benar terpasang.
       */
      const { useTerminal } = await import('../terminalStore');
      const t = useTerminal.getState();
      const tab = t.terminalTabs.find((x) => x.id === t.activeTabId);
      const targetId = String(a.paneId ?? '') || tab?.activePaneId || tab?.panes[0]?.id;
      if (!targetId) return 'Tidak ada terminal yang aktif.';
      const pane = t.allPanes().find((p) => p.id === targetId);
      if (pane?.kind === 'private') {
        /*
         * Terminal private menjanjikan scrollback yang tidak disimpan -
         * itu alasan mode ini ada. Membacanya lewat tool akan membatalkan
         * janji itu, jadi jawabannya menolak dengan menyebut alasannya.
         */
        return 'Pane ini terminal private: scrollback-nya sengaja tidak dibaca oleh agen.';
      }
      const baris = Math.min(500, Math.max(1, bacaAngka(a.lines, 80) ?? 80));
      const teks = await cmd.ptyTail(targetId, baris).catch(() => '');
      if (!teks.trim()) return `Terminal ${targetId}: (belum ada keluaran).`;
      return potong(`Terminal ${targetId}, ${baris} baris terakhir:\n${teks}`);
    },
  },

  {
    spec: {
      name: 'open_preview',
      description:
        'Buka pratinjau halaman lokal di pane browser - untuk melihat hasil dev server (localhost). Hanya alamat localhost/127.0.0.1 yang diterima; alamat luar pakai browser_open.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Alamat localhost, mis. http://localhost:5173.' },
        },
        required: ['url'],
      },
    },
    run: async (a) => {
      const raw = wajib(a, 'url').trim();
      const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
      let host = '';
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        throw new Error(`ERROR: alamat tidak valid: ${raw}`);
      }
      /*
       * Dibatasi localhost dengan sengaja. Pratinjau ada untuk memeriksa apa
       * yang baru saja dijalankan di mesin ini, dan membiarkannya menerima
       * alamat apa pun berarti ia menjadi jalan kedua - tanpa pemeriksaan
       * izin - menuju internet lewat pane browser.
       */
      const lokal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.endsWith('.localhost');
      if (!lokal) {
        throw new Error(`ERROR: open_preview hanya untuk alamat localhost. Untuk ${host}, pakai browser_open.`);
      }
      /*
       * Memakai `addPane` yang SAMA dengan `browser_open`. Menulis koordinat
       * webview sendiri di sini akan membuat pane pratinjau berbeda perilaku
       * dari pane browser biasa - dan perbedaan itu hanya muncul di layar,
       * bukan di uji.
       */
      const { useTerminal } = await import('../terminalStore');
      const t = useTerminal.getState();
      const sudah = t.allPanes().find((p) => p.kind === 'browser' && p.url === url);
      if (sudah) return `Pratinjau ${url} sudah terbuka di pane ${sudah.id}.`;
      const paneId = await t.addPane('browser', { url });
      if (!paneId) {
        return `Tidak bisa membuka pane pratinjau: ${useTerminal.getState().toast ?? 'batas pane tercapai'}.`;
      }
      return `Pratinjau localhost dibuka (pane ${paneId}): ${url}`;
    },
  },

  /* ---------------- Penalaran (pola OpenJarvis) ---------------- */

  {
    spec: {
      name: 'think',
      description:
        'Catat penalaran selangkah sebelum bertindak: apa yang diketahui, apa yang belum, dan rencana langkah berikutnya. Tidak menyentuh apa pun - hanya membuat rencanamu terlihat di transkrip supaya bisa diperiksa. Pakai sebelum rangkaian tool yang panjang atau keputusan yang sulit dibalik.',
      parameters: {
        type: 'object',
        properties: {
          thought: { type: 'string', description: 'Penalaranmu: fakta, keraguan, dan rencana.' },
        },
        required: ['thought'],
      },
    },
    run: async (a) => {
      const thought = wajib(a, 'thought');
      return potong(`[pemikiran tercatat]\n${thought}`);
    },
  },

  {
    spec: {
      name: 'calculator',
      description:
        'Hitung ekspresi aritmetika secara deterministik: tambah, kurang, kali, bagi, pangkat, persen, dan tanda kurung. Pakai ini daripada menghitung di kepala - model sering salah pada angka besar atau desimal bertingkat. Hanya angka dan operator, bukan kode.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Ekspresi, mis. (1200 * 1.11) + 45.' },
        },
        required: ['expression'],
      },
    },
    run: async (a) => hitungAman(wajib(a, 'expression')),
  },

  {
    spec: {
      name: 'ask_user',
      description:
        'Ajukan SATU pertanyaan pilihan kepada user dan tunggu jawabannya, saat keputusan benar-benar ambigu dan salah tebak membuang kerja (mis. pilihan arsitektur, menghapus berkas, jalur yang tidak bisa dibalik). Jangan pakai untuk hal yang bisa kamu putuskan sendiri dari konteks - lanjutkan saja dengan default yang wajar. Satu pertanyaan per pemanggilan.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Pertanyaan singkat dan konkret.' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '2-4 pilihan jawaban singkat untuk user pilih.',
          },
        },
        required: ['question'],
      },
    },
    run: async (a) => {
      const pertanyaan = wajib(a, 'question');
      const opsi = Array.isArray(a.options) ? a.options.map((x) => String(x)).slice(0, 4) : [];
      /*
       * The UI card, the resolver and the store action already existed; only the
       * TOOL was missing, so the model could never reach any of it and the
       * button was dead code. This is the wiring that connects them.
       */
      const jawaban = await useAi.getState().agentAjukanTanya(pertanyaan, opsi);
      if (jawaban === null) return '[user did not answer — proceed with your best judgement, or stop and report]';
      return `[jawaban user]: ${jawaban}`;
    },
  },

  /*
   * Progressive tool disclosure (the Hermes `tool_search` pattern).
   *
   * Sending every tool on every request is expensive: the 50+ tool schemas cost
   * ~22 KB per call, more than the entire conversation, and on a slow gateway
   * that size is what turns a round-trip into a stall or a 502. So only the CORE
   * tools go out every time; the rest are found here and invoked through
   * `tool_call`. The model searches by intent, reads the schema it gets back,
   * then calls. Nothing is hidden from the model it cannot reach - it is one
   * hop away instead of always-on.
   */
  {
    spec: {
      name: 'tool_search',
      description:
        'Cari tool yang TIDAK ada di daftar utamamu. Sebagian besar kemampuan (web, browser, SSH, MCP, jadwal, catatan, preview) tidak dikirim setiap saat; pakai ini untuk menemukannya dengan kata kunci, lalu panggil lewat tool_call. Contoh query: "buka halaman web", "jalankan di browser", "jadwalkan perintah", "ssh", "tangkap layar".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci kemampuan yang dicari, bahasa bebas.' },
          limit: { type: 'number', description: 'Maksimum hasil (default 8).' },
        },
        required: ['query'],
      },
    },
    run: async (a) => {
      const query = wajib(a, 'query');
      const limit = Math.min(20, Math.max(1, Number(a.limit) || 8));
      const ditemukan = await cariToolTerdefer(query, limit);
      if (ditemukan.length === 0) {
        return `Tidak ada tool yang cocok dengan "${query}". Coba kata kunci lain (mis. "web", "browser", "schedule", "notes", "ssh").`;
      }
      return ditemukan
        .map(
          (t) =>
            `- ${t.nama}: ${t.deskripsi}\n  args: ${JSON.stringify(t.params)}`,
        )
        .join('\n');
    },
  },

  {
    spec: {
      name: 'tool_call',
      description:
        'Panggil tool yang kamu temukan lewat tool_search (tool yang tidak dikirim setiap saat). Sebutkan nama tool persis dan argumennya sesuai skema yang kamu lihat di hasil tool_search.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama tool persis seperti di hasil tool_search.' },
          args: { type: 'object', description: 'Argumen tool, sesuai skemanya.' },
        },
        required: ['name'],
      },
    },
    run: async (a) => {
      const nama = wajib(a, 'name');
      const args = (a.args && typeof a.args === 'object' ? a.args : {}) as Record<string, unknown>;
      /*
       * Import is deferred to avoid a cycle: agentTools imports the builtin
       * table, so reaching back at module load would be circular. At call time
       * the module is fully initialized.
       */
      const { jalankanAgentTool } = await import('../agentTools');
      return await jalankanAgentTool(nama, args);
    },
  },

  /* ---------------- Pengetahuan diri ---------------- */

  {
    spec: {
      name: 'zephyr_self',
      description:
        'Cari fakta tentang ZEPHYR SENDIRI dari indeks yang ikut terpasang di aplikasi ini: label antarmuka, nama setelan beserta nilai bawaannya, perintah palet, pintasan, tool, ekstensi bawaan, halaman dan seksi Settings, port, dokumen yang dikirim bersama aplikasi (CHANGELOG, ARCHITECTURE, RELEASE_NOTES), dan peta kode (berkas -> simbol -> ringkasan satu baris). Pakai tool ini untuk pertanyaan soal Zephyr - jangan menebak, dan jangan meminta folder proyek ke user: indeksnya sudah ada di dalam aplikasi. Kosongkan kueri untuk melihat kategori yang tersedia beserta jumlahnya.',
      parameters: {
        type: 'object',
        properties: {
          kueri: {
            type: 'string',
            description:
              'Kata kunci. Boleh beberapa kata; setiap kata harus cocok (kunci atau isi fakta).',
          },
          kategori: {
            type: 'string',
            description:
              'Batasi ke satu kategori: label, setelan, pintasan, perintah, tool, ekstensi, seksi, port, dokumen, kode, bridge, atau semua.',
          },
          batas: {
            type: ['number', 'string'],
            description: 'Jumlah maksimum hasil (bawaan 8, maksimum 40).',
          },
        },
        required: [],
      },
    },
    run: async (a) => {
      /*
       * Indeks fakta dimuat di sini, bukan di kepala berkas: tabel `TOOL_BAWAAN`
       * dievaluasi saat aplikasi menyal, sementara isi indeks hanya berguna
       * kalau model benar-benar bertanya soal Zephyr.
       */
      const { cariFakta, formatHasil, hitungCocok, kategoriTersedia, versiFakta, kataTakDikenal, BATAS_HASIL_BAWAAN, BATAS_HASIL_MAKS } =
        await import('../zephyrCari');
      const kueri = String(a.kueri ?? '').trim();
      const kategori = String(a.kategori ?? 'semua').trim() as FaktaKategori | 'semua';
      const batas = Math.min(
        BATAS_HASIL_MAKS,
        Math.max(1, bacaAngka(a.batas, BATAS_HASIL_BAWAAN) ?? BATAS_HASIL_BAWAAN),
      );
      const versi = versiFakta();

      if (!kueri) {
        const daftar = kategoriTersedia()
          .map((k) => `${k.kategori} (${k.jumlah})`)
          .join(', ');
        return [
          `Indeks fakta Zephyr yang ikut terpasang: versi aplikasi ${versi.aplikasi}, hash sumber ${versi.hashSumber}.`,
          `Kategori: ${daftar}.`,
          'Kirim `kueri` (boleh beberapa kata) dan opsional `kategori`.',
          'Isi berkas sumber TIDAK ikut pemasangan: yang ada di sini peta berkas -> simbol dan ringkasan. Kalau user memang membuka folder proyek Zephyr, isi berkasnya bisa dibaca lewat read_file; kalau tidak, jawab dari peta ini dan sebutkan batasnya.',
        ].join('\n');
      }

      const hasil = cariFakta(kueri, { kategori, batas });
      if (!hasil.length) {
        const petunjuk = kategoriTersedia()
          .map((k) => `${k.kategori}(${k.jumlah})`)
          .join(', ');
        const takDikenal = kataTakDikenal(kueri);
        const catatan = takDikenal.length
          ? ` Kata ini tidak ada di fakta Zephyr: ${takDikenal.join(', ')} - jadi kemungkinan besar yang kamu cari memang belum ada. Jangan mengarang jawabannya.`
          : '';
        return `Tidak ada fakta yang cocok dengan "${kueri}".${catatan} Kategori yang bisa dicari: ${petunjuk}. Coba kata kunci lain, atau satu kata saja.`;
      }
      const total = hitungCocok(kueri, kategori);
      const barisCatatan: string[] = [];
      const takDikenal = kataTakDikenal(kueri);
      if (takDikenal.length) {
        barisCatatan.push(
          `Catatan: kata ${takDikenal.join(', ')} tidak ada di fakta Zephyr - kemungkinan besar yang kamu cari memang belum ada. Jangan mengarang.`,
        );
      }
      if (hasil.some((h) => h.longgar)) {
        barisCatatan.push(
          'Catatan: hasil di bawah ini cocok SEBAGIAN saja (tidak semua kata kueri cocok) - pakai sebagai petunjuk arah, bukan bukti.',
        );
      }
      return [
        `${hasil.length} dari ${total} fakta cocok (indeks versi ${versi.aplikasi}, hash sumber ${versi.hashSumber}).`,
        ...barisCatatan,
        formatHasil(hasil),
      ].join('\n');
    },
  },
];

/* ------------------------------------------------------------------ */
/* Bantuan                                                            */
/* ------------------------------------------------------------------ */

function formatJadwal(c: cmd.CronJob): string {
  const kapan =
    c.at_hour !== null && c.at_hour !== undefined
      ? `setiap jam ${c.at_hour}:00`
      : `setiap ${c.every_minutes} menit`;
  const hidup = c.enabled ? '' : ' (nonaktif)';
  return `${c.id}  ${kapan}  ${c.name}  ->  ${c.command}${hidup}`;
}

/**
 * Kumpulkan berkas yang cocok, untuk `search_replace`.
 *
 * Cara yang dipakai: sisir workspace lewat daftar cepat, saring dengan glob,
 * lalu biarkan Rust yang memutuskan berkas mana yang benar-benar cocok. Ini
 * menghindari membaca setiap berkas di sisi JS - pada repo besar itu jauh lebih
 * lambat dan menghabiskan memori tanpa alasan.
 */
async function kumpulkanBerkas(opsi: SearchOpts): Promise<string[]> {
  const semua = await cmd.listWorkspaceFiles(5000);
  const jalur = semua.map((f) => f.path);
  if (!opsi.include) return jalur;
  const re = polaKeRegex(opsi.include);
  /*
   * Cocokkan pada path ber-slash maju, bukan path mentah.
   *
   * `list_workspace_files` mengembalikan path Windows asli
   * (`D:\Testing\senja\index.html`), sementara glob model memakai `/`
   * (`senja/**` + /*.html). Regex dari `polaKeRegex` memakai `/` sebagai
   * pemisah literal, jadi ia TIDAK PERNAH cocok dengan path backslash -
   * sehingga `grep`/`replace_in_files` dengan glob selalu balik "tidak ada
   * hasil" walau polanya jelas ada. Terbukti di run live: model menyalahkan
   * grep ("tidak bisa dipercaya") lalu memboroskan belasan langkah menyisir
   * dengan PowerShell. Menormalkan ke `/` di sini membuat glob benar-benar
   * menyaring, dan path asli tetap dikembalikan supaya tool pembacanya
   * (searchGrep/searchReplace di backend) menerima bentuk yang ia harapkan.
   */
  return jalur.filter((p) => re.test(p.replace(/\\/g, '/')));
}

/** Ubah pola glob menjadi regex untuk penyaringan di sisi JS. */
function polaKeRegex(glob: string): RegExp {
  /* Beberapa pola digabung dengan `|` oleh `opsiCari`. Setiap pola diubah
     sendiri-sendiri lalu digabung kembali, supaya `|` tidak dibaca sebagai
     bagian dari satu pola. */
  const bagian = glob.split('|').filter(Boolean).map((g) => {
    const pola = g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Pola "bintang-bintang garis-miring" harus cocok dengan NOL folder atau
      // lebih. Ini perilaku glob standar: "senja" lalu bintang-ganda lalu
      // "*.html" menjangkau berkas langsung di folder dasar MAUPUN di subfolder.
      // Versi lama menerjemahkan bintang-ganda lalu garis-miring terpisah
      // menjadi pola yang MEWAJIBKAN sedikitnya satu garis-miring, jadi berkas
      // yang persis di folder dasar tak pernah cocok - padahal itu bentuk glob
      // paling umum yang ditulis model. Ditangani sebagai satu unit, memakai
      // sentinel supaya tidak tertimpa oleh aturan bintang di bawahnya.
      .replace(/\*\*\//g, '\u0001')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\?/g, '.')
      .replace(/\u0000/g, '.*')
      .replace(/\u0001/g, '(?:.*/)?');
    return pola;
  });
  return new RegExp(`(?:${bagian.join('|')})$`, 'i');
}

/**
 * Isi LENGKAP sebuah berkas untuk keperluan penggantian teks.
 *
 * Sengaja memakai buffer editor lebih dulu, dengan alasan yang sama seperti
 * `bacaBerkas`. Berbeda dari `bacaBerkas`, fungsi ini TIDAK memotong:
 * penggantian yang dihitung dari isi yang terpotong akan menghapus sisanya.
 */
export async function bacaLengkap(path: string): Promise<string> {
  const tab = tabUntuk(path);
  if (tab) return tab.content ?? '';
  const hasil = await cmd.fsRead(path);
  return hasil.content;
}

/** Jumlah baris konteks di sekeliling tiap perubahan. Tiga baris adalah
 *  kebiasaan unified diff, dan cukup untuk melihat perubahan di mana. */
const KONTEKS_DIFF = 3;

/**
 * Hasilkan unified diff antara isi lama dan isi baru sebuah berkas.
 *
 * ## Kenapa ini ada
 *
 * Tool tulis dulu mengembalikan KALIMAT: "1 penggantian di src/a.ts.". Panel
 * AI sudah punya DiffViewer lengkap dengan gayanya, dan `kartuTool` sudah
 * menyiapkan tempatnya - tapi tempatnya tidak pernah terisi, karena yang
 * dikembalikan tool bukan diff. Akibatnya setiap perubahan berkas tampil
 * sebagai satu baris kalimat, dan tidak ada cara melihat APA yang berubah
 * tanpa membuka berkasnya sendiri.
 *
 * Syarat yang dipasang di `kartuTool` adalah `/@@ -\d+/`, jadi keluaran ini
 * memang harus berbentuk unified diff sungguhan - bukan ringkasan buatan
 * sendiri yang kebetulan mirip.
 *
 * ## Yang sengaja sederhana
 *
 * Perbandingan baris dilakukan per baris penuh (bukan algoritma LCS): satu
 * wilayah berubah dihitung dengan mencari awalan dan akhiran yang sama, lalu
 * sisanya ditandai sebagai buang/tambah. Untuk berkas sumber ini hasilnya sama
 * dengan diff sebenarnya, dan tidak perlu pustaka tambahan. Untuk berkas yang
 * barisnya diacak-acak, hasilnya lebih kasar - tapi tetap jujur: yang ditandai
 * memang benar berubah.
 *
 * Mengembalikan string kosong kalau tidak ada perbedaan, atau kalau salah satu
 * sisi kosong (berkas baru / berkas dikosongkan) - pemanggil yang memutuskan
 * cara menampilkan hal itu.
 */
export function buatDiff(path: string, lama: string, baru: string): string {
  if (lama === baru) return '';

  const barisLama = lama === '' ? [] : lama.split('\n');
  const barisBaru = baru === '' ? [] : baru.split('\n');

  /* Awalan yang sama. */
  let awal = 0;
  while (awal < barisLama.length && awal < barisBaru.length && barisLama[awal] === barisBaru[awal]) awal++;

  /* Akhiran yang sama, tidak melewati awalan. */
  let akhir = 0;
  while (
    akhir < barisLama.length - awal &&
    akhir < barisBaru.length - awal &&
    barisLama[barisLama.length - 1 - akhir] === barisBaru[barisBaru.length - 1 - akhir]
  ) {
    akhir++;
  }

  const buang = barisLama.slice(awal, barisLama.length - akhir);
  const tambah = barisBaru.slice(awal, barisBaru.length - akhir);

  /* Konteks diambil dari sekitarnya, dibatasi panjang berkas. */
  const konteksAwal = Math.max(0, awal - KONTEKS_DIFF);
  const konteksAkhirLama = Math.min(barisLama.length, barisLama.length - akhir + KONTEKS_DIFF);
  const konteksAkhirBaru = Math.min(barisBaru.length, barisBaru.length - akhir + KONTEKS_DIFF);

  const kepalaLama = awal - konteksAwal + buang.length + Math.max(0, konteksAkhirLama - (barisLama.length - akhir));
  const kepalaBaru = awal - konteksAwal + tambah.length + Math.max(0, konteksAkhirBaru - (barisBaru.length - akhir));

  const keluaran: string[] = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${konteksAwal + 1},${Math.max(kepalaLama, buang.length)} +${konteksAwal + 1},${Math.max(kepalaBaru, tambah.length)} @@`,
  ];

  for (let i = konteksAwal; i < awal; i++) keluaran.push(' ' + barisLama[i]);
  for (const b of buang) keluaran.push('-' + b);
  for (const t of tambah) keluaran.push('+' + t);
  for (let i = barisLama.length - akhir; i < konteksAkhirLama; i++) keluaran.push(' ' + barisLama[i]);

  return keluaran.join('\n');
}

/**
 * Jalankan satu atau beberapa subagent sekaligus, dan kembalikan ringkasannya.
 *
 * API `subagentStore.jalankan` mengambil daftar tugas, bukan satu per satu -
 * memanggilnya berkali-kali justru membuat beberapa gelombang yang berjalan
 * berurutan alih-alih paralel. Karena itu semua prompt digabung ke satu
 * panggilan, dan gelombang paralelnya terjadi di dalam store.
 *
 * `jalankan` mengembalikan JUMLAH agen yang dijalankan, bukan teksnya. Ringkasan
 * ada di `getState().ringkasan` setelah selesai. Membaca balikan fungsi sebagai
 * teks adalah kekeliruan yang pernah terjadi - angka 3 lalu dianggap hasil.
 */
async function jalankanSubagent(prompts: string[]): Promise<string> {
  const { useSubAgent } = await import('../subagentStore');
  await useSubAgent.getState().jalankan(prompts, { bersarang: true, kedalaman: 1 });
  const ringkasan = useSubAgent.getState().ringkasan;
  return ringkasan || '(subagent selesai, tidak ada ringkasan)';
}

/**
 * Tulis hasil edit, dengan menghormati buffer yang terbuka.
 *
 * Kalau berkasnya terbuka di editor, yang diperbarui adalah BUFFER-nya, bukan
 * langsung disk. Alasannya bisa dibalik: menulis disk di belakang buffer yang
 * terbuka membuat user melihat isi lama di layar, dan menyimpannya kemudian
 * akan menimpa perubahan agen tanpa peringatan apa pun.
 *
 * Kalau berkasnya TIDAK terbuka, tulisannya langsung ke disk.
 */
export async function tulis(path: string, isi: string): Promise<void> {
  /*
   * Snapshot BEFORE the write, so the turn's checkpoint can undo it.
   *
   * Here rather than at each tool that writes, because this is the single point
   * every agent write already goes through — including the ones a reader would
   * not think of as "an edit" (a create, a multi-edit, a rename target).
   * Recording at the call sites would mean remembering to add it to the next
   * one, and a checkpoint that silently skips a file is worse than none.
   *
   * Failures are swallowed inside `catatSebelumTulis`: the snapshot is a safety
   * net, and refusing to do the reader's work because the net could not be hung
   * would be the wrong trade.
   */
  await (await import('../checkpoint')).catat(path);

  const tab = tabUntuk(path);
  if (tab) {
    useStore.getState().updateTabContent(tab.id, isi);
    return;
  }
  await cmd.fsWrite(path, isi, undefined, undefined, { wasExisting: true });
}

/** Muat ulang tab kalau berkasnya sedang terbuka dan isinya berubah di disk. */
async function segarkanTab(path: string): Promise<void> {
  const tab = tabUntuk(path);
  if (tab) await useStore.getState().reloadTabFromDisk(path).catch(() => undefined);
}
