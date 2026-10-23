import { create } from 'zustand';
import * as cmd from './commands';
import type { CommandDef } from './commandRegistry';
import { useKb } from './keybindingStore';
import { chordFor } from './keybindings';
import { useStore } from './store';
import { effectiveBinding } from './shortcuts';
import type { QuickFile } from './types';

/*
 * The command list is rebuilt on every palette open, not cached for the session.
 *
 * WHY not cache it once: availableCommands() folds in taskCommands() and
 * snippetCommands() at the moment it runs. Opening the palette before
 * tasksStore.muat() has finished froze a list without the task commands for the
 * rest of the session, and snippet commands came out empty whenever no editor
 * view was open — so commands that exist were simply missing from the palette,
 * with no error to explain it. Rebuilding is about 130 cheap objects, which is
 * nothing next to a palette the user cannot find a command in.
 */
let daftarPerintahTerakhir: CommandDef[] = [];

async function muatRegistry() {
  const m = await import('./commandRegistry');
  daftarPerintahTerakhir = m.availableCommands();
  return m;
}

export type PaletteMode = 'command' | 'file' | 'symbol';

/** Satu simbol dari `workspace/symbol` (LSP). */
interface SimbolHasil {
  nama: string;
  jenis: string;
  file: string;
  baris: number;
}

export interface PaletteItem {
  
  id: string;
  label: string;
  
  detail: string;
  
  binding?: string;
  score: number;
  
  hits: number[];
  group?: string;
}

/* Nama jenis simbol LSP (bilangan 1..26). Dipakai di kolom detail, jadi
   `useState` bisa dibedakan dari `useEffect` sekilas pandang. */
const JENIS_SIMBOL: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  15: 'string',
  16: 'number',
  17: 'boolean',
  18: 'array',
  19: 'object',
  20: 'key',
  21: 'null',
  22: 'enum member',
  23: 'struct',
  24: 'event',
  25: 'operator',
  26: 'type parameter',
};

/*
 * Pencarian simbol ditunda 180 ms.
 *
 * Satu ketukan = satu permintaan LSP ke server yang juga sedang memindeks
 * ruang kerja; mengetik "useState" tanpa jeda menjadi delapan permintaan yang
 * saling menyalip. `versiSimbol` di bawah membuang jawaban yang sudah basi,
 * karena urutan kedatangan tidak dijamin sama dengan urutan pengiriman.
 */
let timerSimbol: ReturnType<typeof setTimeout> | null = null;
let versiSimbol = 0;

function jadwalkanSimbol(q: string) {
  if (timerSimbol) clearTimeout(timerSimbol);
  timerSimbol = setTimeout(() => {
    timerSimbol = null;
    void usePalette.getState().muatSimbol(q);
  }, 180);
}

const RECENT_KEY = 'zephyr.palette.recent.v1';
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    /* localStorage full/blocked — recent is not a critical feature */
  }
}

export function fuzzyMatch(
  text: string,
  query: string,
  ketatSubsequence = false,
): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  if (t.startsWith(q)) {
    return { score: 1000 - t.length, hits: range(0, q.length) };
  }
  
  const wordIdx = wordStartIndex(t, q);
  if (wordIdx >= 0) {
    return { score: 800 - t.length + (wordIdx === 0 ? 10 : 0), hits: range(wordIdx, q.length) };
  }
  
  const sub = t.indexOf(q);
  if (sub >= 0) {
    return { score: 600 - sub - t.length / 2, hits: range(sub, q.length) };
  }
  if (ketatSubsequence) return null;
  
  const hits: number[] = [];
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === ' ') continue; 
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    if (hits.length > 0) gaps += found - (hits[hits.length - 1] + 1);
    hits.push(found);
    ti = found + 1;
  }
  return { score: 400 - gaps * 2 - t.length / 4, hits };
}

function range(start: number, len: number): number[] {
  return Array.from({ length: len }, (_, i) => start + i);
}

function wordStartIndex(text: string, query: string): number {
  let from = 0;
  for (;;) {
    const i = text.indexOf(query, from);
    if (i < 0) return -1;
    if (i === 0 || /[\s:/\-_.]/.test(text[i - 1])) return i;
    from = i + 1;
  }
}

interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  query: string;
  
  index: number;
  
  files: QuickFile[];
  loadingFiles: boolean;
  filesError: string | null;
  /** Hasil pencarian simbol workspace terakhir (mode 'symbol'). */
  simbol: SimbolHasil[];
  loadingSymbols: boolean;
  symbolsError: string | null;
  recent: string[];
  
  lastRun: { id: string; at: number } | null;

  /**
   * Bumped when the lazily-loaded command registry arrives, so the palette
   * re-renders with the freshly available items. `index: 0` alone is a no-op
   * (it is already 0) and left the first open showing an empty list.
   */
  rev: number;

  /**
   * TRUE when the palette was opened by CLICKING the title-bar search box.
   *
   * The two entry points want different shapes. From the keyboard the palette
   * is a modal in the middle of the screen, because the eyes are already there.
   * From the search box the same modal appears far from the thing that was
   * clicked, under a dimming overlay, which reads as a page change rather than
   * as opening a field. Anchored mode instead drops a panel directly under that
   * box — the shape a reader expects from a search control — with no scrim, so
   * the editor stays visible behind it.
   */
  anchored: boolean;
}

interface PaletteActions {
  openPalette: (mode: PaletteMode, anchored?: boolean) => Promise<void>;
  close: () => void;
  setQuery: (q: string) => void;
  move: (delta: number) => void;
  setIndex: (i: number) => void;
  
  accept: (i?: number) => Promise<void>;

  /**
   * Run one item, optionally as a ONE-SHOT.
   *
   * `sekali` (true) runs it without recording it as recently used — the
   * ephemeral entry. See the implementation for why the two are separated.
   */
  acceptItem: (item: PaletteItem, sekali?: boolean) => Promise<void>;

  items: () => PaletteItem[];
  runCommandById: (id: string, sekali?: boolean) => Promise<void>;
  /** Tanya `workspace/symbol` ke language server untuk kata kunci ini. */
  muatSimbol: (q: string) => Promise<void>;
}

export type PaletteStore = PaletteState & PaletteActions;

export const usePalette = create<PaletteStore>((set, get) => ({
  open: false,
  mode: 'command',
  query: '',
  index: 0,
  files: [],
  loadingFiles: false,
  filesError: null,
  simbol: [],
  loadingSymbols: false,
  symbolsError: null,
  recent: loadRecent(),
  lastRun: null,
  rev: 0,
  anchored: false,

  openPalette: async (mode, anchored = false) => {
    set({
      open: true,
      mode,
      query: '',
      index: 0,
      filesError: null,
      symbolsError: null,
      simbol: [],
      anchored,
    });
    if (mode === 'command') {
      await muatRegistry();
      // The command list is loaded lazily, so on the very first open the store
      // already had `index: 0` when the await started. Writing it again is a
      // no-op for zustand, no re-render happens, and the palette sits there
      // showing "No matching commands." while 130+ items are ready — the count
      // only appears once the user types. Bump a counter the palette subscribes
      // to, so the list is painted the moment the registry arrives.
      set((s) => ({ rev: s.rev + 1 }));
    }
    if (mode === 'symbol') {
      /* Simbol baru diminta setelah ada kata kunci: `workspace/symbol` dengan
         query kosong mengembalikan ribuan entri dari sebagian server, dan
         daftar itu bukan sesuatu yang bisa dibaca. */
      return;
    }
    if (mode !== 'file') return;
    
    if (!useStore.getState().workspace) {
      set({ files: [], filesError: 'No folder is open yet (Ctrl+Shift+O to open one).' });
      return;
    }
    set({ loadingFiles: true });
    try {
      set({ files: await cmd.listWorkspaceFiles(), loadingFiles: false });
    } catch (e) {
      set({ loadingFiles: false, filesError: cmd.asZephyrError(e).message });
    }
  },

  close: () => set({ open: false, query: '', index: 0 }),
  setQuery: (q) => {
    set({ query: q, index: 0 });
    if (get().mode === 'symbol') jadwalkanSimbol(q);
  },
  setIndex: (i) => set({ index: i }),

  move: (delta) => {
    const n = get().items().length;
    if (n === 0) return;
    set((s) => ({ index: ((s.index + delta) % n + n) % n }));
  },

  items: () => {
    const { mode, query, files, recent, simbol } = get();
    const q = query.trim();

    /*
     * Mode simbol: hasil server sudah tersaring per kata kunci, jadi di sini
     * hanya diurutkan dan disaring ulang secara lokal. Skor turun bila namanya
     * tidak dimulai dengan query, supaya `useState` tidak kalah oleh
     * `useStatefulThing` yang kebetulan urutannya lebih dulu di server.
     */
    if (mode === 'symbol') {
      const cari = q.toLowerCase();
      const list: PaletteItem[] = [];
      for (const s of simbol) {
        const nama = s.nama.split(/[.#:]/).pop() ?? s.nama;
        const m = fuzzyMatch(s.nama, cari);
        if (!m) continue;
        const awal = cari && nama.toLowerCase().startsWith(cari) ? 240 : 0;
        list.push({
          /* `file` + `baris` ikut di id supaya Enter tahu ke mana harus pergi. */
          id: `${s.file}\u0000${s.baris}\u0000${s.nama}`,
          label: s.nama,
          detail: `${s.file.replace(/[\\/]+$/, '').split(/[\\/]/).slice(-2).join('/')}:${s.baris}`,
          group: s.jenis,
          score: m.score + awal - (s.file.length / 20),
          hits: m.hits,
        });
      }
      list.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
      return list.slice(0, 200);
    }

    if (mode === 'file') {
      const list: PaletteItem[] = [];
      for (const f of files) {
        
        const m = fuzzyMatch(f.rel, q);
        if (!m) continue;
        
        const nameBonus = q && f.name.toLowerCase().startsWith(q.toLowerCase()) ? 300 : 0;
        list.push({
          id: f.path,
          label: f.name,
          detail: f.rel,
          score: m.score + nameBonus,
          hits: m.hits,
        });
      }
      list.sort((a, b) => b.score - a.score || a.detail.localeCompare(b.detail));
      return list.slice(0, 200);
    }

    const custom = useStore.getState().settings.shortcuts;
    const list: PaletteItem[] = [];
    const sumber = daftarPerintahTerakhir;
    for (const c of sumber) {
      const hay = `${c.title} ${c.keywords ?? ''}`;
      
      const m = fuzzyMatch(c.title, q) ?? fuzzyMatch(hay, q, true);
      if (!m) continue;
      const r = recent.indexOf(c.id);
      const recentBonus = r >= 0 ? (MAX_RECENT - r) * 12 : 0;
      list.push({
        id: c.id,
        label: c.title,
        detail: c.group,
        group: c.group,
        
        binding:
          chordFor(c.id, useKb.getState().bindings) ||
          (c.action ? effectiveBinding(c.action, custom) : undefined),
        score: m.score + recentBonus,
        hits: m.hits.filter((i) => i < c.title.length),
      });
    }
    list.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return list;
  },

  accept: async (i) => {
    const items = get().items();
    const item = items[i ?? get().index];
    if (!item) return;
    return get().acceptItem(item, false);
  },

  /**
   * Run an item, optionally as a ONE-SHOT.
   *
   * A one-shot runs the command but is not recorded as recently used.
   *
   * WHY this matters: the `recent` list is the palette's memory of what the
   * reader reaches for. Every run enters it, and `items()` scores recent
   * entries higher — so a command run once from curiosity outranks one used
   * daily until it ages out. For a handful of runs that is noise; for a task
   * that fires the same command repeatedly (`tasks.run` while iterating on a
   * build, a formatter, an MCP tool) it pushes the genuinely-used commands off
   * the top of the list entirely.
   *
   * Splitting "run it" from "remember that I ran it" is what the reference
   * editors do with their ephemeral palette entries, and it needs no new UI:
   * Ctrl/Cmd+Enter is the one-shot, plain Enter is the ordinary run.
   */
  acceptItem: async (item, sekali) => {
    if (get().mode === 'symbol') {
      set({ open: false, query: '' });
      const [file, baris] = item.id.split('\u0000');
      if (!file) return;
      const s = useStore.getState();
      s.setSettingsOpen(false);
      await s.openPath(file, { preview: !sekali });
      const { revealPosition } = await import('./editorRegistry');
      /* Editor baru terpasang setelah satu frame; memanggil langsung membuat
         lompatan baris jatuh ke editor yang sedang diganti. */
      window.setTimeout(() => revealPosition(Number(baris) || 1, 1), 90);
      return;
    }
    if (get().mode === 'file') {
      set({ open: false, query: '' });
      const s = useStore.getState();
      s.setSettingsOpen(false);
      /*
       * A file opened from the palette is browsed past as often as it is
       * settled on, and it comes from the same Ctrl+P list that a tree click
       * does — so it takes the same preview slot rather than pinning. Unless
       * it was a one-shot, which is the reader saying "just show me".
       */
      await s.openPath(item.id, { preview: !sekali });
      return;
    }
    set({ open: false, query: '' });
    await get().runCommandById(item.id, sekali);
  },

  muatSimbol: async (q) => {
    const query = q.trim();
    const versi = ++versiSimbol;
    if (!query) {
      set({ simbol: [], loadingSymbols: false, symbolsError: null });
      return;
    }

    const s = useStore.getState();
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const acuan = tab?.path ?? s.tabs.find((t) => t.path)?.path ?? null;
    if (!acuan) {
      set({
        simbol: [],
        loadingSymbols: false,
        symbolsError: 'Open a file first: the language server for it answers the symbol search.',
      });
      return;
    }

    set({ loadingSymbols: true, symbolsError: null });
    try {
      const [{ useLsp }, { uriToPath }] = await Promise.all([
        import('./lspStore'),
        import('./lsp'),
      ]);
      const res = await useLsp.getState().req(acuan, 'workspace/symbol', { query });
      /* Jawaban permintaan lama boleh datang setelah query berubah; hanya yang
         terbaru yang boleh menulis daftar. */
      if (versi !== versiSimbol) return;

      const hasil: SimbolHasil[] = [];
      if (Array.isArray(res)) {
        for (const n of res) {
          if (hasil.length >= 300) break;
          const o = n as Record<string, unknown>;
          const nama = String(o.name ?? '');
          if (!nama) continue;
          const loc = (o.location ?? {}) as { uri?: string; range?: { start?: { line?: number } } };
          hasil.push({
            nama,
            jenis: JENIS_SIMBOL[Number(o.kind)] ?? 'symbol',
            file: loc.uri ? uriToPath(loc.uri) : '',
            baris: (loc.range?.start?.line ?? 0) + 1,
          });
        }
      }
      set({ simbol: hasil.filter((h) => h.file), loadingSymbols: false });
    } catch (e) {
      if (versi !== versiSimbol) return;
      set({ simbol: [], loadingSymbols: false, symbolsError: cmd.asZephyrError(e).message });
    }
  },

  runCommandById: async (id, sekali) => {
    const m = await muatRegistry();
    const c: CommandDef | undefined = m.findCommand(id);
    if (!c) return;
    if (!sekali) {
      const recent = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
      set({ recent, lastRun: { id, at: Date.now() } });
      saveRecent(recent);
    }
    try {
      await c.run();
    } catch (e) {
      useStore.getState().setStatus(`Command "${c.title}" failed: ${cmd.asZephyrError(e).message}`);
    }
  },
}));
