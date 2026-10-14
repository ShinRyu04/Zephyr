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
 */

const peta = new Map<string, { glyph: string; color: string }>();

/** Register one contributed glyph. Extension keys are stored without the dot. */
export const setIkonExt = (ext: string, glyph: string, color: string): void => {
  const kunci = ext.toLowerCase().replace(/^\\./, '');
  if (!kunci || !glyph) return;
  peta.set(kunci, { glyph, color });
};

/** Drop every contributed glyph (called when the loader re-reads extensions). */
export const kosongkanIkonExt = (): void => {
  peta.clear();
};

/** How many glyphs carry a name right now - the loader's honesty count. */
export const jumlahIkonExt = (): number => peta.size;

/**
 * The glyph an icon pack gives to a file extension, or null.
 *
 * `path` is accepted as-is (`X.JSON`, `json`, `.json`) so every caller can pass
 * what it already has; `.tar.gz`-style tails are trimmed to the last segment to
 * match how the pack keys are written.
 */
export const ikonFileExt = (path: string): { glyph: string; color: string } | null => {
  const bersih = path.toLowerCase().replace(/^\\./, '');
  if (!bersih) return null;
  const tail = bersih.slice(bersih.lastIndexOf('.') + 1);
  return peta.get(bersih) ?? peta.get(tail) ?? null;
};
