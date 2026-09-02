// paletteStore.ts — state Command Palette & Quick Open (fase 12).
//
// Dua mode dalam satu modal:
//   'command' (Ctrl+Shift+P) — cari action dari commandRegistry
//   'file'    (Ctrl+P)        — cari file di workspace (list dari Rust)
//
// Skoring sengaja sederhana & deterministik supaya urutannya bisa diuji:
//   prefix cocok  > kata cocok  > substring  > subsequence (fuzzy)
// Bonus kecil untuk command yang baru dipakai (recent) dan penalti panjang.

import { create } from 'zustand';
import * as cmd from './commands';
import { availableCommands, COMMAND_BY_ID, type CommandDef } from './commandRegistry';
import { useStore } from './store';
import { effectiveBinding } from './shortcuts';
import type { QuickFile } from './types';

export type PaletteMode = 'command' | 'file';

/** Satu baris hasil di daftar. */
export interface PaletteItem {
  /** id unik: command id atau path file */
  id: string;
  label: string;
  /** teks kecil di kanan/bawah: grup atau path relatif */
  detail: string;
  /** keybinding yang ditampilkan (command saja) */
  binding?: string;
  score: number;
  /** posisi karakter yang cocok (untuk highlight) */
  hits: number[];
  group?: string;
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
    /* localStorage penuh/diblokir — recent bukan fitur kritis */
  }
}

/**
 * Cocokkan `query` ke `text`. null = tidak cocok.
 * Mengembalikan skor + indeks karakter yang cocok untuk highlight.
 */
export function fuzzyMatch(text: string, query: string): { score: number; hits: number[] } | null {
  if (!query) return { score: 0, hits: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // 1) prefix — paling relevan
  if (t.startsWith(q)) {
    return { score: 1000 - t.length, hits: range(0, q.length) };
  }
  // 2) awal kata (setelah spasi, ':', '/', '-', '_', '.')
  const wordIdx = wordStartIndex(t, q);
  if (wordIdx >= 0) {
    return { score: 800 - t.length + (wordIdx === 0 ? 10 : 0), hits: range(wordIdx, q.length) };
  }
  // 3) substring biasa
  const sub = t.indexOf(q);
  if (sub >= 0) {
    return { score: 600 - sub - t.length / 2, hits: range(sub, q.length) };
  }
  // 4) subsequence (fuzzy): huruf berurutan tapi tidak berdampingan
  const hits: number[] = [];
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === ' ') continue; // spasi di query tidak wajib cocok
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
  /** index item yang sedang disorot */
  index: number;
  /** daftar file workspace (di-cache; dimuat saat mode file dibuka) */
  files: QuickFile[];
  loadingFiles: boolean;
  filesError: string | null;
  recent: string[];
  /** command terakhir yang dijalankan (bukti untuk verifikasi) */
  lastRun: { id: string; at: number } | null;
}

interface PaletteActions {
  openPalette: (mode: PaletteMode) => Promise<void>;
  close: () => void;
  setQuery: (q: string) => void;
  move: (delta: number) => void;
  setIndex: (i: number) => void;
  /** Jalankan item yang sedang disorot (atau index tertentu). */
  accept: (i?: number) => Promise<void>;
  /** Hasil terfilter untuk mode aktif. */
  items: () => PaletteItem[];
  runCommandById: (id: string) => Promise<void>;
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
  recent: loadRecent(),
  lastRun: null,

  openPalette: async (mode) => {
    set({ open: true, mode, query: '', index: 0, filesError: null });
    if (mode !== 'file') return;
    // Mode file butuh daftar dari Rust. Workspace belum dibuka = katakan
    // apa adanya, jangan tampilkan daftar kosong tanpa alasan.
    if (!useStore.getState().workspace) {
      set({ files: [], filesError: 'Belum ada folder yang dibuka (Ctrl+Shift+O untuk membuka).' });
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
  setQuery: (q) => set({ query: q, index: 0 }),
  setIndex: (i) => set({ index: i }),

  move: (delta) => {
    const n = get().items().length;
    if (n === 0) return;
    set((s) => ({ index: ((s.index + delta) % n + n) % n }));
  },

  items: () => {
    const { mode, query, files, recent } = get();
    const q = query.trim();

    if (mode === 'file') {
      const list: PaletteItem[] = [];
      for (const f of files) {
        // Cocokkan ke path relatif supaya "src/li store" tetap ketemu.
        const m = fuzzyMatch(f.rel, q);
        if (!m) continue;
        // Nama file yang cocok lebih relevan daripada folder.
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
    for (const c of availableCommands()) {
      const hay = `${c.title} ${c.keywords ?? ''}`;
      const m = fuzzyMatch(c.title, q) ?? fuzzyMatch(hay, q);
      if (!m) continue;
      const r = recent.indexOf(c.id);
      const recentBonus = r >= 0 ? (MAX_RECENT - r) * 12 : 0;
      list.push({
        id: c.id,
        label: c.title,
        detail: c.group,
        group: c.group,
        binding: c.action ? effectiveBinding(c.action, custom) : undefined,
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

    if (get().mode === 'file') {
      set({ open: false, query: '' });
      const s = useStore.getState();
      s.setSettingsOpen(false);
      await s.openPath(item.id);
      return;
    }
    set({ open: false, query: '' });
    await get().runCommandById(item.id);
  },

  runCommandById: async (id) => {
    const c: CommandDef | undefined = COMMAND_BY_ID.get(id);
    if (!c) return;
    const recent = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
    set({ recent, lastRun: { id, at: Date.now() } });
    saveRecent(recent);
    try {
      await c.run();
    } catch (e) {
      useStore.getState().setStatus(`Command "${c.title}" gagal: ${cmd.asZephyrError(e).message}`);
    }
  },
}));
