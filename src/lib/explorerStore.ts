// explorerStore.ts — state Explorer & Search (fase 04).
// Dipisah dari store.ts supaya store editor tetap ramping; keduanya
// saling memanggil lewat import biasa (bukan lewat komponen).

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { notifyError, notifyInfo } from './notificationStore';
import type { DirNode, SearchHit } from './types';

/** Menu konteks yang sedang tampil (posisi viewport + target). */
export interface CtxMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

/** Input inline untuk New File / New Folder / Rename. */
export interface InlineEdit {
  kind: 'new-file' | 'new-folder' | 'rename';
  /** folder tempat item dibuat, atau path item yang di-rename */
  target: string;
  initial: string;
}

interface ExplorerState {
  /** children per folder; key = path folder */
  children: Record<string, DirNode[]>;
  /** folder yang terbuka */
  expanded: Record<string, boolean>;
  /** path yang dipilih (multi-select) */
  selected: string[];
  /** anchor untuk Shift+klik */
  anchor: string | null;
  loading: Record<string, boolean>;
  ctxMenu: CtxMenu | null;
  inlineEdit: InlineEdit | null;
  /** pesan error terakhir dari operasi file */
  explorerError: string | null;
  /** FASE 27: path yang menunggu konfirmasi hapus (null = tidak ada dialog) */
  pendingDelete: string[] | null;

  // search
  query: string;
  glob: string;
  caseSensitive: boolean;
  regex: boolean;
  replaceWith: string;
  searching: boolean;
  hits: SearchHit[];
  filesScanned: number;
  truncated: boolean;
  searchError: string | null;
}

interface ExplorerActions {
  loadDir: (path: string, force?: boolean) => Promise<void>;
  toggleExpand: (path: string) => Promise<void>;
  collapseAll: () => void;
  refreshAll: () => Promise<void>;
  /** re-scan hanya folder yang berubah (dipakai watcher) */
  refreshDir: (dir: string) => Promise<void>;

  select: (path: string, mode: 'single' | 'ctrl' | 'shift', visibleOrder: string[]) => void;
  openCtxMenu: (m: CtxMenu) => void;
  closeCtxMenu: () => void;
  startInline: (e: InlineEdit) => void;
  cancelInline: () => void;
  commitInline: (value: string) => Promise<void>;

  deletePaths: (paths: string[]) => Promise<void>;
  /** FASE 27: minta konfirmasi hapus lewat dialog dalam-app (bukan
   *  `window.confirm` yang memblokir dan tidak bisa di-tema/diuji). */
  askDelete: (paths: string[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  movePath: (from: string, toDir: string) => Promise<void>;
  reveal: (path: string) => Promise<void>;
  copyPath: (path: string) => Promise<void>;

  // search
  setQuery: (q: string) => void;
  setGlob: (g: string) => void;
  setReplaceWith: (r: string) => void;
  toggleCase: () => void;
  toggleRegex: () => void;
  runSearch: () => Promise<void>;
  clearSearch: () => void;
  replaceInFileFromResults: (path: string) => Promise<void>;
  replaceAllResults: () => Promise<void>;
}

export type ExplorerStore = ExplorerState & ExplorerActions;

const dirOf = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');
const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p;
const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}\\${name}`;

const NAME_INVALID = /[<>:"/\\|?*\u0000-\u001f]/;

function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'nama tidak boleh kosong';
  if (NAME_INVALID.test(n)) return 'nama memuat karakter yang tidak diizinkan';
  if (n === '.' || n === '..') return 'nama tidak valid';
  if (/[. ]$/.test(n)) return 'nama tidak boleh diakhiri titik atau spasi';
  return null;
}

export const useExplorer = create<ExplorerStore>((set, get) => ({
  children: {},
  expanded: {},
  selected: [],
  anchor: null,
  loading: {},
  ctxMenu: null,
  inlineEdit: null,
  explorerError: null,
  /** FASE 27: path yang menunggu konfirmasi hapus (null = tidak ada). */
  pendingDelete: null,

  query: '',
  glob: '',
  caseSensitive: false,
  regex: false,
  replaceWith: '',
  searching: false,
  hits: [],
  filesScanned: 0,
  truncated: false,
  searchError: null,

  // ── tree ──
  loadDir: async (path, force = false) => {
    if (!force && get().children[path]) return;
    set((s) => ({ loading: { ...s.loading, [path]: true } }));
    try {
      const nodes = await cmd.scanDir(path);
      set((s) => ({
        children: { ...s.children, [path]: nodes },
        loading: { ...s.loading, [path]: false },
        explorerError: null,
      }));
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [path]: false },
        explorerError: cmd.asZephyrError(e).message,
      }));
    }
  },

  toggleExpand: async (path) => {
    const open = get().expanded[path];
    if (open) {
      set((s) => ({ expanded: { ...s.expanded, [path]: false } }));
      return;
    }
    set((s) => ({ expanded: { ...s.expanded, [path]: true } }));
    await get().loadDir(path);
  },

  collapseAll: () => set({ expanded: {} }),

  refreshAll: async () => {
    const ws = useStore.getState().workspace;
    const openDirs = Object.entries(get().expanded)
      .filter(([, v]) => v)
      .map(([k]) => k);
    set({ children: {} });
    if (ws) await get().loadDir(ws, true);
    for (const d of openDirs) await get().loadDir(d, true);
  },

  refreshDir: async (dir) => {
    // Hanya re-scan bila folder itu sedang ditampilkan.
    const ws = useStore.getState().workspace;
    const isVisible = dir === ws || get().expanded[dir];
    if (!isVisible) return;
    await get().loadDir(dir, true);
  },

  // ── seleksi ──
  select: (path, mode, visibleOrder) => {
    const { selected, anchor } = get();
    if (mode === 'ctrl') {
      const next = selected.includes(path)
        ? selected.filter((p) => p !== path)
        : [...selected, path];
      set({ selected: next, anchor: path });
      return;
    }
    if (mode === 'shift' && anchor) {
      const a = visibleOrder.indexOf(anchor);
      const b = visibleOrder.indexOf(path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        set({ selected: visibleOrder.slice(lo, hi + 1) });
        return;
      }
    }
    set({ selected: [path], anchor: path });
  },

  openCtxMenu: (m) => set({ ctxMenu: m }),
  closeCtxMenu: () => set({ ctxMenu: null }),
  startInline: (e) => set({ inlineEdit: e, ctxMenu: null, explorerError: null }),
  cancelInline: () => set({ inlineEdit: null }),

  commitInline: async (value) => {
    const edit = get().inlineEdit;
    if (!edit) return;
    const err = validateName(value);
    if (err) {
      set({ explorerError: err });
      return;
    }
    const name = value.trim();

    try {
      if (edit.kind === 'new-file') {
        const target = joinPath(edit.target, name);
        await cmd.fsCreateFile(target, '');
        set({ inlineEdit: null });
        await get().loadDir(edit.target, true);
        await useStore.getState().openPath(target);
      } else if (edit.kind === 'new-folder') {
        await cmd.fsCreateDir(joinPath(edit.target, name));
        set({ inlineEdit: null });
        await get().loadDir(edit.target, true);
      } else {
        const parent = dirOf(edit.target);
        const to = joinPath(parent, name);
        if (to === edit.target) {
          set({ inlineEdit: null });
          return;
        }
        await cmd.fsRename(edit.target, to);
        set({ inlineEdit: null, selected: [to] });
        useStore.getState().renamePathInTabs(edit.target, to);
        await get().loadDir(parent, true);
      }
      set({ explorerError: null });
    } catch (e) {
      set({ explorerError: cmd.asZephyrError(e).message });
    }
  },

  deletePaths: async (paths) => {
    if (paths.length === 0) return;
    try {
      await cmd.fsDelete(paths, true);
      const parents = [...new Set(paths.map(dirOf))];
      for (const p of parents) await get().loadDir(p, true);
      set((s) => ({
        selected: s.selected.filter((p) => !paths.includes(p)),
        ctxMenu: null,
        explorerError: null,
      }));
      // Tutup tab file yang dihapus (termasuk yang ada di dalam folder).
      useStore.getState().closeTabsUnder(paths);
      // FASE 27: laporkan lewat notifikasi terpusat, bukan hanya status bar
      // yang gampang tertimpa. Riwayatnya tersimpan di Notification Center.
      notifyInfo(
        paths.length === 1
          ? `Dihapus: ${baseOf(paths[0])}`
          : `${paths.length} item dihapus`,
        { source: 'explorer' },
      );
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      set({ explorerError: msg, ctxMenu: null });
      notifyError('Gagal menghapus', { detail: msg, source: 'explorer' });
    }
  },

  /** FASE 27: buka dialog konfirmasi hapus (menggantikan `window.confirm`). */
  askDelete: (paths) => {
    if (paths.length === 0) return;
    set({ pendingDelete: paths, ctxMenu: null });
  },

  cancelDelete: () => set({ pendingDelete: null }),

  confirmDelete: async () => {
    const paths = get().pendingDelete;
    set({ pendingDelete: null });
    if (paths && paths.length > 0) await get().deletePaths(paths);
  },

  movePath: async (from, toDir) => {
    const src = from.replace(/[\\/]+$/, '');
    const dest = toDir.replace(/[\\/]+$/, '');
    if (dirOf(src) === dest) return; // sudah di folder itu
    // Jangan pindahkan folder ke dalam dirinya sendiri / turunannya.
    if (dest === src || dest.toLowerCase().startsWith(`${src.toLowerCase()}\\`)) {
      set({ explorerError: 'tidak bisa memindahkan folder ke dalam dirinya sendiri' });
      return;
    }
    const target = joinPath(dest, baseOf(src));
    try {
      if (await cmd.fsExists(target)) {
        set({ explorerError: `"${baseOf(src)}" sudah ada di folder tujuan` });
        return;
      }
      await cmd.fsRename(src, target);
      useStore.getState().renamePathInTabs(src, target);
      await get().loadDir(dirOf(src), true);
      await get().loadDir(dest, true);
      set({ selected: [target], explorerError: null });
    } catch (e) {
      set({ explorerError: cmd.asZephyrError(e).message });
    }
  },

  reveal: async (path) => {
    try {
      await cmd.revealPath(path);
      set({ ctxMenu: null });
    } catch (e) {
      set({ explorerError: cmd.asZephyrError(e).message, ctxMenu: null });
    }
  },

  copyPath: async (path) => {
    try {
      await navigator.clipboard.writeText(path);
      useStore.getState().setStatus(`Path disalin: ${baseOf(path)}`);
    } catch {
      useStore.getState().setStatus('Gagal menyalin path');
    }
    set({ ctxMenu: null });
  },

  // ── search ──
  setQuery: (q) => set({ query: q }),
  setGlob: (g) => set({ glob: g }),
  setReplaceWith: (r) => set({ replaceWith: r }),
  toggleCase: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleRegex: () => set((s) => ({ regex: !s.regex })),

  runSearch: async () => {
    const { query, glob, caseSensitive, regex } = get();
    if (!query.trim()) {
      set({ hits: [], filesScanned: 0, truncated: false, searchError: null });
      return;
    }
    if (!useStore.getState().workspace) {
      set({ searchError: 'buka folder dulu untuk mencari' });
      return;
    }
    set({ searching: true, searchError: null });
    try {
      const res = await cmd.searchFiles(query, { glob, caseSensitive, regex });
      set({
        hits: res.hits,
        filesScanned: res.filesScanned,
        truncated: res.truncated,
        searching: false,
      });
    } catch (e) {
      set({ searching: false, searchError: cmd.asZephyrError(e).message, hits: [] });
    }
  },

  clearSearch: () =>
    set({ query: '', hits: [], filesScanned: 0, truncated: false, searchError: null }),

  replaceInFileFromResults: async (path) => {
    const { query, replaceWith, caseSensitive, regex } = get();
    if (!query) return;
    try {
      const n = await cmd.replaceInFile(path, query, replaceWith, { caseSensitive, regex });
      useStore.getState().setStatus(`${n} penggantian di ${baseOf(path)}`);
      await useStore.getState().reloadTabFromDisk(path);
      await get().runSearch();
    } catch (e) {
      set({ searchError: cmd.asZephyrError(e).message });
    }
  },

  replaceAllResults: async () => {
    const { hits, query, replaceWith, caseSensitive, regex } = get();
    if (!query || hits.length === 0) return;
    const files = [...new Set(hits.map((h) => h.path))];
    let total = 0;
    try {
      for (const f of files) {
        total += await cmd.replaceInFile(f, query, replaceWith, { caseSensitive, regex });
        await useStore.getState().reloadTabFromDisk(f);
      }
      useStore.getState().setStatus(`${total} penggantian di ${files.length} file`);
      await get().runSearch();
    } catch (e) {
      set({ searchError: cmd.asZephyrError(e).message });
    }
  },
}));
