import { create } from 'zustand';

/**
 * Repo Wiki — documentation of THIS codebase, in two forms.
 *
 * The distinction matters and the UI has to keep it visible, because the two
 * artefacts are read by different readers:
 *
 *   wiki       Markdown pages a PERSON reads. Architecture, module maps, "where
 *              does X live". Exported to `.zephyr/wiki/`.
 *   knowledge  Compact cards a MODEL reads. Short, factual, one topic each, so a
 *              retrieved card can be dropped into a prompt without dragging a
 *              whole page in. Exported to `.zephyr/knowledge/`.
 *
 * Both are generated from the same walk of the workspace, which is why the
 * options that control that walk (`autoUpdate`, `autoExport`, `citation`) live
 * here and not in either pane: they describe the generation, not the output.
 *
 * NOTHING HERE IS PERSISTED YET, deliberately. A generation run that is
 * half-written to disk is worse than one that is lost: the reader would open the
 * wiki next session and read pages that describe a codebase from three commits
 * ago with no marker saying so. Persisting belongs with the version stamp that
 * makes staleness visible, which is a separate change.
 */

/** Which pane the sidebar shows. */
export type WikiTab = 'wiki' | 'knowledge';

/** One generated page or card. */
export interface EntriWiki {
  /** File name under `.zephyr/wiki/` or `.zephyr/knowledge/`, without extension. */
  id: string;
  /** Human title, shown in the sidebar list. */
  judul: string;
  /** Markdown body. */
  isi: string;
  /**
   * Where it came from: `modul:src/lib/store.ts`, `folder:src/components`, or
   * `manual`. Kept so a page can say what it documents - a wiki page whose
   * subject is unknown is a page nobody can trust.
   */
  sumber: string;
}

interface WikiState {
  tab: WikiTab;
  setTab: (t: WikiTab) => void;

  /** Which entry the reader has selected, per tab. */
  dipilih: Record<WikiTab, string | null>;
  pilih: (tab: WikiTab, id: string | null) => void;

  /*
   * Generation options. These describe the RUN, so they are shared by both tabs.
   */
  /** Regenerate automatically when a new commit lands. */
  autoUpdate: boolean;
  /** Write the output into `.zephyr/` in the workspace. */
  autoExport: boolean;
  /** Let the agent cite these pages when it answers. */
  citation: boolean;
  setOpsi: (o: Partial<Pick<WikiState, 'autoUpdate' | 'autoExport' | 'citation'>>) => void;

  /** Language the pages are written in. Empty = follow the UI language. */
  bahasa: string;
  setBahasa: (b: string) => void;

  /** Generated entries, per tab. Empty until a run finishes. */
  entri: Record<WikiTab, EntriWiki[]>;
  setEntri: (tab: WikiTab, e: EntriWiki[]) => void;

  /** A run is in flight. Blocks a second one from starting. */
  sibuk: boolean;
  setSibuk: (v: boolean) => void;

  /** Last failure, shown in the pane rather than swallowed. */
  galat: string | null;
  setGalat: (g: string | null) => void;

  /** ISO timestamp of the last successful run, or null. */
  terakhir: string | null;
  setTerakhir: (t: string | null) => void;
}

export const useWiki = create<WikiState>((set) => ({
  tab: 'wiki',
  setTab: (tab) => set({ tab }),

  dipilih: { wiki: null, knowledge: null },
  pilih: (tab, id) => set((s) => ({ dipilih: { ...s.dipilih, [tab]: id } })),

  autoUpdate: true,
  autoExport: true,
  citation: true,
  setOpsi: (o) => set(o),

  bahasa: '',
  setBahasa: (bahasa) => set({ bahasa }),

  entri: { wiki: [], knowledge: [] },
  setEntri: (tab, e) => set((s) => ({ entri: { ...s.entri, [tab]: e } })),

  sibuk: false,
  setSibuk: (sibuk) => set({ sibuk }),

  galat: null,
  setGalat: (galat) => set({ galat }),

  terakhir: null,
  setTerakhir: (terakhir) => set({ terakhir }),
}));
