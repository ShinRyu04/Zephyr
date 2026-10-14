import { create } from 'zustand';

/**
 * The content behind Agent Customizations' Hooks section.
 *
 * VSCode Copilot keeps hooks as a real, editable list — a command run at a
 * lifecycle event. Zephyr showed an empty "Nothing here yet." shell instead, so
 * the panel looked unfinished. This store gives the section real CRUD state,
 * persisted to localStorage so the list survives a reload without needing a
 * Rust round-trip.
 *
 * ## Skills are NOT here any more
 *
 * They moved to `skillsStore`, which reads and writes real files through
 * `skills.rs`. Skills had to leave: the agent runtime builds its prompt by
 * walking skill folders on DISK, so a skill held in localStorage was written
 * somewhere nothing could read it — the row appeared in the panel and the agent
 * never learned the skill existed. Keeping a second copy here as well would
 * mean two lists that can disagree, with the UI showing one and the prompt
 * built from the other.
 *
 * ## Hooks are persisted but never executed
 *
 * There is no hook executor in Zephyr: nothing reads `hooks` except this panel,
 * so a saved hook is a note to the reader, not a behaviour. The UI says so
 * rather than implying a command will run. A hook that LOOKED live while
 * running nothing would be worse than no hook at all — the reader would trust a
 * guard that is not there. Wiring an executor means implementing timeouts,
 * cancellation, output caps, exit-code handling and workspace-trust checks
 * first; until then this list is a draft area, and it is labelled as one.
 *
 * ## Plugins are NOT here any more
 *
 * The plugin catalogue used to be a fixed array in this file and "install"
 * merely flipped a boolean on it, so the panel claimed a package was installed
 * while nothing on disk or in settings changed. Plugins are real now — packages
 * with a manifest, installed by `plugins.rs` and listed by `pluginsStore` — and
 * a plugin's hooks arrive here through `setHooksDariPlugin`, tagged with the
 * plugin's name so disabling it removes exactly what it added.
 */

export type HookEvent =
  | 'before-tool'
  | 'after-tool'
  | 'session-start'
  | 'session-end'
  | 'before-write';

export interface Hook {
  id: string;
  name: string;
  event: HookEvent;
  command: string;
  enabled: boolean;
  scope: 'workspace' | 'user';
  /** Set when a plugin contributed the hook, so a disable can remove it. */
  plugin?: string;
}

/**
 * Every event the UI may offer, with the label and the plain-language reason.
 *
 * `live` is the honest half. Only two of these have a caller that fires them
 * (see `hookRuntime.EVENT_AKTIF`): a hook on one of the other three is stored,
 * listed and enabled — and never runs. That is worse than not offering the
 * event at all, because the reader trusts a guard that does not exist.
 *
 * The flag lives on the catalogue rather than being derived in the component so
 * there is one place to change when an event is wired up. Deriving it in the UI
 * from `EVENT_AKTIF` would work too, but it would put the runtime's list and
 * the catalogue's list one import apart with nothing checking that they agree.
 */
export const HOOK_EVENTS: {
  id: HookEvent;
  label: string;
  /** True when this runtime actually fires the event. */
  live: boolean;
  /** Shown when `live` is false: what happens instead of the hook running. */
  why?: string;
}[] = [
  { id: 'session-start', label: 'Session starts', live: true },
  { id: 'session-end', label: 'Session ends', live: true },
  {
    id: 'before-tool',
    label: 'Before a tool runs',
    live: false,
    why: 'Not wired up: it would fire between your approval and the action it approved.',
  },
  {
    id: 'after-tool',
    label: 'After a tool runs',
    live: false,
    why: 'Not wired up: it would fire between your approval and the action it approved.',
  },
  {
    id: 'before-write',
    label: 'Before a file write',
    live: false,
    why: 'Not wired up: it would fire between your approval and the action it approved.',
  },
];

/** The events this build genuinely fires. Kept next to the catalogue so the
 *  two lists are read together; `hookRuntime.EVENT_AKTIF` is the runtime's
 *  copy and a test asserts they match. */
export const HOOK_EVENT_HIDUP: HookEvent[] = HOOK_EVENTS.filter((e) => e.live).map((e) => e.id);

interface Persisted {
  hooks: Hook[];
}

const LS_KEY = 'zephyr.agentExtras.v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { hooks: [] };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      hooks: Array.isArray(p.hooks) ? p.hooks : [],
    };
  } catch {
    return { hooks: [] };
  }
}

interface ExtrasState {
  hooks: Hook[];

  addHook: (scope: Hook['scope']) => string;
  updateHook: (id: string, patch: Partial<Hook>) => void;
  removeHook: (id: string) => void;

  /** Replace every hook that came from `plugin` with this set (used on enable). */
  setHooksDariPlugin: (plugin: string, hooks: Hook[]) => void;
  /** Drop every hook that came from `plugin` (used on disable and remove). */
  hapusHooksDariPlugin: (plugin: string) => void;
}

function persist(s: Pick<ExtrasState, 'hooks'>): void {
  try {
    const data: Persisted = { hooks: s.hooks };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* storage full/blocked — this list is not critical */
  }
}

export const useAgentExtras = create<ExtrasState>((set, get) => {
  const saved = load();

  return {
    hooks: saved.hooks,
    addHook: (scope) => {
      const id = uid();
      const hook: Hook = {
        id,
        name: 'New hook',
        event: 'session-end',
        command: '',
        enabled: false,
        scope,
      };
      set((s) => {
        const next = { hooks: [...s.hooks, hook] };
        persist({ ...get(), ...next });
        return next;
      });
      return id;
    },
    updateHook: (id, patch) =>
      set((s) => {
        const next = { hooks: s.hooks.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
        persist({ ...get(), ...next });
        return next;
      }),
    removeHook: (id) =>
      set((s) => {
        const next = { hooks: s.hooks.filter((h) => h.id !== id) };
        persist({ ...get(), ...next });
        return next;
      }),

    /*
     * A plugin's hooks replace that plugin's previous set wholesale rather than
     * merging: re-enabling after an edit must not leave an old command behind
     * under the same id.
     */
    setHooksDariPlugin: (plugin, hooks) =>
      set((s) => {
        const next = {
          hooks: [
            ...s.hooks.filter((h) => h.plugin !== plugin),
            ...hooks.map((h) => ({ ...h, plugin })),
          ],
        };
        persist({ ...get(), ...next });
        return next;
      }),

    hapusHooksDariPlugin: (plugin) =>
      set((s) => {
        const next = { hooks: s.hooks.filter((h) => h.plugin !== plugin) };
        persist({ ...get(), ...next });
        return next;
      }),
  };
});
