/**
 * Kendali jendela - jembatan antara tool Zeph AI dan jendela aplikasi.
 *
 * ## Kenapa berkas ini ada
 *
 * Sampai sekarang Zeph AI bisa menulis berkas, menjalankan shell, dan membuka
 * tab editor - tetapi ia TIDAK bisa memunculkan panel aplikasinya sendiri.
 * Pertanyaan seperti "buka Settings bagian Editor" atau "lihat panel Problems"
 * berakhir sebagai janji di dalam teks jawaban, bukan sebagai jendela yang
 * benar-benar terbuka, karena `run_command` hanya mengenal dua id hardcoded
 * (`terminal.new`, `closeActiveEditor`) dan melempar error untuk sisanya -
 * termasuk `workbench.action.togglePanel` dan seluruh id Settings.
 *
 * Dua akibatnya nyata dan keduanya buruk:
 *
 *   1. Model tidak bisa MEMUNCULKAN apa pun, jadi ia mengarang ("Settings sudah
 *      saya buka") atau menyerahkan langkah itu ke user.
 *   2. Karena tidak ada yang bisa dibuka, tidak ada juga yang bisa DILAPORKAN.
 *      Jawaban "sudah dibuka, bagian X aktif, nilai Y = Z" mustahil ditulis
 *      jujur tanpa membaca keadaan setelah aksi - dan itu yang dilakukan
 *      `ringkasJendela()` di bawah.
 *
 * Modul ini adalah satu-satunya penerjemah: setiap panel dan setiap bagian
 * Settings punya SATU nama, dan setiap nama punya jalur buka + jalur ringkas
 * keadaan. Menambah panel baru cukup menambah satu baris di peta - dan kalau
 * lupa, `Record<PanelTabId, ...>` menolak kompilasi (daftar yang bolong tidak
 * bisa dibangunkan diam-diam).
 *
 * ## Kenapa peta, bukan fungsi bercabang
 *
 * Peta literal (id -> perintah) sengaja dipakai supaya daftar kemampuan bisa
 * DIBACA oleh harness tanpa menjalankan aplikasi: `scripts/uji-tool-jendela.mjs`
 * membandingkan kunci peta ini dengan daftar resmi di `panelStore.ts` dan
 * `settingsStore.ts`, lalu gagal kalau ada satu panel/bagian yang tidak
 * terjangkau. Daftar yang dirakit lewat loop runtime tidak bisa diperiksa begitu.
 */
import { usePanel, type PanelTabId } from '../panelStore';
import { useSettingsUi, type SectionId } from '../settingsStore';
import { useTerminal } from '../terminalStore';
import { useStore } from '../store';
import type { TerminalTab } from '../types';
/* Tipe saja (dihapus saat build): bentuk hasil perintah Rust `window_capture`. */
import type { HasilTangkapLayar } from '../commands';

/* ------------------------------------------------------------------ */
/* 1. Peta resmi: panel                                                */
/* ------------------------------------------------------------------ */

/**
 * Setiap tab panel bawah -> id perintah yang membukanya.
 *
 * Nilainya BUKAN hiasan: `bukaPanel()` benar-benar menjalankan id itu lewat
 * `commandRegistry.runCommand`, sehingga perilakunya sama persis dengan menu
 * View > Panel dan Command Palette. Semua id di sini terdaftar di
 * `commandRegistry.ts` (diperiksa harness), jadi tidak ada nama panel yang
 * "ada di peta tetapi tidak bisa diklik".
 */
export const KONTROL_PANEL: Record<PanelTabId, string> = {
  problems: 'problemsPanel.focus',
  output: 'outputPanel.focus',
  debug: 'debugConsolePanel.focus',
  terminal: 'terminalPanel.focus',
  ports: 'portsPanel.focus',
};

/* ------------------------------------------------------------------ */
/* 2. Peta resmi: bagian Settings                                      */
/* ------------------------------------------------------------------ */

/**
 * Nilai `'store'` berarti bagian itu dibuka langsung oleh `bukaSetelan()`
 * (setActivity + setSettingsOpen + setSection), karena tidak ada perintah
 * palet khusus untuknya. Nilai lain adalah id perintah yang sudah ada dan
 * dijalankan lewat registry - jadi bagian yang punya pintasan resmi memakai
 * pintasan itu, dan tidak ada perilaku ganda antara menu dan tool.
 */
export const PEMBUKA_STORE = 'store';

export const KONTROL_SETELAN: Record<SectionId, string> = {
  general: 'view.settings',
  editor: PEMBUKA_STORE,
  theme: 'settings.theme',
  /* Icon themes: no command of its own, the section is opened by the store.
     `tests` used to sit here and is gone with the section - a door to a room
     that no longer exists is worse than no door. */
  icons: PEMBUKA_STORE,
  shortcuts: 'shortcut.list',
  agents: PEMBUKA_STORE,
  rules: PEMBUKA_STORE,
  subagent: PEMBUKA_STORE,
  permissions: PEMBUKA_STORE,
  extensions: 'settings.extensions',
  lsp: PEMBUKA_STORE,
  scm: PEMBUKA_STORE,
  mcp: PEMBUKA_STORE,
  devenv: PEMBUKA_STORE,
  devupdate: PEMBUKA_STORE,
  security: PEMBUKA_STORE,
  accessibility: PEMBUKA_STORE,
  ssh: PEMBUKA_STORE,
  memori: PEMBUKA_STORE,
  about: PEMBUKA_STORE,
};

export function daftarPanel(): PanelTabId[] {
  return Object.keys(KONTROL_PANEL) as PanelTabId[];
}

export function daftarSetelan(): SectionId[] {
  return Object.keys(KONTROL_SETELAN) as SectionId[];
}

/* ------------------------------------------------------------------ */
/* 3. Ringkasan keadaan - bagian yang membuat laporan bisa jujur        */
/* ------------------------------------------------------------------ */

/**
 * Keadaan jendela sekarang, sebagai satu baris yang bisa dibaca model.
 *
 * Dipanggil SESUDAH setiap aksi, dan hasilnya selalu ikut dikembalikan. Pola
 * "aku sudah membuka X" tanpa keadaan nyata adalah pola yang membuat model
 * membangun langkah berikutnya di atas asumsi; dengan baris ini, model membaca
 * panel mana yang aktif, tab mana yang terlihat, dan bagian setelan mana yang
 * benar-benar terpasang - bukan yang ia niatkan.
 */
export function ringkasJendela(): string {
  const s = useStore.getState();
  const p = usePanel.getState();
  const t = useTerminal.getState();
  const ui = useSettingsUi.getState();

  const tab = s.tabs.find((x) => x.id === s.activeTabId);
  const ttab = t.terminalTabs.find((x) => x.id === t.activeTabId);
  const setelan = s.settingsOpen ? `terbuka (bagian ${ui.section})` : 'tertutup';
  /*
   * NILAI NYATA, bukan nama medan. Bentuk jawaban yang diminta user adalah
   * "sudah dibuka, bagian X aktif, nilai Y = Z" - jadi ringkasan ini harus
   * memuat angka/teks yang benar-benar tersimpan di store, bukan sekadar
   * "setelan terbuka". `settings.general` adalah objek yang dibaca dan ditulis
   * panel Settings, sehingga nilai di sini sama dengan yang dilihat user.
   */
  const g = s.settings.general;

  return (
    'Keadaan: ' +
    `workspace=${s.workspace ?? '(belum ada folder)'}; ` +
    `editor aktif=${tab?.path ?? '(tidak ada tab)'}; ` +
    `panel aktif=${p.activeTab} (tab terlihat: ${p.visibleTabs.join(',') || '-'}); ` +
    `setelan=${setelan}; ` +
    `terminal tab=${ttab?.title ?? '(tidak ada)'} pane=${ttab?.panes.length ?? 0} layout=${ttab?.layout ?? '-'}; ` +
    `nilai: tema=${g.theme}; fontSize=${g.fontSize}; bahasa=${g.uiLang}; ` +
    `terminal=${g.defaultTerminal ?? 'default'}; restoreSession=${g.restoreSession}`
  );
}

/* ------------------------------------------------------------------ */
/* 4. Aksi: buka panel                                                 */
/* ------------------------------------------------------------------ */

export function panelDikenal(nama: string): nama is PanelTabId {
  return Object.prototype.hasOwnProperty.call(KONTROL_PANEL, nama);
}

export function setelanDikenal(nama: string): nama is SectionId {
  return Object.prototype.hasOwnProperty.call(KONTROL_SETELAN, nama);
}

/**
 * Buka tab panel bawah berdasarkan namanya, lalu laporkan keadaan nyata.
 *
 * Nama yang tidak dikenal DITOLAK, tidak diabaikan: mengembalikan sukses untuk
 * panel yang tidak ada adalah persis kegagalan yang membuat model percaya pada
 * langkah yang tidak pernah terjadi.
 */
export async function bukaPanel(which: string): Promise<string> {
  const nama = (which ?? '').trim();
  if (!panelDikenal(nama)) {
    throw new Error(
      `ERROR: panel "${which}" tidak dikenal. Panel yang ada: ${daftarPanel().join(', ')}.`,
    );
  }

  const perintah = KONTROL_PANEL[nama];
  const t = useTerminal.getState();
  if (!t.visible) t.setVisible(true);

  /* Lewat registry supaya sama dengan menu; kalau id-nya tidak ada (mis. lane
     lain memindahkannya), fokus tetap dilakukan langsung - panel yang bisa
     dibuka lewat satu jalur tidak boleh mati karena jalur itu hilang. */
  let jalur = perintah;
  const { runCommand } = await import('../commandRegistry');
  const ok = await runCommand(perintah);
  if (!ok) {
    usePanel.getState().focusTab(nama);
    jalur = 'store';
  }

  return `Panel ${nama} sudah dibuka (lewat ${jalur}). ${ringkasJendela()}`;
}

/* ------------------------------------------------------------------ */
/* 5. Aksi: buka bagian Settings                                       */
/* ------------------------------------------------------------------ */

function bukaSetelanLangsung(bagian: SectionId): void {
  /* The section is written into THIS window's store first: `SettingsNav` in the
     Settings window reads the same store, but that window is a separate WebView
     with its own instances, so this only sets the default a freshly opened
     window starts from. `setActivity('settings')` is what opens the window. */
  useSettingsUi.getState().setSection(bagian);
  useStore.getState().setActivity('settings');
}

/**
 * Buka Settings pada bagian tertentu, lalu laporkan keadaan + nilai nyatanya.
 *
 * Bentuk jawabannya sengaja tetap: "Settings sudah dibuka, bagian X aktif" +
 * ringkasan. Model memakai kalimat itu untuk membuktikan ke user bahwa jendela
 * benar-benar muncul, dan harness memakai penanda yang sama untuk memastikan
 * setiap bagian punya jalur pelaporan (bukan hanya jalur buka).
 */
export async function bukaSetelan(section: string): Promise<string> {
  const bagian = (section ?? '').trim();
  if (!setelanDikenal(bagian)) {
    throw new Error(
      `ERROR: bagian setelan "${section}" tidak dikenal. Bagian yang ada: ${daftarSetelan().join(', ')}.`,
    );
  }

  const pembuka = KONTROL_SETELAN[bagian];
  let jalur = pembuka;
  if (pembuka !== PEMBUKA_STORE) {
    const { runCommand } = await import('../commandRegistry');
    const ok = await runCommand(pembuka);
    if (!ok) {
      bukaSetelanLangsung(bagian);
      jalur = PEMBUKA_STORE;
    }
  } else {
    bukaSetelanLangsung(bagian);
  }

  const nilai = ringkasJendela();
  return `Settings sudah dibuka, bagian ${bagian} aktif (lewat ${jalur}). ${nilai}`;
}

/* ------------------------------------------------------------------ */
/* 6. Aksi: pane terminal (layout, tab, fokus)                         */
/* ------------------------------------------------------------------ */

export type AksiPane =
  | 'open'
  | 'close'
  | 'rotate'
  | 'split'
  | 'grid'
  | 'group'
  | 'consolidate'
  | 'tab'
  | 'nextTab'
  | 'prevTab'
  | 'focus';

export const AKSI_PANE: readonly AksiPane[] = [
  'open',
  'close',
  'rotate',
  'split',
  'grid',
  'group',
  'consolidate',
  'tab',
  'nextTab',
  'prevTab',
  'focus',
];

function tabAktif(): TerminalTab | null {
  const t = useTerminal.getState();
  return t.terminalTabs.find((x) => x.id === t.activeTabId) ?? null;
}

function geserTabTerminal(arah: 1 | -1): string {
  const t = useTerminal.getState();
  const daftar = t.terminalTabs;
  if (daftar.length === 0) throw new Error('ERROR: belum ada tab terminal yang bisa diganti.');
  const i = daftar.findIndex((x) => x.id === t.activeTabId);
  const n = ((i < 0 ? 0 : i) + arah + daftar.length) % daftar.length;
  t.setActiveTab(daftar[n].id);
  if (!t.visible) t.setVisible(true);
  return daftar[n].title;
}

/**
 * Satu pintu untuk semua aksi pane, dipakai tool `mcp__zephyr__pane`.
 *
 * `rotate`/`split`/`grid`/`group`/`consolidate` dulu mengembalikan
 * "Aksi pane X selesai." tanpa mengubah apa pun - sukses palsu. Sekarang
 * keempatnya benar-benar mengubah `TerminalTab.layout` (`grid` <-> `split`),
 * dan `rotate` berarti "tukar ke bentuk yang lain", bukan nama aksi kosong.
 */
export async function aksiPane(
  action: string,
  o: { leafId?: string; target?: string } = {},
): Promise<string> {
  const t = () => useTerminal.getState();
  const aksi = (action ?? '').trim();

  if (aksi === 'open') {
    const paneId = await t().addPane('shell');
    if (!paneId) {
      throw new Error(
        `ERROR: ${t().terminalError ?? 'pane terminal gagal dibuat'}`,
      );
    }
    return `Pane terminal baru dibuka: ${paneId}. ${ringkasJendela()}`;
  }

  if (aksi === 'close') {
    const aktif = tabAktif();
    const id = (o.leafId ?? '').trim() || aktif?.activePaneId || aktif?.panes[0]?.id;
    if (!id) throw new Error('ERROR: tidak ada pane yang bisa ditutup di tab terminal aktif.');
    await t().closePane(id);
    return `Pane ${id} ditutup. ${ringkasJendela()}`;
  }

  if (
    aksi === 'rotate' ||
    aksi === 'split' ||
    aksi === 'grid' ||
    aksi === 'group' ||
    aksi === 'consolidate'
  ) {
    const tab = tabAktif();
    if (!tab) throw new Error('ERROR: tidak ada tab terminal aktif untuk diatur layout-nya.');
    const sebelumnya = tab.layout;
    /* `group`/`consolidate` = kumpulkan kembali semua pane ke satu grid;
       `split` = bagi; `rotate` = tukar ke bentuk yang lain. */
    const mauSplit = aksi === 'rotate' ? sebelumnya === 'grid' : aksi === 'split';
    t().setLayout(tab.id, mauSplit ? 'split' : 'grid');
    return `Layout tab "${tab.title}" diatur ke ${mauSplit ? 'split' : 'grid'} (sebelumnya ${sebelumnya}). ${ringkasJendela()}`;
  }

  if (aksi === 'tab') {
    const target = (o.target ?? '').trim();
    if (!target) {
      throw new Error(
        'ERROR: aksi "tab" butuh parameter target: "next", "prev", "new", atau id/judul tab.',
      );
    }
    if (target === 'new') {
      const id = t().newTab();
      const paneId = await t().addPane('shell');
      return `Tab terminal baru dibuat (${id})${paneId ? ` dengan pane ${paneId}` : ''}. ${ringkasJendela()}`;
    }
    if (target === 'next') return `Tab terminal diganti ke "${geserTabTerminal(1)}". ${ringkasJendela()}`;
    if (target === 'prev') return `Tab terminal diganti ke "${geserTabTerminal(-1)}". ${ringkasJendela()}`;

    const daftar = t().terminalTabs;
    const idx = Number.parseInt(target, 10);
    const cocok =
      daftar.find((x) => x.id === target) ??
      daftar.find((x) => x.title === target) ??
      (Number.isFinite(idx) ? daftar[idx] : undefined);
    if (!cocok) {
      throw new Error(
        `ERROR: tab terminal "${target}" tidak ada. Tab yang ada: ${daftar.map((x) => `${x.id} (${x.title})`).join(', ') || '(belum ada)'}.`,
      );
    }
    t().setActiveTab(cocok.id);
    if (!t().visible) t().setVisible(true);
    return `Tab terminal diganti ke "${cocok.title}". ${ringkasJendela()}`;
  }

  if (aksi === 'nextTab') return `Tab terminal diganti ke "${geserTabTerminal(1)}". ${ringkasJendela()}`;
  if (aksi === 'prevTab') return `Tab terminal diganti ke "${geserTabTerminal(-1)}". ${ringkasJendela()}`;

  if (aksi === 'focus') {
    const id = (o.leafId ?? '').trim();
    if (!id) throw new Error('ERROR: aksi "focus" butuh parameter leafId.');
    const t2 = t();
    const parent = t2.terminalTabs.find((x) => x.panes.some((p) => p.id === id));
    if (!parent) {
      const ada = t2.allPanes().map((p) => p.id);
      throw new Error(
        `ERROR: pane "${id}" tidak ada. Pane yang ada: ${ada.join(', ') || '(belum ada)'}.`,
      );
    }
    t2.setActivePane(parent.id, id);
    if (!t2.visible) t2.setVisible(true);
    return `Pane ${id} difokuskan. ${ringkasJendela()}`;
  }

  throw new Error(
    `ERROR: aksi pane "${action}" tidak dikenal. Aksi yang ada: ${AKSI_PANE.join(', ')}.`,
  );
}

/* ------------------------------------------------------------------ */
/* 7. Tangkap layar (item ZEPH-SCREENSHOT-TOOL)                        */
/* ------------------------------------------------------------------ */

/**
 * Apakah jendela bisa ditangkap menjadi gambar di build ini?
 *
 * BENAR, dan itu fakta yang bisa diperiksa sendiri - tiga baris:
 *   * `src-tauri/src/tangkap_layar.rs` - perintah `window_capture` (PrintWindow
 *     lebih dulu, lalu BitBlt dari DC layar, PNG ditulis atomik + byte-nya
 *     diverifikasi);
 *   * `src-tauri/src/lib.rs:60` - `mod tangkap_layar;`
 *   * `src-tauri/src/lib.rs:536` - `tangkap_layar::window_capture,` di
 *     `tauri::generate_handler!`.
 * Laporan sisi Rust (22 uji, hasil terukur, dan batas yang BELUM terukur):
 * `docs/LAPORAN-TANGKAP-LAYAR.md`. Rancangan asalnya:
 * `docs/RANCANGAN-TANGKAP-JENDELA.md`.
 *
 * Perintah itu TIDAK PERNAH melempar: bentuknya selalu
 * `{ berhasil, path?, width?, height?, bytes?, pesanGalat? }`. Jadi satu-satunya
 * cara tahu ia gagal adalah membaca `berhasil`/`pesanGalat` - persis yang
 * dikerjakan `tangkapJendela()`; tanpa itu alasannya hilang dan pemanggil hanya
 * melihat pesan generik.
 */
export const TANGKAP_LAYAR_TERSEDIA = true;

export const DOK_TANGKAP_LAYAR = 'docs/RANCANGAN-TANGKAP-JENDELA.md';

/** Laporan sisi Rust (apa yang sudah diukur + yang masih BUTUH APP). */
export const DOK_LAPORAN_TANGKAP_LAYAR = 'docs/LAPORAN-TANGKAP-LAYAR.md';

export const PINTASAN_TANGKAP_LAYAR = 'Ctrl+Alt+S';

export function laporanTangkapLayar(): string {
  if (TANGKAP_LAYAR_TERSEDIA) {
    return (
      `Tangkap layar siap (pintasan ${PINTASAN_TANGKAP_LAYAR}, BELUM terpasang di ` +
      `src/lib/shortcuts.ts): perintah Rust window_capture terdaftar, menghasilkan PNG ` +
      `(path, width, height, bytes) dan gambarnya sekalian disalin ke clipboard. ` +
      `Jalur yang benar-benar jalan sekarang adalah tool Zeph: ` +
      `run_command({ capture: true, path?, copy? }). ` +
      `Yang sudah diukur dan yang masih butuh app hidup: ${DOK_LAPORAN_TANGKAP_LAYAR}.`
    );
  }
  return (
    'Tangkap layar BELUM didukung di build ini: tidak ada perintah Tauri penangkap jendela ' +
    '(browser.rs mencatat WebView2 CapturePreview tidak dipaparkan), jadi tidak ada yang bisa ' +
    `disimpan maupun disalin ke clipboard. Rancangan perintahnya ada di ${DOK_TANGKAP_LAYAR} ` +
    `(pintasan yang disiapkan: ${PINTASAN_TANGKAP_LAYAR}). ` +
    'Catatan: mcp_server.rs punya tool bernama "screenshot_pane", tetapi ia menyimpan TEKS ' +
    'buffer pane ke .txt di %TEMP% - bukan gambar.'
  );
}

/**
 * Target tangkap layar yang dikenal perintah Rust
 * (`src-tauri/src/tangkap_layar.rs:91` `ArgumenTangkap.target`): `window`
 * (jendela Zephyr saja) atau `screen` (layar penuh).
 */
export const TARGET_TANGKAP = ['window', 'screen'] as const;
export type TargetTangkap = (typeof TARGET_TANGKAP)[number];

export function targetTangkapDikenal(nama: string): nama is TargetTangkap {
  return (TARGET_TANGKAP as readonly string[]).includes(nama);
}

/**
 * Periksa `target` SEBELUM IPC. Target yang tidak dikenal adalah kesalahan
 * pemanggil, bukan keadaan backend - dan mengirimnya ke Rust berarti jawabannya
 * baru datang setelah satu perjalanan IPC, padahal tidak ada yang bisa berubah.
 */
export function periksaTargetTangkap(minta?: string): TargetTangkap {
  const nama = (minta ?? '').trim() || 'window';
  if (!targetTangkapDikenal(nama)) {
    throw new Error(
      `ERROR: target tangkap layar "${minta}" tidak dikenal. Yang ada: ${TARGET_TANGKAP.join(', ')}.`,
    );
  }
  return nama;
}

/* Awal path absolut bergaya Windows: `C:\...`, `C:/...`, atau UNC `\\server\share`. */
const AWAL_DRIVE = /^[A-Za-z]:[\\/]/;
const AWAL_UNC = /^[\\/]{2}[^\\/]/;
const NAMA_PERANGKAT = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * Periksa `savePath` SEBELUM IPC, dengan aturan yang sama seperti penjagaan
 * Rust (`src-tauri/src/tangkap_layar.rs:201` `periksa_path_keluaran`) - supaya
 * path yang pasti ditolak backend tidak perlu menempuh perjalanan IPC lebih
 * dulu. Rust tetap penentu akhir: folder sistem (dan hal lain yang butuh
 * lingkungan nyata) hanya diperiksa di sana.
 *
 * Kosong/`undefined` dipulangkan apa adanya: itu bukan galat, melainkan
 * permintaan "pakai path bawaan" (`%USERPROFILE%\Pictures\Zephyr\zephyr-<stamp>.png`).
 */
export function periksaPathTangkap(minta?: string): string | undefined {
  const mentah = (minta ?? '').trim();
  if (!mentah) return undefined;

  if (!AWAL_DRIVE.test(mentah) && !AWAL_UNC.test(mentah)) {
    throw new Error(
      `ERROR: path tangkap layar harus absolut bergaya Windows (C:\\folder\\x.png atau \\\\server\\share\\x.png), bukan relatif: ${mentah}`,
    );
  }
  const komponen = mentah.split(/[\\/]+/);
  if (komponen.includes('..')) {
    throw new Error(
      `ERROR: path tangkap layar tidak boleh memuat '..' (berkas harus tetap di folder yang terlihat di path): ${mentah}`,
    );
  }
  const nama = komponen[komponen.length - 1] ?? '';
  if (!nama.toLowerCase().endsWith('.png')) {
    throw new Error(
      `ERROR: path tangkap layar harus berakhir .png - perintah ini hanya menulis PNG, ekstensi lain berarti nama berkas dan isinya tidak cocok: ${mentah}`,
    );
  }
  for (const k of komponen) {
    if (!k || /^[A-Za-z]:$/.test(k)) continue;
    if (k.endsWith('.') || k.endsWith(' ')) {
      throw new Error(
        `ERROR: komponen path tangkap layar berakhir titik/spasi - Windows membuangnya, jadi berkas yang tertulis BUKAN path yang dilaporkan: ${k}`,
      );
    }
    if (NAMA_PERANGKAT.test(k.split('.')[0])) {
      throw new Error(
        `ERROR: "${k}" adalah nama perangkat Windows, bukan nama berkas biasa: ${mentah}`,
      );
    }
  }
  return mentah;
}

function pesanDari(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Jalankan tangkap layar jendela, lalu laporkan keadaan apa adanya.
 *
 * Urutan penjagaannya disengaja:
 *   1. bendera build (`TANGKAP_LAYAR_TERSEDIA`) - kalau perintah Rust-nya tidak
 *      ada, jawabannya laporan, bukan invoke yang pasti ditolak;
 *   2. `target` + `savePath` diperiksa DI SINI, sebelum IPC
 *      (`periksaTargetTangkap`/`periksaPathTangkap`) - argumen yang tidak masuk
 *      akal ditolak, bukan dikirim ke backend untuk gagal di sana;
 *   3. perintah Rust dipanggil SEKALI dengan `{ target, savePath }` saja (lihat
 *      `captureWindow` - tidak ada parameter jaringan/telemetri);
 *   4. kegagalannya dilaporkan dengan pesan backend APA ADANYA (`pesanGalat`),
 *      bukan diganti pesan generik: perintah Rust tidak melempar, jadi tanpa
 *      langkah ini sebab kegagalan hilang di perjalanan.
 *
 * Jalur suksesnya sama: PNG disimpan lewat `savePath`, lalu GAMBARNYA disalin ke
 * clipboard lewat plugin clipboard-manager yang sudah dipakai app
 * (`Image.fromPath` -> `writeImage`), jadi tidak ada perintah Rust kedua.
 */
export async function tangkapJendela(
  opsi: { path?: string; salin?: boolean; target?: string } = {},
): Promise<string> {
  if (!TANGKAP_LAYAR_TERSEDIA) {
    return `Tangkap layar tidak dijalankan. ${laporanTangkapLayar()}`;
  }
  const target = periksaTargetTangkap(opsi.target);
  const savePath = periksaPathTangkap(opsi.path);
  const [{ captureWindow, NAMA_PERINTAH_TANGKAP }, { writeImage }, { Image }] = await Promise.all([
    import('../commands'),
    import('@tauri-apps/plugin-clipboard-manager'),
    import('@tauri-apps/api/image'),
  ]);
  let hasil: HasilTangkapLayar | undefined;
  try {
    hasil = await captureWindow({ target, savePath });
  } catch (e) {
    /*
     * Perintah Rust-nya sendiri tidak melempar, tetapi INVOKE-nya bisa (mis.
     * dipanggil di luar jendela Tauri, atau perintahnya tidak terdaftar di build
     * itu). Itu juga dilaporkan - bukan dibiarkan menjadi exception yang
     * membatalkan giliran model tanpa jejak.
     */
    return `Tangkap layar GAGAL: ${NAMA_PERINTAH_TANGKAP} menolak dipanggil (${pesanDari(e)}). ${ringkasJendela()}`;
  }
  const galat = typeof hasil?.pesanGalat === 'string' ? hasil.pesanGalat.trim() : '';
  /*
   * `berhasil === false` diperiksa lebih dulu (kalau backend menyatakan gagal,
   * itu yang berlaku walau path ikut terisi), lalu path kosong. Hasil kosong
   * `{}` jatuh ke cabang yang sama: tidak ada path -> tidak dianggap sukses, dan
   * tidak ada path palsu yang dilaporkan.
   */
  if (hasil?.berhasil === false || !hasil?.path) {
    return (
      `Tangkap layar GAGAL: ` +
      `${galat || `${NAMA_PERINTAH_TANGKAP} tidak mengembalikan path berkas`}. ` +
      ringkasJendela()
    );
  }
  let salin = '';
  if (opsi.salin !== false) {
    try {
      await writeImage(await Image.fromPath(hasil.path));
      salin = ' Gambarnya tersalin ke clipboard.';
    } catch (e) {
      salin = ` (gagal menyalin ke clipboard: ${pesanDari(e)})`;
    }
  }
  /* Dimensi ditulis hanya kalau backend benar-benar mengiriminya - mencetak
     `undefinedxundefined` akan membuat laporan terlihat rusak padahal gambarnya
     ada. */
  const ukuran =
    Number.isFinite(hasil.width) && Number.isFinite(hasil.height)
      ? ` (${hasil.width}x${hasil.height}, ${hasil.bytes ?? 0} byte).`
      : '.';
  return `Tangkap layar tersimpan: ${hasil.path}${ukuran}${salin} ${ringkasJendela()}`;
}
