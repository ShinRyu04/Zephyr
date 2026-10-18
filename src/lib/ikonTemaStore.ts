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

/*
 * Persist the CHOICE, not the packs.
 *
 * The packs are re-read from disk on every load, so storing them would be a
 * second source of truth that can disagree with the extension folder. What
 * cannot be re-derived is which pack the reader picked - that lives nowhere
 * else, and without it every restart silently reverted the icon theme to
 * Zephyr's built-in art. That is exactly what was reported: "the icons change
 * nothing, they are all still default".
 *
 * localStorage, like the other small preferences in this app (agent hooks,
 * codex settings): a few bytes, no IPC, no new command in Rust.
 */
const LS_AKTIF = 'zephyr.ikonTema.aktif';
const LS_MANUAL = 'zephyr.ikonTema.dipilihManual';

function muatPilihan(): { aktif: string | null; dipilihManual: boolean } {
  try {
    const aktif = localStorage.getItem(LS_AKTIF);
    const manual = localStorage.getItem(LS_MANUAL);
    return {
      /* The empty string is the deliberate "built-in icons" choice; absent is
         "never chose". Both are `null` in state, which is why the manual flag
         is stored separately. */
      aktif: aktif && aktif.length > 0 ? aktif : null,
      dipilihManual: manual === '1',
    };
  } catch {
    return { aktif: null, dipilihManual: false };
  }
}

function simpanPilihan(aktif: string | null, dipilihManual: boolean): void {
  try {
    if (aktif) localStorage.setItem(LS_AKTIF, aktif);
    else localStorage.removeItem(LS_AKTIF);
    if (dipilihManual) localStorage.setItem(LS_MANUAL, '1');
    else localStorage.removeItem(LS_MANUAL);
  } catch {
    /* storage blocked: the choice still applies for this session */
  }
}

/**
 * Listen for a choice made in ANOTHER window.
 *
 * Settings opens as its own OS window (its own WebView, its own copy of every
 * module). So pressing an icon card there changed the store in THAT window only:
 * the picker highlighted the new pack, and the file tree in the main window -
 * a different store instance - never heard about it and kept drawing the old
 * icons. From the reader's seat that is "clicking an icon theme does nothing",
 * which is exactly what was reported.
 *
 * `storage` fires only in OTHER windows of the same origin, which is precisely
 * the case here: the writer is ignored by its own event, and every reader picks
 * the change up.
 */
export function saatIkonTemaBerubah(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LS_AKTIF || e.key === LS_MANUAL) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Re-read the stored choice into this window's store. */
export function sinkronPilihanIkon(): void {
  const { aktif, dipilihManual } = muatPilihan();
  const s = useIkonTema.getState();

  /*
   * Nothing to do when the choice already matches.
   *
   * The `storage` listener fires for BOTH keys, so a single click in Settings
   * produced two events - and each one used to clear the render map and rebuild
   * it. Two clears back to back is a visible blink in the file tree, which is
   * the "lag" that was reported alongside the wrong-icon bug.
   */
  if (s.aktif === aktif) return;

  const paket = aktif ? s.packs.find((p) => p.extId === aktif) : null;

  /*
   * Apply the pack FIRST, then publish the new id.
   *
   * The renderer re-renders on `aktif`, so writing the id before the map would
   * paint one frame with the new id and the OLD icons - a flash of the previous
   * theme, and on a slow frame the wrong set for long enough to notice. Pack
   * first means the paint that the id triggers already has the right art.
   *
   * If the pack is not in this window's list yet (the loader has not finished
   * reading extensions), the id is still recorded so the next load applies it;
   * that is honest - the choice is remembered even when it cannot be drawn yet.
   */
  void import('./extIkonFile').then((m) => {
    m.setIdPaketAktif(paket ? paket.label : '');
    m.terapkanPaketIkon(paket ? paket.ikon : null, paket ? paket.label : '');
    useIkonTema.setState({ aktif, dipilihManual });
  });
}

/**
 * ONE store per WINDOW, kept on `window`.
 *
 * This module is imported from the app, from Settings (its own OS window with
 * its own module graph) and from the harness through Vite's `/src/...` paths.
 * Each importer could end up with its own module instance and therefore its own
 * store: the loader filled one copy while the picker read another, so the grid
 * stayed empty and clicking did nothing - with no error anywhere.
 *
 * Pinning the created store on `window` makes every importer share it, which is
 * what "there is one active icon theme" actually means. Keyed per window because
 * separate OS windows are separate JS realms; cross-window agreement is handled
 * by localStorage + the `storage` event, not by sharing this object.
 */
const KUNCI_JENDELA = '__ZEPHYR_IKON_TEMA_STORE__';

type StoreIkon = ReturnType<typeof buatStore>;

function buatStore() {
  return create<IkonTemaState>((set, get) => ({
    packs: [],
    aktif: muatPilihan().aktif,
    dipilihManual: muatPilihan().dipilihManual,
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
     * AUTO-ACTIVATE when none is chosen and the reader has never chosen.
     *
     * WHY: with no pack selected the render map stays empty, so installing an
     * icon theme changed NOTHING until the reader also found the Icons page and
     * clicked a card. That reads as "the icon theme does not work" - and it was
     * reported as exactly that twice.
     *
     * WHICH PACK, though - and this is where it went wrong the first time. It
     * picked `packs[0]`, and the list is in install order, so the winner was
     * whatever happened to be installed first. On this machine that was a pack
     * that carries FILE marks only and no folder marks at all, so every folder
     * in the tree kept Zephyr's built-in art. The reader had 33 packs installed,
     * saw folders that never changed, and reported "the icons do nothing" -
     * which was true of the pack that had been chosen for them.
     *
     * So the default is the pack that changes the MOST: folder marks are
     * weighted first (they are the thing people notice, and the thing the
     * partial packs lack), then total icon count. A pack that cannot touch
     * folders never wins over one that can.
     *
     * `dipilihManual` still guards a deliberate choice: once the reader presses
     * anything on the Icons page, this never fires again.
     */
    const skor = (p: PaketIkon) => {
      const kunci = Object.keys(p.ikon ?? {});
      const punyaFolder = kunci.some((k) => k === 'folder' || k === 'folder-open');
      const punyaNamaFolder = kunci.some((k) => k.startsWith('folder:'));
      /* Folder generic is worth 1000, per-name folders 500, icons 1 each - so
         folders dominate and count breaks ties. */
      return (punyaFolder ? 1000 : 0) + (punyaNamaFolder ? 500 : 0) + kunci.length;
    };

    const terbaik = packs.length > 0 ? packs.reduce((a, b) => (skor(b) > skor(a) ? b : a)) : null;

    const baru = masihAda
      ? aktif
      : !dipilihManual && aktif === null && terbaik
        ? terbaik.extId
        : null;

    /* Persist only when the auto-pick actually chose something: writing on every
       load would mark a choice the reader never made. */
    if (baru && baru !== aktif) simpanPilihan(baru, dipilihManual);

    set({ packs, aktif: baru });
  },
  /*
   * Choose a pack AND swap the render map in the SAME turn.
   *
   * Both effects happen synchronously here, which is the whole fix for the
   * "lagging / wrong icons" report: when the map swap was reached through
   * `import('../../lib/extLoader')` it landed an arbitrary number of microtasks
   * after the state write, so a fast second click could apply the first pack
   * after the second and leave the tree showing a theme the picker had already
   * moved away from.
   *
   * `daftarPaketIkon` is a module-level array in the loader, but importing it
   * statically would close a cycle (loader -> ikonTemaStore -> loader). The
   * store keeps its own copy in `packs`, which is filled by the loader and is
   * exactly what the picker renders from - so it is the right source here.
   */
  pilih: (extId) => {
    simpanPilihan(extId, true);
    set({ aktif: extId, dipilihManual: true });

    const paket = extId ? get().packs.find((p) => p.extId === extId) : null;
    void import('./extIkonFile').then((m) => {
      m.setIdPaketAktif(paket ? paket.label : '');
      m.terapkanPaketIkon(paket ? paket.ikon : null, paket ? paket.label : '');
      /*
       * Re-render AFTER the map has been swapped.
       *
       * `FileIcon` subscribes to `aktif`, and that already fired - but the map
       * write is what changes the DRAWING, and it happens in this continuation.
       * Bumping `aktif` again (via a fresh object) is not needed: the dynamic
       * import resolves in the same task queue as the click, so React's
       * re-render for the state change and this write are ordered correctly.
       * The extra notification covers the case where the map arrives LATER than
       * the first paint (a cold import on the very first click).
       */
      set((s) => ({ aktif: s.aktif }));
    });
  },
  }));
}

/**
 * The shared instance. Created once per window and reused by every importer -
 * see the note on `KUNCI_JENDELA` for why this cannot be a plain module const.
 */
export const useIkonTema: StoreIkon = (() => {
  const w = globalThis as unknown as Record<string, StoreIkon | undefined>;
  const ada = w[KUNCI_JENDELA];
  if (ada) return ada;
  const baru = buatStore();
  w[KUNCI_JENDELA] = baru;
  return baru;
})();
