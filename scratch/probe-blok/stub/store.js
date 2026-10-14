/* Stub untuk probe CLI: modul yang butuh browser/tauri diganti nilai tetap. */
export const useStore = {
  getState: () => ({
    settings: {
      general: { uiLang: process.env.UI_LANG || 'en' },
      agents: { customInstructions: '' },
      models: {},
    },
    workspace: process.env.WS ?? 'D:/Proyek',
  }),
  setState: () => undefined,
  subscribe: () => () => undefined,
};
