// tunnelStore.ts — state Cloudflare Tunnel (T2.3).
//
// PERINGATAN KEAMANAN yang dijaga store ini: tunnel membuka localhost ke
// internet. Store mencatat SEMUA tunnel hidup supaya UI bisa menampilkan
// statusnya terus-menerus — bukan cuma toast yang hilang 3 detik.

import { create } from 'zustand';
import * as cmd from './commands';
import type { TunnelStatus } from './commands';

interface TunnelState {
  /** path cloudflared; null = belum dipasang */
  bin: string | null;
  /** true = sudah dicek sekali */
  terdeteksi: boolean;
  tunnels: TunnelStatus[];
  sibuk: boolean;
  galat: string | null;

  detect: (paksa?: boolean) => Promise<void>;
  mulai: (port: number) => Promise<void>;
  stop: (id: string) => Promise<void>;
  stopSemua: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Dipanggil dari listener `tunnel-url` Rust. */
  setUrl: (id: string, url: string) => void;
  /** Dipanggil dari listener `tunnel-exit` Rust. */
  tandaiMati: (id: string) => void;
}

const idUntuk = (port: number) => `tun-${port}`;

export const useTunnel = create<TunnelState>((set, get) => ({
  bin: null,
  terdeteksi: false,
  tunnels: [],
  sibuk: false,
  galat: null,

  detect: async (paksa = false) => {
    if (get().terdeteksi && !paksa) return;
    try {
      const bin = await cmd.tunnelTersedia();
      set({ bin, terdeteksi: true });
    } catch {
      set({ bin: null, terdeteksi: true });
    }
  },

  mulai: async (port) => {
    if (get().sibuk) return;
    set({ sibuk: true, galat: null });
    const id = idUntuk(port);
    try {
      const t = await cmd.tunnelStart(id, port);
      set((s) => ({
        tunnels: [...s.tunnels.filter((x) => x.id !== id), t],
        sibuk: false,
      }));
    } catch (e) {
      set({ galat: cmd.asZephyrError(e).message, sibuk: false });
    }
  },

  stop: async (id) => {
    try {
      await cmd.tunnelStop(id);
    } catch {
      /* tunnel mungkin sudah mati sendiri */
    }
    set((s) => ({ tunnels: s.tunnels.filter((t) => t.id !== id) }));
  },

  stopSemua: async () => {
    for (const t of get().tunnels) {
      await get().stop(t.id);
    }
  },

  refresh: async () => {
    try {
      const list = await cmd.tunnelList();
      set({ tunnels: list });
    } catch {
      /* Rust tidak tersedia */
    }
  },

  setUrl: (id, url) =>
    set((s) => ({
      tunnels: s.tunnels.map((t) => (t.id === id ? { ...t, url, menyiapkan: false } : t)),
    })),

  tandaiMati: (id) =>
    set((s) => ({
      tunnels: s.tunnels.map((t) => (t.id === id ? { ...t, hidup: false } : t)),
    })),
}));
