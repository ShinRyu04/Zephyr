import { create } from 'zustand';
import * as cmd from './commands';
import type { ModelInfo } from './commands';
import type { ModelTestResult, PublicModel } from './types';
import { useStore } from './store';

export type SectionId =
  | 'general'
  | 'editor'
  | 'theme'
  /* Icon themes: which pack draws the file-tree marks. Same family as `theme`
     (both answer "how does the editor look"), which is why it sits right below
     it in the rail rather than in Extensions. */
  | 'icons'
  | 'shortcuts'
  | 'agents'
  /* Rules guards WRITES, so it lives beside Permissions - both are about what
     the AI is allowed to do, and a user looking for one will look for the other. */
  | 'rules'
  | 'subagent'
  | 'permissions'
  | 'extensions'
  | 'lsp'
  | 'scm'
  | 'mcp'
  | 'devenv'
  | 'devupdate'
  | 'security'
  | 'accessibility'
  | 'ssh'
  /* Memory gets a page of its own because the destructive control on it is not
     a preference: the reader has to be able to SEE and DELETE what Zeph
     remembers between sessions, and a delete that runs inside the chat stream
     loses the wrong thing on a misclick. The section shows the saved entries
     (global + this project) and lets each one be removed. */
  | 'memori'
  | 'about';

export const SECTION_ORDER: SectionId[] = [
  'general',
  'editor',
  'theme',
  /* Icon themes sit directly under Themes: they are the same kind of choice -
     "how does the editor look" - and a reader who just changed the colours is
     the one most likely to want the icons to match. A separate top-level section
     would have been a second place to look for the same question. */
  'icons',
  'shortcuts',
  'extensions',
  'lsp',
  'scm',
  'devenv',
  'devupdate',

  'security',

  'accessibility',
  'ssh',
  'memori',
  'about',
];

/*
 * `models` USED TO SIT HERE and no longer does: the AI Models settings (provider,
 * API keys, base URL, model list, answer language/style, Local RAG) are now a
 * pop-up of their own - `AiModelsModal`, opened by `useAiModels` - because the
 * reader needs them exactly when the chat in front of them is failing with a 401,
 * not after crossing the window to a Settings page. The section component is the
 * same one the page rendered; only the place changed, and it is no longer one of
 * the editor-area Settings sections below.
 */

/*
 * `subagent` and `permissions` are NOT in the nav order any more: both are chat
 * settings — who does the work, which commands may run without asking — and they
 * now live in Chat Settings, whose sections carry the same controls (including
 * the custom sub-agent list and the command allow-list themselves, not just
 * doors to them). The SectionId type keeps them so deep links and the panels
 * still type-check; nothing routes there from the nav.
 *
 * `voice` and `mic` went further and left the type entirely: dictation and
 * speech output were REMOVED from Zephyr, so there is no panel to deep-link to.
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

  /**
   * The live model ids per provider.
   *
   * Ids only, on purpose: six components read this to build lists, and none of
   * them care about anything but the name. The metadata that travels with each
   * row lives in `remoteInfo` below.
   */
  remoteModels: Record<string, string[]>;

  /**
   * What each provider actually REPORTED about each model: input modalities,
   * supported parameters, context length, pricing.
   *
   * This is the half that used to be thrown away in the backend. It is kept in
   * its own map so the six id-only consumers above did not all have to learn
   * about it, and so a provider that reports nothing leaves no entry at all
   * rather than a row of empty fields that would read as "reported: nothing
   * supported".
   */
  remoteInfo: Record<string, Record<string, ModelInfo>>;

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
  remoteInfo: {},
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
      const keys = await cmd.getPublicModels();
      set({ keys, message: key.trim() ? 'API key saved' : 'API key removed' });

      /*
       * The SAME key list has to land in the AI store too.
       *
       * Two stores hold a copy of `getPublicModels` — this one, for the
       * Settings cards, and `useAi`, for the model picker and the composer
       * badge. Only this one was refreshed on save, so a provider saved here
       * stayed invisible in the picker until something else happened to call
       * `loadKeys` there. That is exactly how a `local` provider with a saved
       * key and a passing connection test still read as "5 providers hidden
       * because there is no API key yet".
       *
       * Assigning the freshly fetched array (rather than calling `loadKeys`)
       * keeps it to one IPC instead of two, and guarantees the two stores
       * cannot disagree about what was just saved.
       */
      const { useAi } = await import('./aiStore');
      useAi.setState({ keys });

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
      const info = await cmd.listModels(provider, baseUrl);
      const ids = info.map((m) => m.id);
      set((s) => ({
        remoteModels: { ...s.remoteModels, [provider]: ids },
        /* Only providers that actually said something get an entry. */
        remoteInfo: info.some((m) => m.input_modalities || m.supported_parameters || m.pricing)
          ? {
              ...s.remoteInfo,
              [provider]: Object.fromEntries(info.map((m) => [m.id, m])),
            }
          : s.remoteInfo,
        fetchingModels: null,
      }));
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
