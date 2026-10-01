import { create } from 'zustand';

export type Kesopanan = 'polite' | 'assertive';

interface A11yState {
  
  pesan: string;
  
  pesanPenting: string;
  
  urutan: number;
  
  riwayat: { teks: string; kesopanan: Kesopanan; at: number }[];
}

interface A11yActions {
  
  umumkan: (teks: string, kesopanan?: Kesopanan) => void;
  bersihkan: () => void;
}

export const MAX_RIWAYAT = 30;

export const useA11y = create<A11yState & A11yActions>((set, get) => ({
  pesan: '',
  pesanPenting: '',
  urutan: 0,
  riwayat: [],

  umumkan: (teks, kesopanan = 'polite') => {
    const bersih = String(teks ?? '').trim();
    if (!bersih) return;
    const n = get().urutan + 1;
    const riwayat = [
      ...get().riwayat,
      { teks: bersih, kesopanan, at: Date.now() },
    ].slice(-MAX_RIWAYAT);

    if (kesopanan === 'assertive') set({ pesanPenting: bersih, urutan: n, riwayat });
    else set({ pesan: bersih, urutan: n, riwayat });
  },

  bersihkan: () => set({ pesan: '', pesanPenting: '' }),
}));

export const umumkan = (teks: string, kesopanan: Kesopanan = 'polite') =>
  useA11y.getState().umumkan(teks, kesopanan);

export interface AccessibilitySettings {
  
  reducedMotion: boolean;
  
  screenReader: boolean;
  
  autoFocusDialog: boolean;
  
  toastDurasiMin: number;
}

export const DEFAULT_A11Y: AccessibilitySettings = {
  reducedMotion: false,
  screenReader: false,
  autoFocusDialog: true,
  
  toastDurasiMin: 3200,
};

export function terapkanA11y(a: Partial<AccessibilitySettings> | undefined): AccessibilitySettings {
  const nilai: AccessibilitySettings = { ...DEFAULT_A11Y, ...(a ?? {}) };
  const root = document.documentElement;

  if (nilai.reducedMotion) root.dataset.reducedMotion = 'true';
  else delete root.dataset.reducedMotion;

  if (nilai.screenReader) root.dataset.screenReader = 'true';
  else delete root.dataset.screenReader;

  return nilai;
}

export const osMintaReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const reducedMotionEfektif = (a: Partial<AccessibilitySettings> | undefined): boolean =>
  !!a?.reducedMotion || osMintaReducedMotion();
