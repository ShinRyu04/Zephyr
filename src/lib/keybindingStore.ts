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

  /* Raw keybindings.json entries, before settings.shortcuts is merged in. */
  kbRaw: UserBinding[];
}

interface KbActions {
  load: () => Promise<void>;

  /* Re-read settings.shortcuts after that side changes. */
  syncDariSettings: () => void;

  /* The raw keybindings.json entries, kept so a settings sync never drops them. */
  rawKb: () => UserBinding[];

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

/*
 * Merge the two chord sources, with settings.json winning.
 *
 * Settings is the page users actually remap from, so it has to be the source
 * that takes effect; keybindings.json only adds chords that are not set
 * there. Keeping the merge in one place is what stops the old chord from
 * staying live after a remap.
 */
function gabungSumber(dariKb: UserBinding[]): UserBinding[] {
  const dariSettings = Object.entries(useStore.getState().settings.shortcuts ?? {})
    .filter(([, v]) => typeof v === 'string' && v)
    .map(([command, key]) => ({ command, key: String(key) }));
  const peta = new Map<string, UserBinding>();
  for (const u of dariKb) peta.set(u.command, u);
  for (const u of dariSettings) peta.set(u.command, u);
  return [...peta.values()];
}

export const useKb = create<KbState & KbActions>((set, get) => ({
  user: [],
  bindings: DEFAULT_BINDINGS,
  ctx: ['global'],
  pending: '',
  editorOpen: false,
  lastRun: null,
  kbError: null,
  kbRaw: [],
  rawKb: () => get().kbRaw,

  load: async () => {
    try {
      const raw = await cmd.getKeybindings();
      const dariKb = Array.isArray(raw) ? (raw as UserBinding[]) : [];
      const user = gabungSumber(dariKb);
      set({ kbRaw: dariKb, user, bindings: mergeBindings(user, keymapEkstensi()), kbError: null });
    } catch (e) {
      const user = gabungSumber([]);
      set({ kbRaw: [], user, bindings: mergeBindings(user, keymapEkstensi()), kbError: cmd.asZephyrError(e).message });
    }
  },

  /*
   * Re-read the shortcuts that live in settings.json.
   *
   * There are two places a chord can be set: settings.shortcuts (what the
   * Settings page writes) and keybindings.json (what the keybindings editor
   * writes). load() merged both once at startup, so a remap made from
   * Settings afterwards left the old chord live in `bindings` — the old
   * shortcut kept firing and the new one did nothing until a reload. Every
   * write path calls this so the two stay in step.
   */
  syncDariSettings: () => {
    const user = gabungSumber(get().rawKb());
    set({ user, bindings: mergeBindings(user, keymapEkstensi()) });
  },

  remap: async (command, chord, when) => {
    const c = normalizeChord(chord);
    if (!c) return;
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: c, command, when: when ?? 'global' });
    const kbRaw = get().kbRaw.filter((u) => u.command !== command);
    kbRaw.push({ key: c, command, when: when ?? 'global' });
    set({ kbRaw, user, bindings: mergeBindings(user, keymapEkstensi()) });
    try {
      await cmd.setKeybindings(user);
    } catch (e) {
      set({ kbError: cmd.asZephyrError(e).message });
    }
  },

  removeBinding: async (command) => {
    const user = get().user.filter((u) => u.command !== command);
    user.push({ key: '', command, remove: true });
    const kbRaw = get().kbRaw.filter((u) => u.command !== command);
    kbRaw.push({ key: '', command, remove: true });
    set({ kbRaw, user, bindings: mergeBindings(user, keymapEkstensi()) });
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
