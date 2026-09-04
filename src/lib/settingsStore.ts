// settingsStore.ts — state khusus halaman Settings (fase 08).
// Dipisah dari store utama supaya membuka Settings tidak menyentuh state
// editor/terminal, dan supaya section aktif tidak ikut tersimpan ke disk.

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
  'extensions',
  'lsp',
  'scm',
  'mcp',
  // fase 29: Workspace Trust. Ditempatkan sebelum 'ssh' karena keduanya
  // section keamanan, dan 'about' harus tetap terakhir.
  'security',
  // fase 31: Accessibility. Setelah 'security' karena keduanya "kebijakan
  // app", bukan konfigurasi fitur.
  'accessibility',
  'ssh',
  'about',
];

interface SettingsUiState {
  section: SectionId;
  /** status API key per provider (dari Rust, tanpa key asli) */
  keys: PublicModel[];
  /** hasil test connection terakhir per provider */
  testResults: Record<string, ModelTestResult>;
  testing: string | null;
  /** action yang sedang menunggu tombol ditekan (Shortcuts) */
  capturing: string | null;
  /** peringatan konflik shortcut: actionId -> pesan */
  conflictWarning: string | null;
  /** tahap konfirmasi Reset Semua: 0 = tidak aktif, 1 = tanya, 2 = tanya lagi */
  resetStage: 0 | 1 | 2;
  message: string | null;
}

interface SettingsUiActions {
  setSection: (s: SectionId) => void;
  loadKeys: () => Promise<void>;
  saveKey: (provider: string, key: string) => Promise<void>;
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
    } catch (e) {
      set({ message: cmd.asZephyrError(e).message });
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
