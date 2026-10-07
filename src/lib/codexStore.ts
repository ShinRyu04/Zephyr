import { create } from 'zustand';
import * as cmd from './commands';

/*
 * Codex-only UI state for the hosted Codex TUI (CodexChat.tsx).
 *
 * This is deliberately SEPARATE from aiCliStore (which Claude Code also uses):
 * the Codex surface has controls the Claude surface does not — an approval
 * policy ("Ask for approval" / "Approve for me" / "Full access"), a work
 * location ("Local" / "Connect Codex web" / "Cloud"), an effort dial, and a
 * standalone Codex Settings page (General / Configuration / Personalization /
 * MCP servers / Hooks / Plugins). Keeping it here means nothing Codex does can
 * reach into the Chat or Claude Code tabs.
 *
 * The actual message send still runs headless through aiCliStore (`cli_chat`,
 * agentId 'codex'); this only holds the picker state and mirrors the chosen
 * model/effort into aiCliStore's opts so the next send carries the flag.
 */

export type ApprovalPolicy = 'ask' | 'auto' | 'full';
export type WorkLocation = 'local' | 'web' | 'cloud';

/** The approval-policy menu rows, with the exact wording from the app. */
export const APPROVAL_POLICIES: { id: ApprovalPolicy; label: string; sub: string; icon: string }[] = [
  { id: 'ask', label: 'Ask for approval', sub: 'Always ask to edit external files and use the internet', icon: 'hand' },
  { id: 'auto', label: 'Approve for me', sub: 'Only ask for actions detected as potentially unsafe', icon: 'shield' },
  { id: 'full', label: 'Full access', sub: 'Unrestricted access to the internet and any file on your computer', icon: 'bolt' },
];

/** The work-location menu rows. */
export const WORK_LOCATIONS: { id: WorkLocation; label: string; icon: string; external?: boolean; disabled?: boolean }[] = [
  { id: 'local', label: 'Local', icon: 'monitor' },
  { id: 'web', label: 'Connect Codex web', icon: 'cloud', external: true },
  { id: 'cloud', label: 'Cloud', icon: 'cloud', disabled: true },
];

/*
 * The reasoning-effort dial. Codex shows SIX notches, labelled left-to-right
 * Minimal · Light · Medium · High · Extra High · Max. The chip reads
 * "Custom {level}". Index 0 is the leftmost (Minimal) notch.
 */
export const CODEX_EFFORTS = ['Minimal', 'Light', 'Medium', 'High', 'Extra High', 'Max'] as const;
export type CodexEffort = (typeof CODEX_EFFORTS)[number];

/*
 * The CLI's own reasoning-effort words (config.toml `model_reasoning_effort`)
 * mapped to the six dial notches. Codex writes `minimal/low/medium/high`; we
 * map `low` to the "Light" notch and leave the two upper notches (Extra High /
 * Max) for selections the config does not name.
 */
export const EFFORT_FROM_CONFIG: Record<string, number> = {
  minimal: 0,
  low: 1,
  light: 1,
  medium: 2,
  high: 3,
  'extra high': 4,
  'extra-high': 4,
  xhigh: 4,
  max: 5,
};
/* The dial's six labels, matching the real app (screenshot). */
export const CODEX_EFFORT_LABELS = ['Minimal', 'Light', 'Medium', 'High', 'Extra High', 'Max'] as const;

/*
 * The "Select model" sheet. "Default" is the recommended set; the rest are the
 * selectable aliases, matching the real Codex model picker. Picking one is the
 * same as `codex exec --model <id>`.
 */
export const CODEX_MODELS: { id: string; label: string; sub?: string }[] = [
  { id: 'default', label: 'Default', sub: 'Recommended set of models' },
  { id: 'gpt-6.1-sol', label: '6.1 Sol' },
  { id: 'gpt-6-astra', label: '6 Astra' },
  { id: 'gpt-6-sol', label: '6 Sol' },
  { id: 'gpt-6-luna', label: '6 Luna' },
  { id: 'gpt-5.6-sol', label: '5.6 Sol' },
  { id: 'gpt-5.6-terra', label: '5.6 Terra' },
  { id: 'gpt-5.6-luna', label: '5.6 Luna' },
  { id: 'gpt-5.5', label: '5.5' },
];

/*
 * The persisted shape of Codex Settings — the General / Configuration /
 * Personalization panes. These are editor-local preferences (not secrets), so
 * they live in localStorage; nothing here is sent anywhere.
 */
export interface CodexSettings {
  /** General → Language for the app UI. */
  language: string;
  /** General → Review delivery (inline vs a detached chat). */
  reviewDelivery: 'inline' | 'detached';
  /** Composer → show the context-window usage meter. */
  showContextUsage: boolean;
  /** Composer → whether Enter sends or inserts a newline. */
  sendShortcut: 'enter' | 'mod-enter';
  /** Composer → queue follow-ups vs steer the current run. */
  followUp: 'queue' | 'steer';
  /** Personalization → the AGENTS.md custom instructions. */
  instructions: string;
  /** Personalization → create memories from chats. */
  memories: boolean;
  /** Personalization → allow memories from tool-assisted chats. */
  toolMemories: boolean;
}

const DEFAULT_SETTINGS: CodexSettings = {
  language: 'auto',
  reviewDelivery: 'inline',
  showContextUsage: false,
  sendShortcut: 'enter',
  followUp: 'queue',
  instructions: '',
  memories: false,
  toolMemories: true,
};

interface Persisted {
  approval: ApprovalPolicy;
  workLocation: WorkLocation;
  effort: number;
  model: string;
  settings: CodexSettings;
}

const LS_KEY = 'zephyr.codex.v1';

function load(): Persisted {
  const base: Persisted = {
    approval: 'ask',
    workLocation: 'local',
    effort: 0,
    model: 'default',
    settings: DEFAULT_SETTINGS,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...base,
      ...p,
      settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    };
  } catch {
    return base;
  }
}

interface CodexState extends Persisted {
  /** Whether the standalone Codex Settings page is open. */
  settingsOpen: boolean;
  settingsSection: 'general' | 'configuration' | 'personalization' | 'mcp' | 'hooks' | 'plugins';
  /**
   * The real model / effort / provider read from ~/.codex/config.toml, so the
   * picker reflects what the logged-in CLI actually runs. `null` until loaded
   * or when there is no config. This is the ONLY truthful local source — the
   * full server-side catalogue is not stored on disk — so it is used to mark
   * and preselect the real default, not to invent a list.
   */
  account: cmd.CodexConfig | null;

  setApproval: (p: ApprovalPolicy) => void;
  setWorkLocation: (w: WorkLocation) => void;
  setEffort: (e: number) => void;
  setModel: (m: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (s: CodexState['settingsSection']) => void;
  patchSettings: (patch: Partial<CodexSettings>) => void;
  /** Fetch the live config once; preselects effort from it on first load. */
  loadAccount: () => Promise<void>;
}

function persist(s: CodexState): void {
  try {
    const data: Persisted = {
      approval: s.approval,
      workLocation: s.workLocation,
      effort: s.effort,
      model: s.model,
      settings: s.settings,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* storage blocked — the picker is not critical */
  }
}

const boot = load();

export const useCodex = create<CodexState>((set, get) => ({
  ...boot,
  settingsOpen: false,
  settingsSection: 'general',
  account: null,

  setApproval: (approval) => set(() => { const next = { approval }; persist({ ...get(), ...next }); return next; }),
  setWorkLocation: (workLocation) => set(() => { const next = { workLocation }; persist({ ...get(), ...next }); return next; }),
  setEffort: (effort) => set(() => { const next = { effort }; persist({ ...get(), ...next }); return next; }),
  setModel: (model) => set(() => { const next = { model }; persist({ ...get(), ...next }); return next; }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  patchSettings: (patch) =>
    set((s) => {
      const next = { settings: { ...s.settings, ...patch } };
      persist({ ...get(), ...next });
      return next;
    }),

  /*
   * Read the live config ONCE and reflect it. The effort dial is preselected
   * from `model_reasoning_effort` so the picker opens on the value a terminal
   * run would use; it is only applied the first time (when the user has not
   * already moved the dial), so a manual choice is never overwritten on reload.
   */
  loadAccount: async () => {
    if (get().account) return;
    try {
      const account = await cmd.codexConfig();
      set((s) => {
        const effort =
          account.reasoning_effort != null && EFFORT_FROM_CONFIG[account.reasoning_effort] != null && s.effort === boot.effort
            ? EFFORT_FROM_CONFIG[account.reasoning_effort]
            : s.effort;
        const next = { account, effort };
        persist({ ...get(), ...next });
        return next;
      });
    } catch {
      /* No config / command failed — keep the UI's own defaults. */
    }
  },
}));
