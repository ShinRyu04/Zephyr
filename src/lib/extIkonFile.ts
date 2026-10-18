/*
 * File icons contributed by an installed extension icon pack.
 *
 * This module is a LEAF (it imports nothing) on purpose: the extension loader
 * writes into it, and `fileIcons.ts` reads it while rendering every file row in
 * the explorer and the quick-open list. If the renderer imported the loader
 * directly it would drag the whole extension store into the icon hot path and
 * close a module cycle (loader -> keybindingStore -> ... -> fileIcons).
 *
 * Before this existed the packs landed in a Map inside extLoader.ts that only
 * the dev bridge ever read: four icon packs could be installed and the file
 * tree never changed.
 *
 * ## TWO KINDS OF PACK, and why both are stored here
 *
 * A pack can describe an icon in two ways, and until now only the first was
 * read:
 *
 *   glyph  a short text mark ("TS", "{}", "py") with a colour. Cheap, and it
 *          does change the tree - but it is a letter in a box, not art.
 *   svg    a real drawing, referenced by `iconPath` in the VS Code shape. This
 *          is what makes an icon theme look like a DIFFERENT icon theme rather
 *          than the same icons with different letters.
 *
 * The loader only ever handled `glyph`/`fontCharacter`, so every VS Code icon
 * theme installed from the marketplace registered zero drawable icons and the
 * tree kept its built-in art - "installed but nothing changed", which is the
 * defect the whole icon-theme path exists to avoid. `svg` is stored alongside
 * so the renderer can prefer the drawing and fall back to the glyph.
 */

export interface IkonPaket {
  /** Text mark, when the pack supplies one. Empty for pure-SVG packs. */
  glyph?: string;
  color?: string;
  /** Inline `<svg>` markup from the pack's `iconPath` file. */
  svg?: string;
  /**
   * Which pack this drawing came from.
   *
   * Carried ON THE ICON, not in a module variable. The variable version was
   * written by the store and read by `fileIcons`, and those two could resolve
   * different module instances (the harness imports through Vite's `/src/...`
   * path while the app imports relatively) - so the id came out empty and every
   * pack produced the same `ext::folder:src`, which made eight visibly different
   * themes indistinguishable to anything comparing ids.
   */
  paket?: string;
}

const peta = new Map<string, IkonPaket>();

/**
 * Register one contributed icon. Extension keys are stored without the dot.
 *
 * A later registration for the same key REPLACES the earlier one: the loader
 * walks the installed packs in order, and the last one read is the one the
 * reader most recently enabled. Merging fields instead would let a colour from
 * an old pack survive into a new one, which is a bug nobody would think to look
 * for.
 */
export const setIkonExt = (ext: string, ikon: IkonPaket): void => {
  const kunci = ext.toLowerCase().replace(/^\./, '');
  if (!kunci) return;
  if (!ikon.glyph && !ikon.svg) return;
  peta.set(kunci, ikon);
};

/** Drop every contributed icon (called when the loader re-reads extensions). */
export const kosongkanIkonExt = (): void => {
  peta.clear();
};

/** How many icons carry a name right now - the loader's honesty count. */
export const jumlahIkonExt = (): number => peta.size;

/**
 * Swap the whole render map to ONE pack, synchronously.
 *
 * This lives here, in the leaf module, rather than in the loader, because the
 * picker has to call it in the SAME synchronous turn as the store write. It used
 * to be reached through `import('../../lib/extLoader')` from the Settings card,
 * so the sequence for a click was:
 *
 *     set state (pack B)  ->  [await module load]  ->  clear map, write B
 *
 * and two clicks in quick succession could interleave as
 *
 *     set B -> set A -> write B -> write A
 *
 * leaving the map holding B while the picker highlighted A - icons that do not
 * match the chosen theme, sometimes, depending on timing. That is exactly the
 * report: "switching icons lags and sometimes shows the wrong set".
 *
 * Clearing first is still the point: the map holds one set, and a switch must
 * remove the previous pack's entries rather than layer on top of them.
 */
export const terapkanPaketIkon = (ikon: Record<string, IkonPaket> | null, paket = ''): void => {
  peta.clear();
  if (!ikon) return;
  for (const [kunci, ik] of Object.entries(ikon)) {
    /* Stamp the pack name INTO each icon: whoever reads it later gets the right
       answer regardless of which module instance they hold. */
    setIkonExt(kunci, paket ? { ...ik, paket } : ik);
  }
};

/**
 * Which pack the current map came from.
 *
 * Kept as a function for callers that only need the label; the authoritative
 * per-icon answer lives on `IkonPaket.paket` (see the note there for why).
 */
let idPaketAktif = '';
export const setIdPaketAktif = (id: string): void => {
  idPaketAktif = id;
};
export const paketAktifId = (): string => idPaketAktif;

/**
 * How many of those are real DRAWINGS rather than text marks.
 *
 * Reported separately because the two are not the same promise. A pack that
 * contributes 200 letters has changed 200 labels, not 200 icons, and saying
 * "200 icons" for it would be the kind of number this codebase refuses to print.
 */
export const jumlahIkonSvgExt = (): number => {
  let n = 0;
  for (const v of peta.values()) if (v.svg) n += 1;
  return n;
};

/**
 * The icon an icon pack gives to a file extension, or null.
 *
 * `path` is accepted as-is (`X.JSON`, `json`, `.json`) so every caller can pass
 * what it already has; `.tar.gz`-style tails are trimmed to the last segment to
 * match how the pack keys are written.
 */
export const ikonFileExt = (path: string): IkonPaket | null => {
  const bersih = path.toLowerCase().replace(/^\./, '');
  if (!bersih) return null;
  const tail = bersih.slice(bersih.lastIndexOf('.') + 1);
  return peta.get(bersih) ?? peta.get(tail) ?? null;
};

/** The icon an icon pack gives to a folder NAME, or null. */
export const ikonFolderExt = (nama: string, buka = false): IkonPaket | null => {
  const bersih = nama.toLowerCase().replace(/[\\/]+$/, '');
  if (!bersih) return null;
  /* The OPEN variant is asked first when expanded, then the closed one: a pack
     that draws `folderNamesExpanded` distinguishes the two, and a pack that only
     draws `folderNames` still answers - one drawing used for both states is a
     correct answer for a pack that only has one. */
  return (
    (buka ? peta.get(`folder-open:${bersih}`) : null) ??
    peta.get(`folder:${bersih}`) ??
    peta.get(bersih) ??
    null
  );
};

/** The pack's generic file icon, used when no extension rule matched. */
export const ikonFileUmumExt = (): IkonPaket | null => peta.get('file') ?? null;

/** The pack's generic folder icons. `buka` picks the expanded variant. */
export const ikonFolderUmumExt = (buka: boolean): IkonPaket | null =>
  peta.get(buka ? 'folder-open' : 'folder') ?? peta.get('folder') ?? null;
