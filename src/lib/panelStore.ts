// panelStore.ts — state kontainer panel bawah (fase 20).
//
// SATU kontainer, banyak tab. Tab "terminal" merender TerminalArea yang sudah
// ada (fase 05/06) apa adanya — bukan salinan. Karena itu store ini TIDAK
// menyentuh terminalStore selain membaca `visible` untuk sinkronisasi.
//
// Aturan RAM (dari brief fase 20): hanya tab AKTIF yang mounted. Store hanya
// menyimpan `activeTab`; Panel.tsx yang memutuskan tidak me-render yang lain.
// Pengecualian: tab terminal TIDAK boleh di-unmount saat panel pindah tab,
// karena melepas holder xterm dari DOM akan mematikan viewport-nya dan PTY
// harus di-attach ulang. Itu ditangani dengan menyembunyikannya via CSS
// (`display:none`), bukan unmount — lihat catatan di Panel.tsx.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';

export type PanelTabId = 'problems' | 'output' | 'debug' | 'terminal' | 'ports';

export const PANEL_TABS: { id: PanelTabId; label: string; command: string }[] = [
  { id: 'problems', label: 'Problems', command: 'problemsPanel.focus' },
  { id: 'output', label: 'Output', command: 'outputPanel.focus' },
  { id: 'debug', label: 'Debug Console', command: 'debugConsolePanel.focus' },
  { id: 'terminal', label: 'Terminal', command: 'terminalPanel.focus' },
  { id: 'ports', label: 'Ports', command: 'portsPanel.focus' },
];

const SEMUA: PanelTabId[] = PANEL_TABS.map((t) => t.id);

interface PanelState {
  activeTab: PanelTabId;
  /** tab yang boleh tampil di tab strip (preferensi user, persist) */
  visibleTabs: PanelTabId[];
  /** menu "..." show/hide tab terbuka */
  tabMenuOpen: boolean;
  /** true = tab terminal sudah pernah dibuka; holder xterm-nya tetap hidup */
  terminalMounted: boolean;
}

interface PanelActions {
  setActiveTab: (id: PanelTabId) => void;
  /** Buka panel (kalau tertutup) dan fokuskan satu tab. */
  focusTab: (id: PanelTabId) => void;
  toggleTabVisible: (id: PanelTabId) => void;
  setTabMenuOpen: (v: boolean) => void;
  /** Ctrl+PageUp/PageDown antar tab yang terlihat. */
  cycleTab: (arah: 1 | -1) => void;
  /** Simpan preferensi panel ke settings (disk). */
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
    // Tab terminal ikut memilih dock 'terminal' — panel bawah dipakai bersama
    // AI panel (fase 09), jadi tanpa ini tab Terminal bisa menampilkan AI.
    if (id === 'terminal') t.setDock('terminal');
    get().setActiveTab(id);
    void get().persist();
  },

  toggleTabVisible: (id) => {
    set((s) => {
      const ada = s.visibleTabs.includes(id);
      // Minimal satu tab harus terlihat, kalau tidak tab strip jadi kosong dan
      // panel tidak bisa dipakai lagi tanpa reset settings.
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
      return {
        visibleTabs: daftar,
        activeTab: daftar.includes(at) ? at : daftar[0],
        terminalMounted: true,
      };
    }),
}));
