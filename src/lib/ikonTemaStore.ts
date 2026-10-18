import { create } from 'zustand';

/**
 * Which icon theme is ACTIVE, and which packs exist.
 *
 * ## Why a store and not a settings key
 *
 * The active icon theme used to be implicit: every installed pack wrote its
 * icons into one shared map, so the LAST pack loaded won and there was no way to
 * say "use this one". With several packs installed the result was whichever the
 * loader happened to read last - stable, but arbitrary and invisible. A reader
 * who installed three packs got one of them and no control over which.
 *
 * This store holds the CHOICE. The loader fills `packs` (what is installed) and
 * the picker sets `aktif`. `penerapan` re-registers only the active pack's icons
 * into the render map, which is what makes the choice take effect immediately
 * without a restart.
 *
 * ## Why the icons are not just kept in the map
 *
 * Because "which pack does this icon come from" has to survive a switch. If the
 * loader wrote straight into the render map, turning pack B on after pack A
 * would leave A's icons for every extension B does not mention - a hybrid that
 * belongs to no pack. Keeping each pack's icons separately and re-registering
 * one pack at a time is what makes a switch a switch.
 */

/** One icon a pack contributes, as the loader read it. */
export interface IkonPaketDef {
  /** Text mark, when the pack supplies one instead of art. */
  glyph?: string;
  color?: string;
  /** Inline `<svg>` markup from the pack's `iconPath`. */
  svg?: string;
}

/** One installed icon theme. */
export interface PaketIkon {
  /** Extension id the pack came from (`zephyr.ikon-bulat`, `pkief.material-icon-theme`). */
  extId: string;
  /** What the reader sees: the pack's own label. */
  label: string;
  /**
   * Extension/name key -> icon. Keys are lower-case and without a leading dot.
   *
   * Reserved keys, used as fallbacks rather than as file types:
   *   `file`        the generic file icon
   *   `folder`      the closed folder
   *   `folder-open` the expanded folder
   *   `folder:<n>`  a folder NAMED n
   */
  ikon: Record<string, IkonPaketDef>;
  /** How many entries carry real art rather than a letter. */
  jumlahSvg: number;
}

interface IkonTemaState {
  /** Installed packs, in install order. */
  packs: PaketIkon[];
  /** Extension id of the active pack, or null for Zephyr's own icons. */
  aktif: string | null;
  /**
   * Whether the reader has ever picked something on the Icons page.
   *
   * This is what separates "never chose" from "chose Zephyr's own icons". Both
   * leave `aktif` null, and without this flag the auto-activate below would
   * override a deliberate choice on every reload - a setting that quietly
   * changes itself back is worse than no default at all.
   */
  dipilihManual: boolean;
  /**
   * Replace the pack list. Called by the loader after it reads the installed
   * extensions; the active choice is kept if that pack still exists.
   */
  setPacks: (packs: PaketIkon[]) => void;
  /** Choose a pack, or null for the built-in icons. */
  pilih: (extId: string | null) => void;
}

export const useIkonTema = create<IkonTemaState>((set, get) => ({
  packs: [],
  aktif: null,
  dipilihManual: false,
  setPacks: (packs) => {
    const { aktif, dipilihManual } = get();
    /*
     * A pack that was uninstalled cannot stay active: keeping the id would leave
     * `aktif` pointing at nothing, and the render map would keep that pack's
     * icons with no way to see why. Falling back to the built-in set is the
     * honest outcome - the reader sees Zephyr's own icons, not a ghost.
     */
    const masihAda = aktif && packs.some((p) => p.extId === aktif);

    /*
     * AUTO-ACTIVATE THE FIRST PACK when none is chosen and the reader has never
     * chosen anything.
     *
     * WHY: with no pack selected the render map stays empty, so installing an
     * icon theme changed NOTHING until the reader also found the Icons page and
     * clicked a card. That reads as "the icon theme does not work" - and it was
     * reported as exactly that. Installing a pack is a request to use it, so the
     * first one becomes active on its own.
     *
     * `dipilihManual` is what keeps this from overriding a deliberate choice of
     * the built-in set: once the reader has pressed anything on the Icons page,
     * this never fires again.
     */
    const baru = masihAda
      ? aktif
      : !dipilihManual && aktif === null && packs.length > 0
        ? packs[0].extId
        : null;

    set({ packs, aktif: baru });
  },
  pilih: (extId) => set({ aktif: extId, dipilihManual: true }),
}));
