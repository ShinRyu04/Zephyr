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

      /*
       * `sidebar` (root) is NOT deleted here any more, and the reason is a bug
       * this deletion actually caused.
       *
       * `general.layoutPrefs.posisiSidebar` and root `sidebar` both mean "where
       * is the panel", and `MenuBar.tsx:335` plus `commandRegistry.ts:235-265`
       * write root `sidebar` for exactly that. Deleting it here did not retire
       * the key, it just made the two writers take turns: this menu cleared it,
       * the View commands put it back, and the position the user picked in one
       * place was undone by the other. `muat()` below reads root `sidebar`
       * FIRST, so whichever wrote last won the read.
       *
       * One meaning, one home: root `sidebar` stays as the home, because it is
       * the older key and both existing writers already agree on it. It is
       * mirrored into `layoutPrefs` for the panel-visibility record, and `muat`
       * reconciles the two.
       */
      sidebar: s.posisiSidebar,
      general: {
        /*
         * Panel-visibility preferences live under `layoutPrefs`, NOT `layout`.
         *
         * They used to be written to `general.layout`, which is a different
         * thing entirely: `GeneralSettings.layout` is `'editor' | 'terminal'`
         * and `App.tsx:263` reads it as `=== 'terminal'` to decide whether the
         * terminal leads the window. Writing an object over that key replaced
         * the string, so the check was permanently false - the terminal-first
         * layout could never come back once this menu had saved.
         *
         * The mistake survived type checking because the write was cast
         * `as never`, which is what a cast does: it silences the one thing that
         * would have caught it. Two settings sharing a name is not a naming
         * preference, it is a collision.
         */
        layoutPrefs: {
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
    /*
     * `g.layoutPrefs` is the current home. `g.layout` is read as a FALLBACK for
     * anyone who saved while the collision was live - their preferences are
     * sitting in that key right now, and skipping it would silently reset their
     * layout on upgrade.
     *
     * Both are narrowed to `Partial<typeof DEFAULT>` before use, so a `layout`
     * that is still the STRING `'editor' | 'terminal'` yields `undefined` for
     * every field and falls through to the defaults. That is the case worth
     * being careful about: without the string check, reading `.menuBar` off a
     * string returns `undefined` harmlessly, but `l.kerapatan` on a string of a
     * matching length could pick up a character. The explicit check removes the
     * question.
     */
    const prefs = g.layoutPrefs as Partial<typeof DEFAULT> | undefined;
    const lama = typeof g.layout === 'object' && g.layout !== null ? (g.layout as Partial<typeof DEFAULT>) : undefined;
    const l = prefs ?? lama ?? {};

    /*
     * Root `sidebar` first, then the copy inside layoutPrefs, then the default.
     *
     * Root first is deliberate: the View commands and the layout menu both write
     * it, so it is the key that reflects the most recent deliberate move. The
     * copy in `layoutPrefs` is the older of the two and only wins when root is
     * absent - which is the case for anyone who used the layout menu before this
     * reconciliation and never moved the panel since.
     */
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
