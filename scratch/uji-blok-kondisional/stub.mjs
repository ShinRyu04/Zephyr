/* Dihasilkan uji-blok-kondisional.mjs - stub modul berat untuk mengukur prompt. */
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
export const fsRead = async () => ({ isi: '' });
export const instructionRead = async () => '';
export const blokPersona = () => ({ identitas: '', caraKerja: '', aturan: '' });
export const personaAktif = () => ({ nama: 'Zeph', identitas: '', caraKerja: '', aturan: '' });
export const blokKeadaan = () => '';
export const suntikanIndeks = (kueri = '') => '[INDEKS-LAPIS2:' + String(kueri).length + ']';
export const mcpTerpotong = () => [];
export const blokKeadaanRingkas = () => '[POTRET]';
export const useTerminal = { getState: () => ({ allPanes: () => [] }) };
export const useHistory = { getState: () => ({ timeline: [], stats: null }) };
export const blokMemoriTersimpan = () => '';
export const BATAS_TOKEN_BAWAAN = 900;
export const useInstructions = { getState: () => ({ daftar: [], muat: async () => undefined }) };
export const cocokPola = () => false;
