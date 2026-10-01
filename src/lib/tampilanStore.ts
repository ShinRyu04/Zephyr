import { create } from 'zustand';

export type ModeTampilan = 'normal' | 'zen';

interface TampilanState {

  mode: ModeTampilan;
  setMode: (m: ModeTampilan) => void;
  toggleZen: () => void;

  peek: { path: string; baris: number; teks: string[] } | null;
  setPeek: (p: TampilanState['peek']) => void;

  gambar: { path: string; dataUrl: string; lebar: number; tinggi: number } | null;
  setGambar: (g: TampilanState['gambar']) => void;

  terpasang: boolean;
  setTerpasang: (v: boolean) => void;
}

export const useTampilan = create<TampilanState>((set, get) => ({
  mode: 'normal',
  setMode: (m) => set({ mode: m }),
  toggleZen: () => set({ mode: get().mode === 'zen' ? 'normal' : 'zen' }),

  peek: null,
  setPeek: (p) => set({ peek: p }),

  gambar: null,
  setGambar: (g) => set({ gambar: g }),

  terpasang: false,
  setTerpasang: (v) => set({ terpasang: v }),
}));

export const EXT_GAMBAR = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.svg',
];

export function apakahGambar(nama: string): boolean {
  const n = nama.toLowerCase();
  return EXT_GAMBAR.some((e) => n.endsWith(e));
}

export function mimeGambar(nama: string): string {
  const n = nama.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.bmp')) return 'image/bmp';
  if (n.endsWith('.ico')) return 'image/x-icon';
  if (n.endsWith('.avif')) return 'image/avif';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
