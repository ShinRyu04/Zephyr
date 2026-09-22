// cliAgentStore.ts — state CLI AI agent (T1.2/T1.5).
//
// Kenapa store terpisah dari aiStore: daftar CLI + status login adalah data
// SISTEM (dibaca sekali dari Rust, jarang berubah), sedangkan aiStore adalah
// data PERCAKAPAN (berubah tiap token). Menggabungkannya membuat setiap token
// memicu perhitungan ulang daftar CLI.
//
// ATURAN yang dijaga:
//   * `detect()` dipanggil sekali saat panel dibuka, bukan tiap render.
//   * Zephyr TIDAK menyimpan token CLI. Store ini hanya menyimpan metadata
//     yang dikembalikan Rust (path, boolean login).

import { create } from 'zustand';
import * as cmd from './commands';
import type { CliAgent } from './commands';

/** Satu baris hasil CLI yang ditampilkan di panel. */
export interface CliRun {
  id: string;
  agentId: string;
  label: string;
  prompt: string;
  output: string;
  ok: boolean;
  at: number;
  /** true = masih berjalan */
  berjalan: boolean;
  timeout?: boolean;
}

interface CliAgentState {
  /** daftar CLI + status (dari Rust) */
  agents: CliAgent[];
  /** true = sudah pernah dideteksi (agar UI tidak flicker) */
  terdeteksi: boolean;
  /** CLI yang sedang dipakai; null = mode Native (adapter API) */
  aktif: string | null;
  /** riwayat hasil CLI di sesi ini */
  runs: CliRun[];
  /** true = sedang menjalankan CLI */
  sibuk: boolean;

  detect: (paksa?: boolean) => Promise<void>;
  setAktif: (id: string | null) => void;
  jalankan: (prompt: string, cwd?: string) => Promise<void>;
  bersihkan: () => void;
}

export const useCliAgent = create<CliAgentState>((set, get) => ({
  agents: [],
  terdeteksi: false,
  aktif: null,
  runs: [],
  sibuk: false,

  detect: async (paksa = false) => {
    if (get().terdeteksi && !paksa) return;
    try {
      const agents = await cmd.cliAgentsDetect();
      set({ agents, terdeteksi: true });
      // Kalau CLI yang sedang aktif hilang (di-uninstall), kembali ke native.
      const aktif = get().aktif;
      if (aktif && !agents.some((a) => a.id === aktif && a.terpasang && a.login)) {
        set({ aktif: null });
      }
    } catch {
      // Rust tidak tersedia (mis. mode browser murni) — biarkan kosong.
      set({ terdeteksi: true });
    }
  },

  setAktif: (id) => set({ aktif: id }),

  jalankan: async (prompt, cwd) => {
    const { aktif } = get();
    if (!aktif || get().sibuk) return;
    const agent = get().agents.find((a) => a.id === aktif);
    if (!agent) return;

    const runId = `cli-${Date.now().toString(36)}`;
    set((s) => ({
      sibuk: true,
      runs: [
        ...s.runs,
        {
          id: runId,
          agentId: aktif,
          label: agent.label,
          prompt,
          output: '',
          ok: false,
          at: Date.now(),
          berjalan: true,
        },
      ],
    }));

    try {
      const r = await cmd.cliAgentRun({ id: aktif, prompt, cwd });
      const teks = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
      set((s) => ({
        sibuk: false,
        runs: s.runs.map((x) =>
          x.id === runId
            ? {
                ...x,
                output: teks || (r.ok ? '(tidak ada output)' : '(gagal tanpa pesan)'),
                ok: r.ok,
                berjalan: false,
                timeout: r.timeout,
              }
            : x,
        ),
      }));
    } catch (e) {
      set((s) => ({
        sibuk: false,
        runs: s.runs.map((x) =>
          x.id === runId
            ? {
                ...x,
                output: cmd.asZephyrError(e).message,
                ok: false,
                berjalan: false,
              }
            : x,
        ),
      }));
    }
  },

  bersihkan: () => set({ runs: [] }),
}));
