// keybindingStore.ts — state runtime keybinding (fase 18).
//
// Memisahkan DATA (keybindings.ts: tabel default + fungsi murni) dari STATE
// (file ini: override user, context key aktif, chord yang sedang pending).
//
// Context key di-update oleh komponen yang menerima fokus (editor, terminal),
// bukan ditebak dari `document.activeElement` — ini yang membuat Ctrl+Up
// berarti scroll editor vs scroll buffer terminal (syarat 18.2/V5).

import { create } from 'zustand';
import * as cmd from './commands';
import {
  DEFAULT_BINDINGS,
  mergeBindings,
  normalizeChord,
  prefixSet,
  resolveBinding,
  type KeyBinding,
  type UserBinding,
  type WhenCtx,
} from './keybindings';

/** Batas waktu menunggu chord kedua dari sebuah sequence (ms). */
export const CHORD_TIMEOUT_MS = 1500;

interface KbState {
  /** override dari keybindings.json */
  user: UserBinding[];
  /** hasil merge default ⊕ user (yang dipakai semua UI) */
  bindings: KeyBinding[];
  /** context key yang AKTIF sekarang */
  ctx: WhenCtx[];
  /** chord pertama dari sequence yang sedang ditunggu ('' = tidak ada) */
  pending: string;
  /** panel editor Keyboard Shortcuts terbuka (18.4) */
  editorOpen: boolean;
  /** command terakhir yang dijalankan resolver (bukti untuk harness) */
  lastRun: string | null;
  /** pesan error terakhir (mis. gagal simpan) */
  kbError: string | null;
}

interface KbActions {
  load: () => Promise<void>;
  /** Simpan satu override (chord baru untuk sebuah command). */
  remap: (command: string, chord: string, when?: WhenCtx) => Promise<void>;
  /** Hapus binding (command jadi tanpa chord). */
  removeBinding: (command: string) => Promise<void>;
  /** Kembalikan satu command ke chord default. */
  resetOne: (command: string) => Promise<void>;
  resetAll: () => Promise<void>;
  setCtx: (key: WhenCtx, on: boolean) => void;
  setPending: (chord: string) => void;
  setEditorOpen: (open: boolean) => void;
  setLastRun: (id: string | null) => void;
  /** Selesaikan chord/sequence → binding yang cocok (null = tidak ada). */
  resolve: (sequence: string) => KeyBinding | null;
  /** true = sequence ini prefix dari binding lain (jangan fire dulu). */
  isPrefix: (sequence: string) => boolean;
}

let timer: number | undefined;

export const useKb = create<KbState & KbActions>((set, get) => ({
  user: [],
  bindings: DEFAULT_BINDINGS,
  ctx: ['global'],
  pending: '',
  editorOpen: false,
  lastRun: null,
  kbError: null,

  load: async () => {
    try {
      const raw = await cmd.getKeybindings();
      const user = Array.isArray(raw) ? (raw as UserBinding[]) : [];
      set({ user, bindings: mergeBindings(user), kbError: null });
    } catch (e) {
      // Gagal baca bukan alasan mematikan seluruh shortcut — pakai default.
      set({ user: [], bindings: DEFAULT_BINDINGS, kbError: cmd.asZephyrError(e).message });
    }
  },

  remap: async (command, chord, when) => {
    const c = normalizeChord(chord);
    if (!c) return;
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: c, command, when: when ?? 'global' });
    set({ user, bindings: mergeBindings(user) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  removeBinding: async (command) => {
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: '', command, remove: true });
    set({ user, bindings: mergeBindings(user) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  resetOne: async (command) => {
    const user = get().user.filter((u) => u.command !== command);
    set({ user, bindings: mergeBindings(user) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  resetAll: async () => {
    set({ user: [], bindings: DEFAULT_BINDINGS });
    try {
      await cmd.setKeybindings([]);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  setCtx: (key, on) =>
    set((s) => {
      const ada = s.ctx.includes(key);
      if (on === ada) return {};
      return { ctx: on ? [...s.ctx, key] : s.ctx.filter((k) => k !== key) };
    }),

  setPending: (chord) => {
    window.clearTimeout(timer);
    set({ pending: chord });
    if (chord) {
      // Pending yang tidak dilanjutkan HARUS kedaluwarsa sendiri, kalau tidak
      // chord berikutnya (mis. Ctrl+S biasa) akan dianggap bagian sequence.
      timer = window.setTimeout(() => set({ pending: '' }), CHORD_TIMEOUT_MS);
    }
  },

  setEditorOpen: (open) => set({ editorOpen: open }),
  setLastRun: (id) => set({ lastRun: id }),

  resolve: (sequence) => resolveBinding(sequence, get().bindings, new Set(get().ctx)),

  isPrefix: (sequence) => prefixSet(get().bindings).has(sequence),
}));
