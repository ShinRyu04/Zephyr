import { create } from 'zustand';
import * as cmd from './commands';
import type { ModelTestResult, PublicModel } from './types';
import { useStore } from './store';

export type SectionId =
  | 'general'
  | 'editor'
  | 'theme'
  | 'shortcuts'
  | 'models'
  | 'agents'
  /* Voice sits next to Agents, not under Accessibility: it belongs to the chat
     panel, and someone looking for it will look where the AI settings are. */
  | 'voice'
  | 'mic'
  /* Rules guards WRITES, so it lives beside Permissions - both are about what
     the AI is allowed to do, and a user looking for one will look for the other. */
  | 'rules'
  | 'subagent'
  | 'permissions'
  | 'extensions'
  | 'lsp'
  | 'scm'
  | 'mcp'
  | 'tests'
  | 'devenv'
  | 'devupdate'
  | 'security'
  | 'accessibility'
  | 'ssh'
  | 'about';

export const SECTION_ORDER: SectionId[] = [
  'general',
  'editor',
  'theme',
  'shortcuts',
  'models',
  'permissions',
  'extensions',
  'lsp',
  'scm',
  'tests',
  'devenv',
  'devupdate',

  'security',

  'accessibility',
  'ssh',
  'about',
];

/*
 * `subagent`, `voice` and `mic` are NOT in the nav order any more: all three are
 * chat settings — who does the work, how the assistant speaks, how you dictate —
 * and they now live in Chat Settings, whose section carries the same controls
 * including the custom-sub-agent list and both API keys. The SectionId type
 * keeps them so deep links and the panels themselves still type-check; nothing
 * routes there from the nav.
 *
 * `agents`, `rules` and `mcp` left the nav earlier for the same reason: they
 * moved into the Agent Customizations modal (its Agents / Instructions / MCP
 * Servers panes reuse the very same components).
 */

interface SettingsUiState {
  section: SectionId;

  keys: PublicModel[];

  testResults: Record<string, ModelTestResult>;
  testing: string | null;

  capturing: string | null;

  conflictWarning: string | null;

  resetStage: 0 | 1 | 2;
  message: string | null;

  remoteModels: Record<string, string[]>;

  fetchingModels: string | null;
}

interface SettingsUiActions {
  setSection: (s: SectionId) => void;
  loadKeys: () => Promise<void>;
  saveKey: (provider: string, key: string) => Promise<void>;
  refreshRemoteModels: (provider: string) => Promise<string[]>;
  testConnection: (provider: string, baseUrl?: string) => Promise<void>;
  setCapturing: (actionId: string | null) => void;
  setConflictWarning: (msg: string | null) => void;
  setResetStage: (n: 0 | 1 | 2) => void;
  setMessage: (m: string | null) => void;
  hasKey: (provider: string) => boolean;
  keyPreview: (provider: string) => string;
}

export const useSettingsUi = create<SettingsUiState & SettingsUiActions>((set, get) => ({
  section: 'general',
  keys: [],
  testResults: {},
  testing: null,
  capturing: null,
  conflictWarning: null,
  resetStage: 0,
  message: null,

  remoteModels: {},
  fetchingModels: null,

  setSection: (s) => set({ section: s, capturing: null, conflictWarning: null, resetStage: 0 }),

  loadKeys: async () => {
    try {
      set({ keys: await cmd.getPublicModels() });
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message });
    }
  },

  saveKey: async (provider, key) => {
    try {
      await cmd.setModelKey(provider, key);
      set({ keys: await cmd.getPublicModels(), message: key.trim() ? 'API key saved' : 'API key removed' });

      if (key.trim()) void get().refreshRemoteModels(provider);
      else set((s) => ({ remoteModels: { ...s.remoteModels, [provider]: [] } }));
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message });
    }
  },

  refreshRemoteModels: async (provider) => {
    set({ fetchingModels: provider });
    try {
      /*
       * The base URL has to come along.
       *
       * `list_models` builds its request from the provider plus an optional
       * override; for a custom gateway the provider id alone resolves to
       * nothing, so the call returned an empty list and the pickers that read
       * `remoteModels` showed only the static catalogue. The override lives in
       * settings, which is what this store is for.
       */
      const baseUrl =
        (useStore.getState().settings.models.providers ?? {})[provider]?.baseUrl || undefined;
      const ids = await cmd.listModels(provider, baseUrl);
      set((s) => ({ remoteModels: { ...s.remoteModels, [provider]: ids }, fetchingModels: null }));
      return ids;
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message, fetchingModels: null });
      return [];
    }
  },

  testConnection: async (provider, baseUrl) => {
    set({ testing: provider });
    /*
     * Here `baseUrl` is passed through UNCONDITIONALLY, including when it is
     * empty, so the backend decides what an empty string means. The settings UI
     * used to send `cfg.baseUrl || undefined`, which turned "the field is blank"
     * into "no argument" - and the backend's old catch-all then quietly read
     * that as api.openai.com. An explicit "" reaches `endpoint_for`, which
     * refuses `custom` with a clear message instead of inventing a host.
     */
    const dikirim = baseUrl === undefined || baseUrl === null ? baseUrl : String(baseUrl).trim();
    try {
      const r = await cmd.testModelConnection(provider, dikirim);
      set((s) => ({ testResults: { ...s.testResults, [provider]: r }, testing: null }));
    } catch (e) {
      set((s) => ({
        testResults: {
          ...s.testResults,
          [provider]: { ok: false, message: cmd.asZephyrError(e).message, status: null, ms: 0 },
        },
        testing: null,
      }));
    }
  },

  setCapturing: (actionId) => set({ capturing: actionId, conflictWarning: null }),
  setConflictWarning: (msg) => set({ conflictWarning: msg }),
  setResetStage: (n) => set({ resetStage: n }),
  setMessage: (m) => set({ message: m }),

  hasKey: (provider) => get().keys.some((k) => k.provider === provider && k.hasKey),
  keyPreview: (provider) => get().keys.find((k) => k.provider === provider)?.preview ?? '',
}));
