// outputStore.ts — kanal log aplikasi (fase 20).
//
// Buffer MELINGKAR per channel dengan cap 5000 baris. Tanpa cap, satu task
// yang mencetak terus (mis. `npm run dev` di fase 23) akan menghabiskan RAM
// sampai app mati — target proyek ini < 400MB.
//
// `lines` disimpan sebagai array string, dan `append` memecah teks masuk per
// '\n'. Alasannya: OutputView virtualized butuh indeks baris yang stabil untuk
// menghitung tinggi scroll; menyimpan blob lalu split saat render = O(n) tiap
// frame.

import { create } from 'zustand';

export const MAX_LINES = 5000;

export interface OutputChannel {
  id: string;
  label: string;
  lines: string[];
  /** true = ada baris baru sejak channel terakhir dilihat */
  dirty: boolean;
}

interface OutputState {
  channels: OutputChannel[];
  activeChannel: string;
  /** auto-scroll ke bawah saat baris baru masuk */
  autoScroll: boolean;
  wrap: boolean;
}

interface OutputActions {
  addChannel: (id: string, label: string) => void;
  removeChannel: (id: string) => void;
  append: (channelId: string, text: string) => void;
  clear: (channelId: string) => void;
  setActiveChannel: (id: string) => void;
  setAutoScroll: (v: boolean) => void;
  toggleAutoScroll: () => void;
  setWrap: (v: boolean) => void;
  toggleWrap: () => void;
  /** daftar ringkas untuk dropdown */
  list: () => { id: string; label: string; lines: number; dirty: boolean }[];
  lines: (channelId: string) => string[];
}

/** Channel bawaan. "Tasks" ditambahkan fase 23. */
const DEFAULT_CHANNELS: OutputChannel[] = [
  { id: 'zephyr', label: 'Zephyr', lines: [], dirty: false },
  { id: 'lsp', label: 'LSP', lines: [], dirty: false },
  { id: 'mcp', label: 'MCP', lines: [], dirty: false },
  { id: 'ssh', label: 'SSH', lines: [], dirty: false },
  { id: 'extensions', label: 'Extensions', lines: [], dirty: false },
  { id: 'debug', label: 'Debug', lines: [], dirty: false },
];

export const useOutput = create<OutputState & OutputActions>((set, get) => ({
  channels: DEFAULT_CHANNELS.map((c) => ({ ...c, lines: [] })),
  activeChannel: 'zephyr',
  autoScroll: true,
  wrap: false,

  addChannel: (id, label) =>
    set((s) =>
      s.channels.some((c) => c.id === id)
        ? {}
        : { channels: [...s.channels, { id, label, lines: [], dirty: false }] },
    ),

  removeChannel: (id) =>
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== id),
      activeChannel: s.activeChannel === id ? (s.channels[0]?.id ?? 'zephyr') : s.activeChannel,
    })),

  append: (channelId, text) =>
    set((s) => {
      const idx = s.channels.findIndex((c) => c.id === channelId);
      if (idx < 0) return {};
      // Baris kosong di akhir (dari teks yang diakhiri '\n') dibuang supaya
      // tidak menumpuk baris hampa setiap append.
      const masuk = text.split('\n');
      if (masuk.length > 1 && masuk[masuk.length - 1] === '') masuk.pop();
      if (masuk.length === 0) return {};

      const ch = s.channels[idx];
      const gabung = ch.lines.concat(masuk);
      const lines = gabung.length > MAX_LINES ? gabung.slice(gabung.length - MAX_LINES) : gabung;
      const next = s.channels.slice();
      next[idx] = { ...ch, lines, dirty: s.activeChannel !== channelId };
      return { channels: next };
    }),

  clear: (channelId) =>
    set((s) => {
      const idx = s.channels.findIndex((c) => c.id === channelId);
      if (idx < 0) return {};
      const next = s.channels.slice();
      next[idx] = { ...next[idx], lines: [], dirty: false };
      return { channels: next };
    }),

  setActiveChannel: (id) =>
    set((s) => {
      const idx = s.channels.findIndex((c) => c.id === id);
      if (idx < 0) return {};
      const next = s.channels.slice();
      next[idx] = { ...next[idx], dirty: false };
      return { activeChannel: id, channels: next };
    }),

  setAutoScroll: (v) => set({ autoScroll: v }),
  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
  setWrap: (v) => set({ wrap: v }),
  toggleWrap: () => set((s) => ({ wrap: !s.wrap })),

  list: () =>
    get().channels.map((c) => ({
      id: c.id,
      label: c.label,
      lines: c.lines.length,
      dirty: c.dirty,
    })),

  lines: (channelId) => get().channels.find((c) => c.id === channelId)?.lines ?? [],
}));

/** Helper singkat untuk kode non-React (Rust event handler, store lain). */
export const logOutput = (channelId: string, text: string) =>
  useOutput.getState().append(channelId, text);
