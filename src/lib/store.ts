// store.ts — state global Zephyr (Zustand). Bentuk mengikuti
// ARCHITECTURE.md §5. Key camelCase. Slot terminalTabs/ai/mcp sudah
// disiapkan sesuai kontrak walau baru dipakai di fase 05+.

import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as cmd from './commands';
import { detectLang } from './lang';
import { revealPosition } from './editorRegistry';
import { applyTheme } from './themes';
import { retheme } from './xtermRegistry';
import {
  DEFAULT_SETTINGS,
  type ActivityId,
  type AppInfo,
  type Encoding,
  type LineEnding,
  type RecentEntry,
  type Settings,
  type Tab,
} from './types';

/** Dialog konfirmasi tab kotor: [Simpan][Jangan Simpan][Batal]. */
export interface ConfirmState {
  /** tab yang ditanyakan */
  tabIds: string[];
  /** apa yang dilakukan setelah semua beres */
  intent: 'close-tab' | 'close-window';
}

interface StoreState {
  // shell
  activity: ActivityId;
  sidebarVisible: boolean;
  sidebarWidth: number;
  ramBytes: number;
  statusMessage: string;
  cursor: { line: number; col: number };

  // workspace & editor
  workspace: string | null;
  recents: RecentEntry[];
  tabs: Tab[];
  activeTabId: string | null;
  untitledSeq: number;
  findOpen: boolean;
  confirm: ConfirmState | null;

  // slot kontrak fase berikutnya
  terminalTabs: never[];
  ai: { model: string; messages: never[] };
  mcp: { enabled: boolean; running: boolean; port: number };

  settings: Settings;
  settingsLoaded: boolean;
  /** versi + data dir dari Rust (dipakai Settings → Tentang). */
  appInfo: AppInfo | null;
  /** halaman Settings sedang dibuka di area utama (fase 08). */
  settingsOpen: boolean;
  /** id tema yang BENAR-BENAR terpasang di <html> (fase 13).
   *  Dipisah dari settings.theme.current karena mode 'system' + pill
   *  terang/gelap bisa membuat keduanya berbeda; komponen yang butuh warna
   *  (CodeMirror, xterm) harus ikut yang ini. */
  activeTheme: string;
}

interface StoreActions {
  setActivity: (a: ActivityId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setRamBytes: (b: number) => void;
  setStatus: (m: string) => void;
  setCursor: (line: number, col: number) => void;
  setFindOpen: (open: boolean) => void;
  /** Buka/tutup halaman Settings di area utama (fase 08). */
  setSettingsOpen: (open: boolean) => void;

  bootstrap: () => Promise<void>;
  openFolderDialog: () => Promise<void>;
  openWorkspace: (dir: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  refreshRecents: () => Promise<void>;
  openFileDialog: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  newUntitled: () => void;

  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<boolean>;
  saveTabAs: (id: string) => Promise<boolean>;
  /** Tutup tab; kalau kotor munculkan dialog dulu. */
  requestCloseTab: (id: string) => void;
  forceCloseTab: (id: string) => void;
  reorderTab: (from: number, to: number) => void;

  // ── dipakai Explorer (fase 04) ──
  /** Buka file lalu lompat ke baris/kolom (hasil Search). 1-based. */
  openPathAt: (path: string, line: number, col?: number) => Promise<void>;
  /** Path file/folder berubah nama → perbarui tab terkait. */
  renamePathInTabs: (from: string, to: string) => void;
  /** Tutup semua tab yang berada di dalam salah satu path (file/folder). */
  closeTabsUnder: (paths: string[]) => void;
  /** Muat ulang isi tab dari disk (setelah replace / diubah dari luar). */
  reloadTabFromDisk: (path: string) => Promise<void>;

  /** Pindah tab editor relatif (+1 = kanan, -1 = kiri), melingkar (fase 12). */
  cycleTab: (delta: number) => void;

  /** fase 14.5: pastikan isi tab ada di memori (dibaca ulang bila sudah dilepas). */
  ensureTabLoaded: (id: string) => Promise<void>;
  /** fase 14.5: lepas isi tab yang lama tidak dipakai bila tab > MAX_LOADED_TABS. */
  unloadColdTabs: () => void;

  resolveConfirm: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
  requestCloseWindow: () => boolean;

  persistSession: () => Promise<void>;
  applySettings: (patch: Record<string, unknown>) => Promise<void>;
  /** Muat ulang settings dari disk (dipakai setelah reset_settings). */
  reloadSettings: () => Promise<void>;
}

export type Store = StoreState & StoreActions;

let idSeq = 0;
const nextId = () => `t${++idSeq}`;

const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/** Guard idempotensi: bootstrap hanya boleh berjalan sekali per proses
 *  (React StrictMode memanggil effect dua kali di mode dev). */
let bootstrapStarted = false;

/** Path yang sedang dalam proses dibuka. Mencegah tab ganda saat openPath
 *  dipanggil dua kali berdekatan untuk file yang sama (await fs_read
 *  membuat pengecekan `tabs.find` di bawah rentan race). */
const opening = new Set<string>();

/** fase 14.5 — batas tab yang isinya boleh tinggal di memori sekaligus.
 *  Di atas ini, tab yang paling lama tidak disentuh dilepas (`loaded:false`):
 *  tab-nya TETAP ada di tab bar, hanya string kontennya dibuang supaya 30+
 *  tab tidak menumpuk puluhan MB. Isinya dibaca ulang dari disk saat tab itu
 *  diaktifkan (`ensureTabLoaded`). Tab yang belum disimpan (`unsaved`) dan
 *  untitled TIDAK PERNAH dilepas — kontennya cuma ada di memori. */
export const MAX_LOADED_TABS = 12;

/** Urutan sentuh terakhir per tab id (paling belakang = paling baru).
 *  Di luar store supaya tidak memicu render; hanya dipakai untuk memilih
 *  tab mana yang dilepas. */
const touchOrder: string[] = [];

function touchTab(id: string): void {
  const i = touchOrder.indexOf(id);
  if (i >= 0) touchOrder.splice(i, 1);
  touchOrder.push(id);
}

export const useStore = create<Store>((set, get) => ({
  activity: 'explorer',
  sidebarVisible: true,
  sidebarWidth: 260,
  ramBytes: 0,
  statusMessage: '',
  cursor: { line: 1, col: 1 },

  workspace: null,
  recents: [],
  tabs: [],
  activeTabId: null,
  untitledSeq: 0,
  findOpen: false,
  confirm: null,

  terminalTabs: [],
  ai: { model: 'gemini-3.6-flash', messages: [] },
  mcp: { enabled: false, running: false, port: 9222 },

  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  appInfo: null,
  settingsOpen: false,
  activeTheme: 'zephyr-dark',

  // ── shell ──
  setActivity: (a) => set({ activity: a }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(600, w)) }),
  setRamBytes: (b) => set({ ramBytes: b }),
  setStatus: (m) => set({ statusMessage: m }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setFindOpen: (open) => set({ findOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  // ── bootstrap: settings + restore session ──
  bootstrap: async () => {
    // StrictMode di dev memanggil effect dua kali -> tab akan dobel.
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    try {
      const s = await cmd.getSettings();
      set({ settings: s, settingsLoaded: true });
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); // terminal hidup ikut tema (V3 fase 13)
    } catch (e) {
      set({ settingsLoaded: true, statusMessage: cmd.asZephyrError(e).message });
    }

    // Info app (versi/data dir) untuk Settings → Tentang. Non-fatal.
    try {
      set({ appInfo: await cmd.getAppInfo() });
    } catch {
      /* biarkan null */
    }

    // Daftar recent selalu dimuat (dipakai empty-state Explorer).
    await get().refreshRecents();

    if (!get().settings.general.restoreSession) return;

    try {
      const saved = await cmd.sessionLoad();
      let restored = 0;
      for (const t of saved) {
        try {
          await get().openPath(t.path);
          restored++;
        } catch {
          // file hilang -> skip (dicatat di status bar)
        }
      }
      const missing = saved.length - restored;
      if (restored > 0) {
        set({
          statusMessage:
            missing > 0
              ? `Restore ${restored} tab, ${missing} file tidak ditemukan`
              : `Restore ${restored} tab`,
        });
      }
    } catch {
      /* session.json rusak/absen — abaikan */
    }
  },

  openFolderDialog: async () => {
    try {
      const dir = await cmd.folderDialogOpen();
      if (!dir) return;
      await get().openWorkspace(dir);
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  /** Buka folder sebagai workspace: set state, muat tree, pasang watcher. */
  openWorkspace: async (dir) => {
    try {
      await cmd.workspaceOpen(dir);
      set({ workspace: dir, statusMessage: `Workspace: ${baseName(dir)}` });

      // Explorer: reset tree lalu muat level pertama + pasang watcher.
      const { useExplorer } = await import('./explorerStore');
      const ex = useExplorer.getState();
      useExplorer.setState({ children: {}, expanded: {}, selected: [], anchor: null });
      await ex.loadDir(dir, true);
      try {
        await cmd.fsWatch(dir);
      } catch {
        /* watcher gagal bukan alasan membatalkan buka folder */
      }
      await get().refreshRecents();
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  closeWorkspace: async () => {
    try {
      await cmd.fsUnwatch();
      await cmd.workspaceClose();
    } catch {
      /* abaikan */
    }
    const { useExplorer } = await import('./explorerStore');
    useExplorer.setState({ children: {}, expanded: {}, selected: [], anchor: null });
    set({ workspace: null, statusMessage: 'Workspace ditutup' });
    await get().refreshRecents();
  },

  refreshRecents: async () => {
    try {
      set({ recents: await cmd.listRecents() });
    } catch {
      /* non-fatal */
    }
  },

  openFileDialog: async () => {
    try {
      const picked = await cmd.fileDialogOpen(true);
      if (!picked || picked.length === 0) return;
      for (const p of picked) await get().openPath(p);
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  openPath: async (path) => {
    // Sudah terbuka? cukup fokuskan.
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      touchTab(existing.id);
      void get().ensureTabLoaded(existing.id);
      return;
    }
    // Sedang dibuka oleh pemanggil lain -> jangan bikin tab kedua.
    if (opening.has(path)) return;
    opening.add(path);

    try {
      const res = await cmd.fsRead(path);
      // Cek ulang setelah await: mungkin sudah dibuka sementara kita menunggu.
      const again = get().tabs.find((t) => t.path === path);
      if (again) {
        set({ activeTabId: again.id });
        return;
      }
      const tab: Tab = {
        id: nextId(),
        path,
        name: baseName(path),
        encoding: res.detectedEncoding,
        lineEnding: res.lineEnding,
        unsaved: false,
        content: res.content,
        lang: detectLang(path),
        loaded: true,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      touchTab(tab.id);
      // fase 14.5: buka tab ke-13 → tab paling lama dilepas dari memori.
      get().unloadColdTabs();
      void get().persistSession();
    } finally {
      opening.delete(path);
    }
  },

  newUntitled: () => {
    const n = get().untitledSeq + 1;
    const tab: Tab = {
      id: nextId(),
      path: null,
      name: `untitled-${n}`,
      encoding: 'utf8' as Encoding,
      lineEnding: 'crlf' as LineEnding,
      unsaved: false,
      content: '',
      lang: 'plain',
      loaded: true,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, untitledSeq: n }));
    touchTab(tab.id);
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
    touchTab(id);
    // Tab yang isinya sudah dilepas dibaca ulang sebelum editor mount.
    void get().ensureTabLoaded(id);
  },

  /** fase 14.5: baca ulang isi tab dari disk bila sudah dilepas. */
  ensureTabLoaded: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.loaded !== false || !tab.path) return;
    try {
      const res = await cmd.fsRead(tab.path);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                content: res.content,
                encoding: res.detectedEncoding,
                lineEnding: res.lineEnding,
                loaded: true,
              }
            : t,
        ),
      }));
    } catch (e) {
      // File hilang saat tab dibuka lagi → pesan jelas dari Rust (V1 fase 14).
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  /** fase 14.5: lepas konten tab paling lama bila melebihi MAX_LOADED_TABS.
   *  Yang dilepas hanya tab tersimpan (punya path, tidak `unsaved`) dan bukan
   *  tab aktif — kehilangan buffer yang belum disimpan tidak bisa diterima. */
  unloadColdTabs: () => {
    const { tabs, activeTabId } = get();
    const loaded = tabs.filter((t) => t.loaded !== false);
    if (loaded.length <= MAX_LOADED_TABS) return;

    const lepas = new Set<string>();
    let target = loaded.length - MAX_LOADED_TABS;
    for (const id of touchOrder) {
      if (target <= 0) break;
      if (id === activeTabId) continue;
      const t = tabs.find((x) => x.id === id);
      if (!t || t.loaded === false || !t.path || t.unsaved) continue;
      lepas.add(id);
      target--;
    }
    // Tab yang belum pernah tercatat di touchOrder (mis. hasil restore) ikut
    // dipertimbangkan supaya batas benar-benar ditegakkan.
    if (target > 0) {
      for (const t of tabs) {
        if (target <= 0) break;
        if (t.id === activeTabId || t.loaded === false || !t.path || t.unsaved) continue;
        if (lepas.has(t.id)) continue;
        lepas.add(t.id);
        target--;
      }
    }
    if (lepas.size === 0) return;

    set((s) => ({
      tabs: s.tabs.map((t) => (lepas.has(t.id) ? { ...t, content: '', loaded: false } : t)),
      statusMessage:
        s.tabs.length > MAX_LOADED_TABS
          ? `Tab terlalu banyak — ${lepas.size} tab dilepas dari memori (isi dibaca ulang saat dibuka)`
          : s.statusMessage,
    }));
  },

  updateTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        // Tab yang isinya dilepas (fase 14.5) tidak menerima update: editor
        // untuknya tidak di-mount, jadi update apa pun di sini palsu.
        t.id === id && t.loaded !== false
          ? { ...t, content, unsaved: t.content !== content ? true : t.unsaved }
          : t,
      ),
    })),

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!tab.path) return get().saveTabAs(id);
    // fase 14.5: tab yang isinya sudah dilepas TIDAK boleh disimpan —
    // content-nya string kosong, menulisnya akan mengosongkan file di disk.
    if (tab.loaded === false) {
      await get().ensureTabLoaded(id);
      const again = get().tabs.find((t) => t.id === id);
      if (!again || again.loaded === false) {
        set({ statusMessage: 'Tab belum dimuat ulang — buka dulu sebelum menyimpan' });
        return false;
      }
    }
    const cur = get().tabs.find((t) => t.id === id) as Tab;
    try {
      await cmd.fsWrite(cur.path as string, cur.content, cur.encoding, cur.lineEnding);
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, unsaved: false } : t)),
        statusMessage: `Disimpan: ${cur.name}`,
      }));
      return true;
    } catch (e) {
      set({ statusMessage: `Gagal simpan: ${cmd.asZephyrError(e).message}` });
      return false;
    }
  },

  saveTabAs: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    try {
      const target = await cmd.fileDialogSave(tab.path ?? tab.name);
      if (!target) return false;
      await cmd.fsWrite(target, tab.content, tab.encoding, tab.lineEnding);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? { ...t, path: target, name: baseName(target), unsaved: false, lang: detectLang(target) }
            : t,
        ),
        statusMessage: `Disimpan: ${baseName(target)}`,
      }));
      void get().persistSession();
      return true;
    } catch (e) {
      set({ statusMessage: `Gagal simpan: ${cmd.asZephyrError(e).message}` });
      return false;
    }
  },

  requestCloseTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.unsaved) {
      set({ confirm: { tabIds: [id], intent: 'close-tab' } });
      return;
    }
    get().forceCloseTab(id);
  },

  forceCloseTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        const neighbour = tabs[Math.min(idx, tabs.length - 1)];
        activeTabId = neighbour ? neighbour.id : null;
      }
      return { tabs, activeTabId };
    });
    void get().persistSession();
  },

  reorderTab: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.tabs.length || to >= s.tabs.length) {
        return {};
      }
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    }),

  // ── integrasi Explorer / Search (fase 04) ──

  openPathAt: async (path, line, col = 1) => {
    await get().openPath(path);
    // Tunggu satu frame supaya EditorView tab tersebut sudah terpasang.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    revealPosition(line, col);
  },

  renamePathInTabs: (from, to) => {
    const fromNorm = from.replace(/[\\/]+$/, '');
    const prefix = `${fromNorm.toLowerCase()}\\`;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (!t.path) return t;
        const lower = t.path.toLowerCase();
        if (lower === fromNorm.toLowerCase()) {
          return { ...t, path: to, name: baseName(to), lang: detectLang(to) };
        }
        if (lower.startsWith(prefix)) {
          const suffix = t.path.slice(fromNorm.length);
          const next = `${to}${suffix}`;
          return { ...t, path: next, name: baseName(next), lang: detectLang(next) };
        }
        return t;
      }),
    }));
    void get().persistSession();
  },

  closeTabsUnder: (paths) => {
    const targets = paths.map((p) => p.replace(/[\\/]+$/, '').toLowerCase());
    const doomed = get()
      .tabs.filter((t) => {
        if (!t.path) return false;
        const lower = t.path.toLowerCase();
        return targets.some((x) => lower === x || lower.startsWith(`${x}\\`));
      })
      .map((t) => t.id);
    for (const id of doomed) get().forceCloseTab(id);
  },

  /** Pindah tab editor relatif, melingkar (Ctrl+Tab / Ctrl+Shift+Tab). */
  cycleTab: (delta) => {
    const { tabs, activeTabId } = get();
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeTabId);
    const next = (((i < 0 ? 0 : i) + delta) % tabs.length + tabs.length) % tabs.length;
    get().setActiveTab(tabs[next].id);
  },

  reloadTabFromDisk: async (path) => {
    const tab = get().tabs.find((t) => t.path?.toLowerCase() === path.toLowerCase());
    if (!tab) return;
    try {
      const res = await cmd.fsRead(tab.path as string);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                content: res.content,
                encoding: res.detectedEncoding,
                lineEnding: res.lineEnding,
                unsaved: false,
              }
            : t,
        ),
      }));
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  resolveConfirm: async (choice) => {
    const c = get().confirm;
    if (!c) return;

    if (choice === 'cancel') {
      set({ confirm: null });
      return;
    }

    const [current, ...rest] = c.tabIds;
    if (choice === 'save') {
      const ok = await get().saveTab(current);
      if (!ok) {
        set({ confirm: null }); // batal simpan -> batalkan penutupan
        return;
      }
    }
    get().forceCloseTab(current);

    if (rest.length > 0) {
      set({ confirm: { tabIds: rest, intent: c.intent } });
      return;
    }

    set({ confirm: null });
    if (c.intent === 'close-window') {
      await getCurrentWindow().destroy();
    }
  },

  /** true = boleh tutup sekarang; false = ada dialog yang harus dijawab. */
  requestCloseWindow: () => {
    const dirty = get().tabs.filter((t) => t.unsaved);
    if (dirty.length === 0) return true;
    set({ confirm: { tabIds: dirty.map((t) => t.id), intent: 'close-window' } });
    return false;
  },

  persistSession: async () => {
    try {
      const tabs = get()
        .tabs.filter((t) => t.path)
        .map((t) => ({ path: t.path as string, encoding: t.encoding }));
      await cmd.sessionSave(tabs);
    } catch {
      /* non-fatal */
    }
  },

  applySettings: async (patch) => {
    try {
      await cmd.setSettings(patch);
      const s = await cmd.getSettings();
      set({ settings: s });
      // Tema/zoom harus langsung terlihat tanpa restart (V2/V3 fase 08).
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); // terminal hidup ikut tema (V3 fase 13)
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },

  reloadSettings: async () => {
    try {
      const s = await cmd.getSettings();
      set({ settings: s });
      set({ activeTheme: applyTheme(s.general, s.theme) });
      retheme(); // terminal hidup ikut tema (V3 fase 13)
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
    }
  },
}));

/** Selector kecil yang sering dipakai. */
export const useActiveTab = (): Tab | null => {
  const id = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  return tabs.find((t) => t.id === id) ?? null;
};
