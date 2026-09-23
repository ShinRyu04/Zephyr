import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';

export type PanelTabId =
  | 'problems'
  | 'output'
  | 'debug'
  | 'terminal'
  | 'ports'
  | 'ai'
  | 'subagents';

const TAB_LAMA: PanelTabId[] = ['problems', 'output', 'debug', 'terminal', 'ports'];

export const PANEL_TABS: { id: PanelTabId; label: string; command: string }[] = [
  { id: 'problems', label: 'Problems', command: 'problemsPanel.focus' },
  { id: 'output', label: 'Output', command: 'outputPanel.focus' },
  { id: 'debug', label: 'Debug Console', command: 'debugConsolePanel.focus' },
  { id: 'terminal', label: 'Terminal', command: 'terminalPanel.focus' },
  { id: 'ports', label: 'Ports', command: 'portsPanel.focus' },

  { id: 'ai', label: 'AI', command: 'aiPanel.focus' },

  { id: 'subagents', label: 'Subagents', command: 'subagentsPanel.focus' },
];

const SEMUA: PanelTabId[] = PANEL_TABS.map((t) => t.id);

interface PanelState {
  activeTab: PanelTabId;

  visibleTabs: PanelTabId[];

  tabMenuOpen: boolean;

  terminalMounted: boolean;
}

interface PanelActions {
  setActiveTab: (id: PanelTabId) => void;

  focusTab: (id: PanelTabId) => void;
  toggleTabVisible: (id: PanelTabId) => void;
  setTabMenuOpen: (v: boolean) => void;

  cycleTab: (arah: 1 | -1) => void;

  persist: () => Promise<void>;
  hydrate: (visibleTabs?: string[], activeTab?: string) => void;
}

const T = () => useTerminal.getState();

export const usePanel = create<PanelState & PanelActions>((set, get) => ({
  activeTab: 'terminal',
  visibleTabs: SEMUA.slice(),
  tabMenuOpen: false,
  terminalMounted: true,

  setActiveTab: (id) =>
    set((s) => ({
      activeTab: id,
      terminalMounted: s.terminalMounted || id === 'terminal',
      tabMenuOpen: false,
    })),

  focusTab: (id) => {
    const s = useStore.getState();
    s.setSettingsOpen(false);
    const t = T();
    if (!t.visible) t.setVisible(true);

    get().setActiveTab(id);
    void get().persist();
  },

  toggleTabVisible: (id) => {
    set((s) => {
      const ada = s.visibleTabs.includes(id);

      if (ada && s.visibleTabs.length <= 1) return {};
      const visibleTabs = ada
        ? s.visibleTabs.filter((x) => x !== id)
        : SEMUA.filter((x) => s.visibleTabs.includes(x) || x === id);
      const activeTab = visibleTabs.includes(s.activeTab) ? s.activeTab : visibleTabs[0];
      return { visibleTabs, activeTab };
    });
    void get().persist();
  },

  setTabMenuOpen: (v) => set({ tabMenuOpen: v }),

  cycleTab: (arah) => {
    const { visibleTabs, activeTab } = get();
    if (visibleTabs.length === 0) return;
    const i = visibleTabs.indexOf(activeTab);
    const n = (i + arah + visibleTabs.length) % visibleTabs.length;
    get().focusTab(visibleTabs[n]);
  },

  persist: async () => {
    const { visibleTabs, activeTab } = get();
    try {
      await cmd.setSettings({
        panel: { visibleTabs, activeTab, height: T().height },
      } as never);
    } catch {
      /* gagal simpan preferensi bukan alasan mengganggu user */
    }
  },

  hydrate: (visibleTabs, activeTab) =>
    set(() => {
      const vt = (visibleTabs ?? []).filter((x): x is PanelTabId =>
        SEMUA.includes(x as PanelTabId),
      );
      const at = SEMUA.includes(activeTab as PanelTabId) ? (activeTab as PanelTabId) : 'terminal';
      const daftar = vt.length > 0 ? vt : SEMUA.slice();

      const TAB_BARU: PanelTabId[] = SEMUA.filter((t) => !TAB_LAMA.includes(t));
      const lengkap = [...daftar];
      for (const t of TAB_BARU) {
        if (!lengkap.includes(t)) lengkap.push(t);
      }
      return {
        visibleTabs: SEMUA.filter((t) => lengkap.includes(t)),
        activeTab: lengkap.includes(at) ? at : lengkap[0],
        terminalMounted: true,
      };
    }),
}));
