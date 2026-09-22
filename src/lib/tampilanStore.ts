// zenmode.ts — Zen mode + image preview + peek (T3.4).
//
// TIGA FITUR KECIL YANG SAMA-SAMA MENGURANGI GANGGUAN:
//   1. Zen mode — sembunyikan Activity Bar + sidebar + panel + status bar,
//      sisakan editor. Untuk menulis tanpa distraksi.
//   2. Image preview — file gambar dibuka sebagai pratinjau, bukan teks biner.
//   3. Peek — lihat definisi/isi tanpa membuka tab baru (overlay di editor).
//
// KENAPA digabung satu modul: ketiganya adalah penyesuaian TAMPILAN, bukan
// fitur yang punya state sendiri-sendiri. Memisahkannya jadi tiga store kecil
// hanya menambah berkas tanpa manfaat.

import { create } from 'zustand';

/** Mode tampilan yang sedang aktif. */
export type ModeTampilan = 'normal' | 'zen';

interface TampilanState {
  /** 'zen' menyembunyikan semua panel kecuali editor. */
  mode: ModeTampilan;
  setMode: (m: ModeTampilan) => void;
  toggleZen: () => void;

  /** Peek: file + baris yang sedang diintip (null = tidak ada). */
  peek: { path: string; baris: number; teks: string[] } | null;
  setPeek: (p: TampilanState['peek']) => void;

  /** Pratinjau gambar: path + data URL. */
  gambar: { path: string; dataUrl: string; lebar: number; tinggi: number } | null;
  setGambar: (g: TampilanState['gambar']) => void;

  /** true saat komponen pratinjau benar-benar terpasang di DOM. */
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

/** Ekstensi yang dibuka sebagai gambar, bukan teks. */
export const EXT_GAMBAR = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.svg',
];

/** Apakah sebuah nama file adalah gambar. */
export function apakahGambar(nama: string): boolean {
  const n = nama.toLowerCase();
  return EXT_GAMBAR.some((e) => n.endsWith(e));
}

/** Tipe MIME dari ekstensi (untuk data URL). */
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
