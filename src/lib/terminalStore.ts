// terminalStore.ts — state terminal multi-pane (fase 06).
//
// Bentuk mengikuti ARCHITECTURE.md §5 (kontrak nama menang):
//   terminalTabs: TerminalTab[]
//   TerminalTab { id, title, panes: PaneMeta[], layout }
//   PaneMeta  { id, kind, agent?, title, sessionId?, status, cwd }
//
// Satu pane = satu sesi PTY (kecuali pane 'browser' yang tidak punya PTY).
// `pane.id` dipakai langsung sebagai id sesi PTY supaya tidak ada tabel
// pemetaan kedua yang bisa desinkron.
//
// Instance xterm TIDAK disimpan di sini (bukan data serializable) —
// dipegang xtermRegistry.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { disposeHandle } from './xtermRegistry';
import type { AgentInfo, PaneKind, PaneMeta, ShellInfo, TerminalTab } from './types';

interface TerminalState {
  visible: boolean;
  /** tinggi panel terminal dalam px */
  height: number;
  /** panel diperbesar menutupi area editor (fase 06) */
  maximized: boolean;
  terminalTabs: TerminalTab[];
  activeTabId: string | null;
  shells: ShellInfo[];
  agents: AgentInfo[];
  /** dropdown pilih shell di tombol "+" */
  pickerOpen: boolean;
  /** popover daftar agent CLI */
  agentPickerOpen: boolean;
  /** kebab menu untuk tab tertentu */
  menuFor: string | null;
  renamingId: string | null;
  /** menu konteks pane (klik kanan header pane) */
  paneMenuFor: string | null;
  terminalError: string | null;
  /** pesan sementara (batas pane, dll) */
  toast: string | null;
}

interface TerminalActions {
  setVisible: (v: boolean) => void;
  toggleVisible: () => void;
  toggleMaximized: () => void;
  setHeight: (h: number) => void;
  loadShells: () => Promise<void>;
  loadAgents: () => Promise<void>;
  setPickerOpen: (v: boolean) => void;
  setAgentPickerOpen: (v: boolean) => void;
  setMenuFor: (id: string | null) => void;
  setPaneMenuFor: (id: string | null) => void;
  setRenaming: (id: string | null) => void;
  setToast: (msg: string | null) => void;

  // ── tab ──
  newTab: () => string;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, title: string) => void;
  closeTab: (id: string) => Promise<void>;
  setLayout: (id: string, layout: TerminalTab['layout']) => void;

  // ── pane ──
  /** Tambah pane ke tab aktif. null = ditolak (batas / error spawn). */
  addPane: (kind: PaneKind, opts?: { agentId?: string; url?: string }) => Promise<string | null>;
  setActivePane: (tabId: string, paneId: string) => void;
  closePane: (paneId: string) => Promise<void>;
  killPane: (paneId: string) => Promise<void>;
  reorderPane: (tabId: string, from: number, to: number) => void;
  setPaneUrl: (paneId: string, url: string) => void;
  markExited: (paneId: string) => void;
  refreshFromBackend: () => Promise<void>;

  // ── selector bantu ──
  allPanes: () => PaneMeta[];
  activeTab: () => TerminalTab | null;
  findPane: (paneId: string) => PaneMeta | undefined;
  maxPanes: () => number;
}

export type TerminalStore = TerminalState & TerminalActions;

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

const LABEL: Record<string, string> = {
  shell: 'PowerShell',
  pwsh: 'PowerShell 7',
  private: 'Private',
  cmd: 'cmd',
  bash: 'bash',
  wsl: 'WSL',
  browser: 'Browser',
  ssh: 'SSH',
};

/** Tab kosong baru (belum punya pane). */
function makeTab(n: number): TerminalTab {
  return { id: nextId('tterm'), title: `Terminal ${n}`, panes: [], layout: 'grid', activePaneId: null };
}

export const useTerminal = create<TerminalStore>((set, get) => ({
  visible: true,
  height: 260,
  maximized: false,
  terminalTabs: [],
  activeTabId: null,
  shells: [],
  agents: [],
  pickerOpen: false,
  agentPickerOpen: false,
  menuFor: null,
  renamingId: null,
  paneMenuFor: null,
  terminalError: null,
  toast: null,

  setVisible: (v) => set(v ? { visible: true } : { visible: false, maximized: false }),
  toggleVisible: () =>
    set((s) => (s.visible ? { visible: false, maximized: false } : { visible: true })),
  toggleMaximized: () => set((s) => ({ maximized: !s.maximized })),
  setHeight: (h) => set({ height: Math.max(120, Math.min(700, h)) }),
  setPickerOpen: (v) => set({ pickerOpen: v, agentPickerOpen: false, menuFor: null }),
  setAgentPickerOpen: (v) => set({ agentPickerOpen: v, pickerOpen: false, menuFor: null }),
  setMenuFor: (id) => set({ menuFor: id, pickerOpen: false, agentPickerOpen: false }),
  setPaneMenuFor: (id) => set({ paneMenuFor: id }),
  setRenaming: (id) => set({ renamingId: id, menuFor: null }),
  setToast: (msg) => set({ toast: msg }),

  loadShells: async () => {
    try {
      set({ shells: await cmd.listShells() });
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message });
    }
  },

  loadAgents: async () => {
    try {
      set({ agents: await cmd.listAgents() });
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message });
    }
  },

  // ───────────────────────── tab ─────────────────────────

  newTab: () => {
    const tab = makeTab(get().terminalTabs.length + 1);
    set((s) => ({ terminalTabs: [...s.terminalTabs, tab], activeTabId: tab.id, visible: true }));
    return tab.id;
  },

  setActiveTab: (id) => set({ activeTabId: id, menuFor: null }),

  renameTab: (id, title) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)),
      renamingId: null,
    })),

  closeTab: async (id) => {
    const tab = get().terminalTabs.find((t) => t.id === id);
    if (tab) {
      // Matikan semua pane dulu supaya tidak ada proses menggantung.
      for (const p of tab.panes) {
        if (p.kind !== 'browser') {
          try {
            await cmd.ptyKill(p.id);
          } catch {
            /* mungkin sudah mati */
          }
          disposeHandle(p.id);
        }
      }
    }
    set((s) => {
      const idx = s.terminalTabs.findIndex((t) => t.id === id);
      const terminalTabs = s.terminalTabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        const neighbour = terminalTabs[Math.min(idx, terminalTabs.length - 1)];
        activeTabId = neighbour ? neighbour.id : null;
      }
      return { terminalTabs, activeTabId, menuFor: null };
    });
  },

  setLayout: (id, layout) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => (t.id === id ? { ...t, layout } : t)),
    })),

  // ───────────────────────── pane ─────────────────────────

  addPane: async (kind, opts) => {
    // Pastikan ada tab tujuan.
    let tabId = get().activeTabId;
    if (!tabId || !get().terminalTabs.some((t) => t.id === tabId)) tabId = get().newTab();
    const tab = get().terminalTabs.find((t) => t.id === tabId)!;

    const max = get().maxPanes();
    if (tab.panes.length >= max) {
      set({
        toast: `Maksimal ${max} pane per tab (atur di Settings)`,
        pickerOpen: false,
        agentPickerOpen: false,
      });
      return null;
    }

    const paneId = nextId('pane');
    const workspace = useStore.getState().workspace;

    // Pane browser tidak punya PTY.
    if (kind === 'browser') {
      const pane: PaneMeta = {
        id: paneId,
        kind,
        title: LABEL.browser,
        status: 'live',
        cwd: workspace,
        url: opts?.url ?? 'http://localhost:8080',
      };
      set((s) => ({
        terminalTabs: s.terminalTabs.map((t) =>
          t.id === tabId ? { ...t, panes: [...t.panes, pane], activePaneId: paneId } : t,
        ),
        visible: true,
        pickerOpen: false,
        agentPickerOpen: false,
        terminalError: null,
      }));
      return paneId;
    }

    // Agent: program & argumen dari Settings → agents.startCommands.
    let command: string | undefined;
    let args: string[] | undefined;
    let title = LABEL[kind] ?? kind;
    let agent: PaneMeta['agent'];

    if (kind === 'agent') {
      const agentId = opts?.agentId;
      const info = get().agents.find((a) => a.id === agentId);
      if (!agentId || !info) {
        set({ terminalError: `agent ${agentId ?? '?'} tidak terdeteksi`, agentPickerOpen: false });
        return null;
      }
      const st = useStore.getState().settings.agents;
      const custom = st.startCommands?.[agentId];
      const argv = custom && custom.length > 0 ? custom : defaultStartCommand(agentId, info.path);
      command = argv[0];
      args = argv.slice(1);
      title = info.label;
      agent = { name: agentId, label: info.label };

      // Hitung salinan ke-N supaya judul jelas: "opencode 2".
      const copies = tab.panes.filter((p) => p.agent?.name === agentId).length;
      if (copies > 0) title = `${info.label} ${copies + 1}`;
    }

    try {
      const pid = await cmd.ptySpawn({ id: paneId, kind, command, args, cwd: workspace, cols: 80, rows: 24 });
      const pane: PaneMeta = {
        id: paneId,
        kind,
        agent,
        title,
        sessionId: paneId,
        status: 'live',
        cwd: workspace,
        pid,
      };
      set((s) => ({
        terminalTabs: s.terminalTabs.map((t) =>
          t.id === tabId ? { ...t, panes: [...t.panes, pane], activePaneId: paneId } : t,
        ),
        visible: true,
        pickerOpen: false,
        agentPickerOpen: false,
        terminalError: null,
      }));

      // Opsional: beri tahu agent file apa yang sedang dibuka.
      if (kind === 'agent' && useStore.getState().settings.agents.attachActiveFile) {
        const active = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId);
        if (active?.path) {
          await cmd.ptyWrite(paneId, `# Zephyr: file aktif = ${active.path}\r`).catch(() => {});
        }
      }
      return paneId;
    } catch (e) {
      set({
        terminalError: cmd.asZephyrError(e).message,
        pickerOpen: false,
        agentPickerOpen: false,
      });
      return null;
    }
  },

  setActivePane: (tabId, paneId) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)),
      activeTabId: tabId,
      paneMenuFor: null,
    })),

  closePane: async (paneId) => {
    const pane = get().findPane(paneId);
    if (pane && pane.kind !== 'browser') {
      try {
        // Agent CLI: beri Ctrl+C dulu supaya sesi berhenti rapi.
        if (pane.kind === 'agent') {
          await cmd.ptyInterrupt(paneId).catch(() => {});
          await new Promise((r) => setTimeout(r, 120));
        }
        await cmd.ptyKill(paneId);
      } catch {
        /* mungkin sudah mati — lanjut tutup pane */
      }
      // Buang instance xterm + scrollback (wajib untuk private).
      disposeHandle(paneId);
    }
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => {
        if (!t.panes.some((p) => p.id === paneId)) return t;
        const idx = t.panes.findIndex((p) => p.id === paneId);
        const panes = t.panes.filter((p) => p.id !== paneId);
        let activePaneId = t.activePaneId;
        if (activePaneId === paneId) {
          const n = panes[Math.min(idx, panes.length - 1)];
          activePaneId = n ? n.id : null;
        }
        return { ...t, panes, activePaneId };
      }),
      paneMenuFor: null,
      menuFor: null,
    }));
  },

  killPane: async (paneId) => {
    try {
      await cmd.ptyKill(paneId);
      get().markExited(paneId);
      set({ paneMenuFor: null, menuFor: null });
    } catch (e) {
      set({ terminalError: cmd.asZephyrError(e).message, paneMenuFor: null, menuFor: null });
    }
  },

  reorderPane: (tabId, from, to) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => {
        if (t.id !== tabId) return t;
        if (from === to || from < 0 || to < 0 || from >= t.panes.length || to >= t.panes.length) return t;
        const panes = [...t.panes];
        const [moved] = panes.splice(from, 1);
        panes.splice(to, 0, moved);
        return { ...t, panes };
      }),
    })),

  setPaneUrl: (paneId, url) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => (p.id === paneId ? { ...p, url } : p)),
      })),
    })),

  markExited: (paneId) =>
    set((s) => ({
      terminalTabs: s.terminalTabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => (p.id === paneId ? { ...p, status: 'exited' } : p)),
      })),
    })),

  refreshFromBackend: async () => {
    try {
      const live = await cmd.ptyList();
      const liveIds = new Set(live.filter((p) => p.alive).map((p) => p.id));
      set((s) => ({
        terminalTabs: s.terminalTabs.map((t) => ({
          ...t,
          panes: t.panes.map((p) =>
            p.kind === 'browser' ? p : { ...p, status: liveIds.has(p.id) ? 'live' : 'exited' },
          ),
        })),
      }));
    } catch {
      /* non-fatal */
    }
  },

  // ───────────────────── selector bantu ─────────────────────

  allPanes: () => get().terminalTabs.flatMap((t) => t.panes),
  activeTab: () => get().terminalTabs.find((t) => t.id === get().activeTabId) ?? null,
  findPane: (paneId) => get().allPanes().find((p) => p.id === paneId),
  maxPanes: () => {
    const n = useStore.getState().settings.agents?.maxPanes;
    return typeof n === 'number' && n > 0 ? n : 6;
  },
}));

/** Start command bawaan bila Settings belum diubah user.
 *  Diekspor karena Settings → Agents menampilkannya sebagai placeholder. */
export function defaultStartCommand(agentId: string, path: string): string[] {
  // GitHub Copilot CLI dijalankan sebagai subcommand `gh copilot`.
  if (agentId === 'gh') return [path, 'copilot'];
  return [path];
}
