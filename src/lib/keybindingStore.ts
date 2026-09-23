import { create } from 'zustand';
import { useStore } from './store';
import { keymapEkstensi } from './extLoader';
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

export const CHORD_TIMEOUT_MS = 1500;

interface KbState {

  user: UserBinding[];

  bindings: KeyBinding[];

  ctx: WhenCtx[];

  pending: string;

  editorOpen: boolean;

  lastRun: string | null;

  kbError: string | null;
}

interface KbActions {
  load: () => Promise<void>;

  remap: (command: string, chord: string, when?: WhenCtx) => Promise<void>;

  removeBinding: (command: string) => Promise<void>;

  resetOne: (command: string) => Promise<void>;
  resetAll: () => Promise<void>;
  setCtx: (key: WhenCtx, on: boolean) => void;
  setPending: (chord: string) => void;
  setEditorOpen: (open: boolean) => void;
  setLastRun: (id: string | null) => void;

  resolve: (sequence: string) => KeyBinding | null;

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
      const dariKb = Array.isArray(raw) ? (raw as UserBinding[]) : [];

      const dariSettings = Object.entries(useStore.getState().settings.shortcuts ?? {})
        .filter(([, v]) => typeof v === 'string' && v)
        .map(([command, key]) => ({ command, key: String(key) }));
      const peta = new Map<string, UserBinding>();
      for (const u of dariKb) peta.set(u.command, u);
      for (const u of dariSettings) peta.set(u.command, u);
      const user = [...peta.values()];
      set({ user, bindings: mergeBindings(user, keymapEkstensi()), kbError: null });
    } catch (e) {

      set({ user: [], bindings: DEFAULT_BINDINGS, kbError: cmd.asZephyrError(e).message });
    }
  },

  remap: async (command, chord, when) => {
    const c = normalizeChord(chord);
    if (!c) return;
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: c, command, when: when ?? 'global' });
    set({ user, bindings: mergeBindings(user, keymapEkstensi()) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  removeBinding: async (command) => {
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: '', command, remove: true });
    set({ user, bindings: mergeBindings(user, keymapEkstensi()) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  resetOne: async (command) => {
    const user = get().user.filter((u) => u.command !== command);
    set({ user, bindings: mergeBindings(user, keymapEkstensi()) });
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

      timer = window.setTimeout(() => set({ pending: '' }), CHORD_TIMEOUT_MS);
    }
  },

  setEditorOpen: (open) => set({ editorOpen: open }),
  setLastRun: (id) => set({ lastRun: id }),

  resolve: (sequence) => resolveBinding(sequence, get().bindings, new Set(get().ctx)),

  isPrefix: (sequence) => prefixSet(get().bindings).has(sequence),
}));
