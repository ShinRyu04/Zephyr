import { create } from 'zustand';
import * as cmd from './commands';
import type { CliAgent } from './commands';

export interface CliRun {
  id: string;
  agentId: string;
  label: string;
  prompt: string;
  output: string;
  ok: boolean;
  at: number;

  berjalan: boolean;
  timeout?: boolean;
}

interface CliAgentState {

  agents: CliAgent[];

  terdeteksi: boolean;

  aktif: string | null;

  runs: CliRun[];

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

      const aktif = get().aktif;
      if (aktif && !agents.some((a) => a.id === aktif && a.terpasang && a.login)) {
        set({ aktif: null });
      }
    } catch {

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
