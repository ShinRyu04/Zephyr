// store.ts — state global Zephyr (Zustand). Bentuk mengikuti
// ARCHITECTURE.md §5. Key camelCase. Slot terminalTabs/ai/mcp sudah
// disiapkan sesuai kontrak walau baru dipakai di fase 05+.

import { create } from 'zustand';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as cmd from './commands';
import { detectLang } from './lang';
import {
  DEFAULT_SETTINGS,
  type ActivityId,
  type Encoding,
  type LineEnding,
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
}

interface StoreActions {
  setActivity: (a: ActivityId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setRamBytes: (b: number) => void;
  setStatus: (m: string) => void;
  setCursor: (line: number, col: number) => void;
  setFindOpen: (open: boolean) => void;

  bootstrap: () => Promise<void>;
  openFolderDialog: () => Promise<void>;
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

  resolveConfirm: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
  requestCloseWindow: () => boolean;

  persistSession: () => Promise<void>;
  applySettings: (patch: Record<string, unknown>) => Promise<void>;
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

export const useStore = create<Store>((set, get) => ({
  activity: 'explorer',
  sidebarVisible: true,
  sidebarWidth: 260,
  ramBytes: 0,
  statusMessage: '',
  cursor: { line: 1, col: 1 },

  workspace: null,
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

  // ── shell ──
  setActivity: (a) => set({ activity: a }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(180, Math.min(600, w)) }),
  setRamBytes: (b) => set({ ramBytes: b }),
  setStatus: (m) => set({ statusMessage: m }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setFindOpen: (open) => set({ findOpen: open }),

  // ── bootstrap: settings + restore session ──
  bootstrap: async () => {
    // StrictMode di dev memanggil effect dua kali -> tab akan dobel.
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    try {
      const s = await cmd.getSettings();
      set({ settings: s, settingsLoaded: true });
      document.documentElement.dataset.theme =
        s.general.theme === 'light' ? 'zephyr-light' : (s.theme.current || 'zephyr-dark');
    } catch (e) {
      set({ settingsLoaded: true, statusMessage: cmd.asZephyrError(e).message });
    }

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
      await cmd.workspaceOpen(dir);
      set({ workspace: dir, statusMessage: `Workspace: ${baseName(dir)}` });
    } catch (e) {
      set({ statusMessage: cmd.asZephyrError(e).message });
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
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
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
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, untitledSeq: n }));
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, unsaved: t.content !== content ? true : t.unsaved } : t,
      ),
    })),

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (!tab.path) return get().saveTabAs(id);
    try {
      await cmd.fsWrite(tab.path, tab.content, tab.encoding, tab.lineEnding);
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, unsaved: false } : t)),
        statusMessage: `Disimpan: ${tab.name}`,
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
