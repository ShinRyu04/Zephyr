import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import type { ExtCommand, ExtensionInfo, ExtensionLoad } from './types';

interface ExtState {
  list: ExtensionInfo[];
  loading: boolean;
  extError: string | null;
  extInfo: string | null;
  
  loaded: Record<string, ExtensionLoad>;
  
  marketOpen: boolean;
}

interface ExtActions {
  refresh: () => Promise<void>;
  toggle: (id: string, on: boolean) => Promise<void>;
  load: (id: string) => Promise<ExtensionLoad | null>;
  addFromDialog: () => Promise<void>;
  addPath: (path: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  openFolder: () => Promise<void>;
  setMarketOpen: (open: boolean) => void;
  setError: (m: string | null) => void;
  setInfo: (m: string | null) => void;
  
  commands: () => Array<ExtCommand & { extId: string; extName: string }>;
}

export type ExtStore = ExtState & ExtActions;

export const BUILTIN_IDS = [
  'file-icon-provider',
  'git-provider',
  'ai-provider',
  'lang-web',
  'lang-python',
  'lang-rust',
  'lang-markdown',
  'bracket-pair',
];

export const useExtensions = create<ExtStore>((set, get) => ({
  list: [],
  loading: false,
  extError: null,
  extInfo: null,
  loaded: {},
  marketOpen: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const list = await cmd.extensionsList();
      set({ list, loading: false, extError: null });
      
      for (const e of list) {
        if (!e.builtin && e.enabled && !get().loaded[e.id]) {
          try {
            const l = await cmd.extensionsLoad(e.id);
            set((s) => ({ loaded: { ...s.loaded, [e.id]: l } }));
          } catch {
            /* manifest rusak — sudah tercermin di e.error */
          }
        }
      }
    } catch (e) {
      set({ loading: false, extError: cmd.asZephyrError(e).message });
    }
  },

  toggle: async (id, on) => {
    const s = useStore.getState();
    const cur = s.settings.extensions.enabled;
    
    const base = cur.length === 0 ? [...BUILTIN_IDS] : cur;
    const next = on ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    await s.applySettings({ extensions: { enabled: next } });
    await get().refresh();
    set({ extInfo: `${id} ${on ? 'diaktifkan' : 'dimatikan'}` });
  },

  load: async (id) => {
    try {
      const l = await cmd.extensionsLoad(id);
      set((s) => ({ loaded: { ...s.loaded, [id]: l }, extError: null }));
      return l;
    } catch (e) {
      set({ extError: cmd.asZephyrError(e).message });
      return null;
    }
  },

  addFromDialog: async () => {
    try {
      const picked = await cmd.fileDialogOpen(false);
      const p = picked?.[0];
      if (!p) return;
      await get().addPath(p);
    } catch (e) {
      set({ extError: cmd.asZephyrError(e).message });
    }
  },

  addPath: async (path) => {
    try {
      const info = await cmd.extensionsAdd(path);
      await get().refresh();
      set({ extInfo: `${info.name} ditambahkan — aktifkan dengan toggle`, extError: null });
    } catch (e) {
      set({ extError: cmd.asZephyrError(e).message });
    }
  },

  remove: async (id) => {
    try {
      await cmd.extensionsRemove(id);
      
      const s = useStore.getState();
      const cur = s.settings.extensions.enabled;
      if (cur.includes(id)) {
        await s.applySettings({ extensions: { enabled: cur.filter((x) => x !== id) } });
      }
      set((st) => {
        const loaded = { ...st.loaded };
        delete loaded[id];
        return { loaded, extInfo: `${id} dilepas dari daftar` };
      });
      await get().refresh();
    } catch (e) {
      set({ extError: cmd.asZephyrError(e).message });
    }
  },

  openFolder: async () => {
    try {
      const dir = await cmd.extensionsFolder();
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(dir);
    } catch (e) {
      set({ extError: cmd.asZephyrError(e).message });
    }
  },

  setMarketOpen: (open) => set({ marketOpen: open }),
  setError: (m) => set({ extError: m }),
  setInfo: (m) => set({ extInfo: m }),

  commands: () => {
    const out: Array<ExtCommand & { extId: string; extName: string }> = [];
    for (const e of get().list) {
      if (e.builtin || !e.enabled || e.error) continue;
      for (const c of e.commands) out.push({ ...c, extId: e.id, extName: e.name });
    }
    return out;
  },
}));
