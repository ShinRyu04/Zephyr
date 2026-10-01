import { create } from 'zustand';

import { useStore } from './store';
export type PosisiSidebar = 'left' | 'right';

export type KerapatanLayout = 'default' | 'compact';

interface LayoutState {

  menuBar: boolean;
  activityBar: boolean;
  sidebar: boolean;
  panel: boolean;
  statusBar: boolean;

  posisiSidebar: PosisiSidebar;
  kerapatan: KerapatanLayout;

  menuBuka: boolean;
  setMenuBuka: (v: boolean) => void;

  subKanan: boolean;
  setSubKanan: (v: boolean) => void;

  set: (bagian: Partial<LayoutState>) => void;
  toggle: (kunci: 'menuBar' | 'activityBar' | 'sidebar' | 'panel' | 'statusBar') => void;

  reset: () => void;

  simpan: () => Promise<void>;

  muat: () => Promise<void>;
}

const DEFAULT = {
  menuBar: true,
  activityBar: true,
  sidebar: true,
  panel: true,
  statusBar: true,
  posisiSidebar: 'left' as PosisiSidebar,
  kerapatan: 'default' as KerapatanLayout,
  menuBuka: false,

  subKanan: false,
};

export const useLayoutCustom = create<LayoutState>((set, get) => ({
  ...DEFAULT,

  set: (bagian) => set(bagian as never),

  setMenuBuka: (v) => set({ menuBuka: v }),

  setSubKanan: (v) => set({ subKanan: v }),

  toggle: (kunci) => set({ [kunci]: !get()[kunci] } as never),

  reset: () => set({ ...DEFAULT }),

  simpan: async () => {
    const s = get();

    await useStore.getState().applySettings({

      sidebar: s.posisiSidebar,
      general: {
        layout: {
          menuBar: s.menuBar,
          activityBar: s.activityBar,
          sidebar: s.sidebar,
          panel: s.panel,
          statusBar: s.statusBar,
          posisiSidebar: s.posisiSidebar,
          kerapatan: s.kerapatan,
          subKanan: s.subKanan,
        },
      },
    } as never);
  },

  muat: async () => {

    const st = useStore.getState().settings;
    const g = (st.general ?? {}) as unknown as Record<string, unknown>;
    const l = (g.layout ?? {}) as Partial<typeof DEFAULT>;

    const posisi = (st.sidebar as PosisiSidebar | undefined) ?? l.posisiSidebar ?? DEFAULT.posisiSidebar;
    set({
      menuBar: l.menuBar ?? DEFAULT.menuBar,
      activityBar: l.activityBar ?? DEFAULT.activityBar,
      sidebar: l.sidebar ?? DEFAULT.sidebar,
      panel: l.panel ?? DEFAULT.panel,
      statusBar: l.statusBar ?? DEFAULT.statusBar,
      posisiSidebar: posisi,
      kerapatan: l.kerapatan ?? DEFAULT.kerapatan,
      subKanan: l.subKanan ?? DEFAULT.subKanan,
    });
  },
}));

export const BARIS_LAYOUT: {
  kunci: 'menuBar' | 'activityBar' | 'sidebar' | 'panel' | 'statusBar';
  label: string;
  shortcut?: string;
}[] = [
  { kunci: 'menuBar', label: 'Menu Bar' },
  { kunci: 'activityBar', label: 'Activity Bar' },
  { kunci: 'sidebar', label: 'Primary Side Bar', shortcut: 'Ctrl+B' },
  { kunci: 'panel', label: 'Panel', shortcut: 'Ctrl+J' },
  { kunci: 'statusBar', label: 'Status Bar' },
];
