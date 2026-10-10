import { create } from 'zustand';

/**
 * The content behind Agent Customizations' Hooks and Plugins sections.
 *
 * VSCode Copilot keeps these as real, editable lists — a hook is a command run
 * at a lifecycle event, a plugin is an installable package. Zephyr showed empty
 * "Nothing here yet." shells instead, so the panel looked unfinished. This
 * store gives those sections real CRUD state, persisted to localStorage so the
 * lists survive a reload without needing a Rust round-trip.
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
 * The marketplace of installable plugins is a fixed curated catalogue here —
 * Zephyr has no remote registry — so "install" flips a flag on a catalogue
 * entry rather than downloading anything.
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
}

/** A curated, installable extension. `installed` is the only mutable field. */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  /** The sections this plugin contributes to, shown as chips. */
  provides: string[];
  installed: boolean;
}

/** The fixed catalogue of plugins Zephyr ships. Mirrors Copilot's marketplace
 *  shape (name + description + install), but the set is local and curated. */
const PLUGIN_CATALOG: Plugin[] = [
  {
    id: 'conventional-commits',
    name: 'Conventional Commits',
    description: 'Teaches the agent the Conventional Commits spec and adds a commit-message skill plus a pre-commit hook.',
    provides: ['skill', 'hook'],
    installed: false,
  },
  {
    id: 'test-runner',
    name: 'Test Runner',
    description: 'Adds an after-write hook that runs the project test suite and a skill describing the test layout.',
    provides: ['hook', 'skill'],
    installed: false,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'A review agent and a skill with a thorough correctness-first review checklist.',
    provides: ['agent', 'skill'],
    installed: false,
  },
  {
    id: 'docs-writer',
    name: 'Docs Writer',
    description: 'A skill that keeps README and inline docs in sync with the code the agent changes.',
    provides: ['skill'],
    installed: false,
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'A hook that scans staged changes for secrets and a skill listing common vulnerability patterns.',
    provides: ['hook', 'skill'],
    installed: false,
  },
  {
    id: 'sql-helper',
    name: 'SQL Helper',
    description: 'A skill with query patterns and an MCP-style tool description for the local database.',
    provides: ['skill', 'mcp'],
    installed: false,
  },
];

export const HOOK_EVENTS: { id: HookEvent; label: string }[] = [
  { id: 'session-start', label: 'Session starts' },
  { id: 'session-end', label: 'Session ends' },
  { id: 'before-tool', label: 'Before a tool runs' },
  { id: 'after-tool', label: 'After a tool runs' },
  { id: 'before-write', label: 'Before a file write' },
];

interface Persisted {
  hooks: Hook[];
  /** Only the installed-flags are persisted, keyed by catalogue id. */
  installed: string[];
}

const LS_KEY = 'zephyr.agentExtras.v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { hooks: [], installed: [] };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      hooks: Array.isArray(p.hooks) ? p.hooks : [],
      installed: Array.isArray(p.installed) ? p.installed : [],
    };
  } catch {
    return { hooks: [], installed: [] };
  }
}

interface ExtrasState {
  hooks: Hook[];
  plugins: Plugin[];

  addHook: (scope: Hook['scope']) => string;
  updateHook: (id: string, patch: Partial<Hook>) => void;
  removeHook: (id: string) => void;

  installPlugin: (id: string, install: boolean) => void;
}

function persist(s: Pick<ExtrasState, 'hooks' | 'plugins'>): void {
  try {
    const data: Persisted = {
      hooks: s.hooks,
      installed: s.plugins.filter((p) => p.installed).map((p) => p.id),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* storage full/blocked — these lists are not critical */
  }
}

export const useAgentExtras = create<ExtrasState>((set, get) => {
  const saved = load();
  const plugins = PLUGIN_CATALOG.map((p) => ({ ...p, installed: saved.installed.includes(p.id) }));

  return {
    hooks: saved.hooks,
    plugins,
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

    installPlugin: (id, install) =>
      set((s) => {
        const next = { plugins: s.plugins.map((p) => (p.id === id ? { ...p, installed: install } : p)) };
        persist({ ...get(), ...next });
        return next;
      }),
  };
});
