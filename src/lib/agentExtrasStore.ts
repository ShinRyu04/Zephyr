import { create } from 'zustand';

/**
 * The content behind Agent Customizations' Skills / Hooks / Plugins sections.
 *
 * VSCode Copilot keeps these as real, editable lists — a skill is a reusable
 * instruction bundle, a hook is a command run at a lifecycle event, a plugin is
 * an installable package. Zephyr showed four empty "Nothing here yet." shells
 * instead, so the panel looked unfinished. This store gives those sections real
 * CRUD state, persisted to localStorage so the lists survive a reload without
 * needing a Rust round-trip (they are editor-local preferences, not secrets).
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

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  scope: 'workspace' | 'user';
}

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
  skills: Skill[];
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
    if (!raw) return { skills: [], hooks: [], installed: [] };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      skills: Array.isArray(p.skills) ? p.skills : [],
      hooks: Array.isArray(p.hooks) ? p.hooks : [],
      installed: Array.isArray(p.installed) ? p.installed : [],
    };
  } catch {
    return { skills: [], hooks: [], installed: [] };
  }
}

interface ExtrasState {
  skills: Skill[];
  hooks: Hook[];
  plugins: Plugin[];

  addSkill: (scope: Skill['scope']) => string;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  removeSkill: (id: string) => void;

  addHook: (scope: Hook['scope']) => string;
  updateHook: (id: string, patch: Partial<Hook>) => void;
  removeHook: (id: string) => void;

  installPlugin: (id: string, install: boolean) => void;
}

function persist(s: Pick<ExtrasState, 'skills' | 'hooks' | 'plugins'>): void {
  try {
    const data: Persisted = {
      skills: s.skills,
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
    skills: saved.skills,
    hooks: saved.hooks,
    plugins,

    addSkill: (scope) => {
      const id = uid();
      const skill: Skill = {
        id,
        name: 'New skill',
        description: '',
        body: '',
        enabled: true,
        scope,
      };
      set((s) => {
        const next = { skills: [...s.skills, skill] };
        persist({ ...get(), ...next });
        return next;
      });
      return id;
    },
    updateSkill: (id, patch) =>
      set((s) => {
        const next = { skills: s.skills.map((k) => (k.id === id ? { ...k, ...patch } : k)) };
        persist({ ...get(), ...next });
        return next;
      }),
    removeSkill: (id) =>
      set((s) => {
        const next = { skills: s.skills.filter((k) => k.id !== id) };
        persist({ ...get(), ...next });
        return next;
      }),

    addHook: (scope) => {
      const id = uid();
      const hook: Hook = {
        id,
        name: 'New hook',
        event: 'after-tool',
        command: '',
        enabled: true,
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
