// terminalStore.ts — state terminal (fase 05).
// Satu tab = satu sesi PTY. Multi-pane per tab menyusul di fase 06.
//
// Instance xterm TIDAK disimpan di store (bukan data serializable);
// dipegang xtermRegistry supaya store tetap murni state.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { disposeHandle } from './xtermRegistry';
import type { PtyKind, ShellInfo, TerminalSession } from './types';

interface TerminalState {
  visible: boolean;
  /** tinggi panel terminal dalam px */
  height: number;
  sessions: TerminalSession[];
  activeId: string | null;
  shells: ShellInfo[];
  /** dropdown pilih shell di tombol "+" */
  pickerOpen: boolean;
  /** kebab menu (Rename/Kill/Clear/Close) untuk tab tertentu */
  menuFor: string | null;
  renamingId: string | null;
  terminalError: string | null;
}

interface TerminalActions {
  setVisible: (v: boolean) => void;
  toggleVisible: () => void;
  setHeight: (h: number) => void;
  loadShells: () => Promise<void>;
  setPickerOpen: (v: boolean) => void;
  setMenuFor: (id: string | null) => void;
  setRenaming: (id: string | null) => void;

  createSession: (kind?: PtyKind, cols?: number, rows?: number) => Promise<string | null>;
  setActive: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  killSession: (id: string) => Promise<void>;
  closeSession: (id: string) => Promise<void>;
  markExited: (id: string) => void;
  refreshFromBackend: () => Promise<void>;
}

export type TerminalStore = TerminalState & TerminalActions;

let seq = 0;
const nextId = () => `term-${Date.now().toString(36)}-${++seq}`;

const LABEL: Record<string, string> = {
  shell: 'PowerShell',
  pwsh: 'PowerShell 7',
  private: 'Private',
  cmd: 'cmd',
  bash: 'bash',
  wsl: 'WSL',
};

export const useTerminal = create<TerminalStore>((set, get) => ({
  visible: true,
  height: 260,
  sessions: [],
  activeId: null,
  shells: [],
  pickerOpen: false,
  menuFor: null,
  renamingId: null,
  terminalError: null,

  setVisible: (v) => set({ visible: v }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  setHeight: (h) => set({ height: Math.max(120, Math.min(700, h)) }),
  setPickerOpen: (v) => set({ pickerOpen: v, menuFor: null }),
  setMenuFor: (id) => set({ menuFor: id, pickerOpen: false }),
  setRenaming: (id) => set({ renamingId: id, menuFor: null }),

  loadShells: async () => {
    try {
      set({ shells: await cmd.listShells() });
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message });
    }
  },

  createSession: async (kind = 'shell', cols = 80, rows = 24) => {
    const id = nextId();
    const workspace = useStore.getState().workspace;
    // Nomor urut per jenis: "PowerShell 1", "Private 2", dst.
    const n = get().sessions.length + 1;
    const label = LABEL[kind] ?? kind;

    try {
      const pid = await cmd.ptySpawn({ id, kind, cwd: workspace, cols, rows });
      const session: TerminalSession = {
        id,
        title: `${label} ${n}`,
        kind,
        shellLabel: label,
        pid,
        alive: true,
        cwd: workspace,
      };
      set((s) => ({
        sessions: [...s.sessions, session],
        activeId: id,
        visible: true,
        pickerOpen: false,
        terminalError: null,
      }));
      return id;
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message, pickerOpen: false });
      return null;
    }
  },

  setActive: (id) => set({ activeId: id, menuFor: null }),

  renameSession: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: title.trim() || x.title } : x)),
      renamingId: null,
    })),

  killSession: async (id) => {
    try {
      await cmd.ptyKill(id);
      set((s) => ({
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, alive: false } : x)),
        menuFor: null,
      }));
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message, menuFor: null });
    }
  },

  closeSession: async (id) => {
    try {
      await cmd.ptyKill(id);
    } catch {
      /* mungkin sudah mati — lanjut tutup tab */
    }
    // Buang instance xterm + seluruh scrollback (wajib untuk private).
    disposeHandle(id);
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === id);
      const sessions = s.sessions.filter((x) => x.id !== id);
      let activeId = s.activeId;
      if (s.activeId === id) {
        const neighbour = sessions[Math.min(idx, sessions.length - 1)];
        activeId = neighbour ? neighbour.id : null;
      }
      return { sessions, activeId, menuFor: null };
    });
  },

  markExited: (id) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, alive: false } : x)),
    })),

  refreshFromBackend: async () => {
    try {
      const live = await cmd.ptyList();
      const liveIds = new Set(live.filter((p) => p.alive).map((p) => p.id));
      set((s) => ({
        sessions: s.sessions.map((x) => ({ ...x, alive: liveIds.has(x.id) })),
      }));
    } catch {
      /* non-fatal */
    }
  },
}));
