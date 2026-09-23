import { create } from 'zustand';
import * as cmd from './commands';
import type { ModelTestResult, PublicModel } from './types';

export type SectionId =
  | 'general'
  | 'editor'
  | 'theme'
  | 'shortcuts'
  | 'models'
  | 'agents'
  | 'subagent'
  | 'aiprompt'
  | 'extensions'
  | 'lsp'
  | 'scm'
  | 'mcp'
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
  'agents',
  'subagent',
  'aiprompt',
  'extensions',
  'lsp',
  'scm',
  'mcp',

  'security',

  'accessibility',
  'ssh',
  'about',
];

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
      set({ keys: await cmd.getPublicModels(), message: key.trim() ? 'API key tersimpan' : 'API key dihapus' });

      if (key.trim()) void get().refreshRemoteModels(provider);
      else set((s) => ({ remoteModels: { ...s.remoteModels, [provider]: [] } }));
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message });
    }
  },

  refreshRemoteModels: async (provider) => {
    set({ fetchingModels: provider });
    try {
      const ids = await cmd.listModels(provider);
      set((s) => ({ remoteModels: { ...s.remoteModels, [provider]: ids }, fetchingModels: null }));
      return ids;
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message, fetchingModels: null });
      return [];
    }
  },

  testConnection: async (provider, baseUrl) => {
    set({ testing: provider });
    try {
      const r = await cmd.testModelConnection(provider, baseUrl);
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
