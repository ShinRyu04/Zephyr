import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useWs } from './workspaceStore';
import { cariNamaDiPohon } from './explorerFilter';
import { hapusKerja } from './workingSet';
import { notifyError, notifyInfo } from './notificationStore';
import { kunciPath } from './pathKey';
import type { DirNode, SearchHit } from './types';
import { tx } from './i18n';

export interface CtxMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

export interface InlineEdit {
  kind: 'new-file' | 'new-folder' | 'rename';
  
  target: string;
  initial: string;
}

interface ExplorerState {
  
  children: Record<string, DirNode[]>;
  
  expanded: Record<string, boolean>;
  
  selected: string[];
  
  anchor: string | null;
  loading: Record<string, boolean>;
  ctxMenu: CtxMenu | null;
  inlineEdit: InlineEdit | null;
  
  explorerError: string | null;
  
  pendingDelete: string[] | null;

  /*
   * Name filter for the tree, kept in the store rather than in a component so
   * it survives switching ActivityBar panels mid-search. `filterHasil` holds
   * the matched files, `filterTerpotong` says a walk limit was hit.
   */
  filter: string;
  filterHasil: string[];
  filterJalan: boolean;
  filterTerpotong: boolean;

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
  
  refreshDir: (dir: string) => Promise<void>;

  select: (path: string, mode: 'single' | 'ctrl' | 'shift', visibleOrder: string[]) => void;
  openCtxMenu: (m: CtxMenu) => void;
  closeCtxMenu: () => void;
  startInline: (e: InlineEdit) => void;
  cancelInline: () => void;
  commitInline: (value: string) => Promise<void>;

  deletePaths: (paths: string[]) => Promise<void>;
  
  askDelete: (paths: string[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  movePath: (from: string, toDir: string) => Promise<void>;
  reveal: (path: string) => Promise<void>;
  copyPath: (path: string) => Promise<void>;

  setFilter: (q: string) => Promise<void>;
  clearFilter: () => void;

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
  if (!n) return 'the name cannot be empty';
  if (NAME_INVALID.test(n)) return 'the name contains characters that are not allowed';
  if (n === '.' || n === '..') return 'invalid name';
  if (/[. ]$/.test(n)) return 'the name cannot end with a dot or a space';
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
  
  pendingDelete: null,

  filter: '',
  filterHasil: [],
  filterJalan: false,
  filterTerpotong: false,

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

  loadDir: async (path, force = false) => {
    /*
     * Listings are keyed by `kunciPath`, never by the raw string.
     *
     * The same folder reaches this store as `D:\galeri`, `D:\galeri\` and
     * `d:/galeri` depending on who asked: the backend's `roots[].path`, the
     * file watcher's `dir`, a drop target, or `useStore.workspace`. Storing
     * under the raw string meant a listing written under one spelling was
     * invisible to a reader asking with another — the tree looked EMPTY while
     * the data sat in the store. `pathKey.ts` already exists for exactly this
     * and six other stores already use it; Explorer was the one that did not.
     */
    const kunci = kunciPath(path);
    if (!force && get().children[kunci]) return;
    set((s) => ({ loading: { ...s.loading, [kunci]: true } }));
    try {
      const nodes = await cmd.scanDir(path);
      set((s) => ({
        children: { ...s.children, [kunci]: nodes },
        loading: { ...s.loading, [kunci]: false },
        explorerError: null,
      }));
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [kunci]: false },
        explorerError: cmd.asZephyrError(e).message,
      }));
    }
  },

  toggleExpand: async (path) => {
    const kunci = kunciPath(path);
    const open = get().expanded[kunci];
    if (open) {
      set((s) => ({ expanded: { ...s.expanded, [kunci]: false } }));
      return;
    }
    set((s) => ({ expanded: { ...s.expanded, [kunci]: true } }));
    await get().loadDir(path);
  },

  collapseAll: () => set({ expanded: {} }),

  /*
   * Refresh rebuilds every root and every open folder — but it is not allowed
   * to leave the reader staring at an empty panel.
   *
   * The previous version cleared `children` first and reloaded afterwards. When
   * a root failed, or when its path arrived in a different spelling than the
   * one the tree reads, the clear was all that survived: every file vanished
   * and nothing said why, reported verbatim as "pas pencet refresh, tiba-tiba
   * ilang semua file". So the reload now builds a fresh map and swaps it in
   * only after at least one directory answered; a total failure keeps the old
   * listings and surfaces the error instead of blanking the tree.
   */
  refreshAll: async () => {
    const { roots } = useWs.getState();
    const aktif = useStore.getState().workspace;
    const sumber = roots.length > 0 ? roots.map((r) => r.path) : aktif ? [aktif] : [];
    const openDirs = Object.entries(get().expanded)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const tujuan: string[] = [];
    for (const p of [...sumber, ...openDirs]) {
      if (p && !tujuan.some((x) => kunciPath(x) === kunciPath(p))) tujuan.push(p);
    }
    if (tujuan.length === 0) return;

    const lama = get().children;
    const baru: Record<string, DirNode[]> = {};
    const gagal: string[] = [];
    for (const d of tujuan) {
      try {
        baru[kunciPath(d)] = await cmd.scanDir(d);
      } catch (e) {
        gagal.push(`${d}: ${cmd.asZephyrError(e).message}`);
        /*
         * Keep whatever was already known for this folder. A refresh must
         * never be the reason a listing disappears — a lock, a transient
         * permission error or a folder that was just renamed is not evidence
         * that its contents are gone.
         */
        const k = kunciPath(d);
        if (lama[k]) baru[k] = lama[k];
      }
    }

    if (Object.keys(baru).length === 0) {
      set({ explorerError: gagal.join(' · ') || 'refresh failed' });
      return;
    }
    set((s) => ({
      children: { ...s.children, ...baru },
      explorerError: gagal.length > 0 ? gagal.join(' · ') : null,
    }));
  },

  /*
   * One folder changed on disk. It is either a root or a folder the tree has
   * open, and both are now compared by key rather than by raw string: the
   * watcher sends the path Windows reported, while the root list and the
   * expanded set may spell it differently.
   *
   * The old `if (!isVisible) return;` was silent, so a spelling mismatch made
   * every agent write invisible in the tree with no error anywhere. Now a
   * folder that is the parent of an open path still refreshes, and a directory
   * the tree has never seen falls back to reloading the active root instead of
   * doing nothing.
   */
  refreshDir: async (dir) => {
    if (!dir) return;
    const target = kunciPath(dir);
    const akar = useWs.getState().roots.some((r) => kunciPath(r.path) === target);
    const terbuka = Object.keys(get().expanded).some((k) => k === target);
    if (akar || terbuka) {
      await get().loadDir(dir, true);
      return;
    }
    const parentDariTerbuka = Object.keys(get().expanded).some(
      (k) => k.startsWith(`${target}\\`) && k !== target,
    );
    if (parentDariTerbuka) {
      await get().loadDir(dir, true);
      return;
    }
    const aktif = useStore.getState().workspace ?? useWs.getState().roots[0]?.path;
    if (aktif) await get().loadDir(aktif, true);
  },

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
      
      useStore.getState().closeTabsUnder(paths);
      /* A deleted file must leave the working set too, otherwise the list
         keeps offering a path that no longer opens. */
      const akar = useStore.getState().workspace ?? '';
      for (const p of paths) hapusKerja(akar, p);
      
      notifyInfo(
        paths.length === 1
          ? `Deleted: ${baseOf(paths[0])}`
          : `${paths.length} items deleted`,
        { source: 'explorer' },
      );
    } catch (e) {
      const msg = cmd.asZephyrError(e).message;
      set({ explorerError: msg, ctxMenu: null });
      notifyError(tx('Delete failed'), { detail: msg, source: 'explorer' });
    }
  },

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
    if (dirOf(src) === dest) return; 
    
    if (dest === src || dest.toLowerCase().startsWith(`${src.toLowerCase()}\\`)) {
      set({ explorerError: 'a folder cannot be moved into itself' });
      return;
    }
    const target = joinPath(dest, baseOf(src));
    try {
      if (await cmd.fsExists(target)) {
        set({ explorerError: `"${baseOf(src)}" already exists in the destination folder` });
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
      useStore.getState().setStatus('Failed to copy the path');
    }
    set({ ctxMenu: null });
  },

  setQuery: (q) => set({ query: q }),
  setGlob: (g) => set({ glob: g }),
  setReplaceWith: (r) => set({ replaceWith: r }),
  toggleCase: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleRegex: () => set((s) => ({ regex: !s.regex })),

  /*
   * The walk is async and can take a moment on a big repo, so a stale result is
   * possible: the reader keeps typing while folders are being scanned. Each call
   * carries the text it was started for and drops its own answer if the box has
   * moved on, otherwise the tree would flash the matches of a prefix.
   */
  setFilter: async (q) => {
    const teks = q.trim();
    if (!teks) {
      set({ filter: q, filterHasil: [], filterJalan: false, filterTerpotong: false });
      return;
    }
    set({ filter: q, filterJalan: true, filterTerpotong: false });

    const akar = useStore.getState().workspace;
    if (!akar) {
      set({ filterJalan: false, filterHasil: [] });
      return;
    }

    const hasil = await cariNamaDiPohon(akar, teks);
    if (get().filter.trim() !== teks) return;

    for (const d of hasil.buka) {
      set((s) => ({ expanded: { ...s.expanded, [kunciPath(d)]: true } }));
      await get().loadDir(d);
    }
    set({
      filterJalan: false,
      filterHasil: hasil.berkas,
      filterTerpotong: hasil.terpotong,
    });
  },

  clearFilter: () =>
    set({ filter: '', filterHasil: [], filterJalan: false, filterTerpotong: false }),

  runSearch: async () => {
    const { query, glob, caseSensitive, regex } = get();
    if (!query.trim()) {
      set({ hits: [], filesScanned: 0, truncated: false, searchError: null });
      return;
    }
    if (!useStore.getState().workspace) {
      set({ searchError: 'open a folder before searching' });
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
