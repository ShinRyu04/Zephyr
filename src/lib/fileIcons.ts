/*
 * File-type icons for the composer's "@" picker, the editor gutter and the
 * subagent step list.
 *
 * The icons come from material-icon-theme (MIT) — the same set VS Code uses —
 * and the lookup follows VS Code's own order, so a file resolves to the icon a
 * developer already expects: `php` the elephant, `ts` the TypeScript mark,
 * `package.json` the npm cube, `.gitignore` the git mark.
 *
 * Order matters and is not arbitrary:
 *   1. exact file name  — `package.json` must beat the `.json` rule, and
 *      `Dockerfile` has no extension to fall back on at all;
 *   2. extension chain  — `d.ts` beats `ts`, `tar.gz` beats `gz`;
 *   3. single extension;
 *   4. language id, when the caller knows it from the editor;
 *   5. the generic file icon.
 */

import {
  IKON_SVG,
  IKON_EXT,
  IKON_NAMA,
  IKON_FOLDER_NAMA,
  IKON_LANG,
  IKON_FOLDER,
  IKON_FOLDER_BUKA,
  IKON_FILE,
} from './fileIconMap';
import {
  ikonFileExt,
  ikonFolderExt,
  ikonFileUmumExt,
  ikonFolderUmumExt,
} from './extIkonFile';

export interface FileIkon {
  /** Icon name from the theme, used as the React key and by tests. */
  id: string;
  /** Inline SVG markup, or null when the name is unknown. */
  svg: string | null;
  /**
   * A text glyph contributed by an installed icon pack, drawn instead of an
   * SVG. Absent when the pack supplied real art.
   */
  glyph?: string;
  color?: string;
}

const bungkus = (id: string | undefined): FileIkon | null =>
  id ? { id, svg: IKON_SVG[id] ?? null } : null;

/**
 * Longest matching extension wins: `a.d.ts` resolves through `d.ts` before it
 * ever tries `ts`, which is what separates the definition-file icon from the
 * plain TypeScript one.
 */
function cariEkstensi(base: string): string | undefined {
  const titik = base.indexOf('.');
  if (titik < 0) return undefined;
  let sisa = base.slice(titik + 1);
  while (sisa.length > 0) {
    const hit = IKON_EXT[sisa];
    if (hit) return hit;
    const next = sisa.indexOf('.');
    if (next < 0) break;
    sisa = sisa.slice(next + 1);
  }
  return undefined;
}

/**
 * The icon for a file name or path.
 *
 * `lang` is optional: pass the editor's language id when it is known (the
 * picker does not have it, the gutter does) and it is used before falling back
 * to the generic file.
 */
export function ikonFile(nama: string, lang?: string): FileIkon {
  const base = (nama.split(/[\\/]/).pop() ?? nama).toLowerCase();

  /*
   * THE PACK COMES FIRST - and it is asked about EVERY name, not just names
   * with a dot in them.
   *
   * Two bugs lived here, and together they are why "only the folders changed":
   *
   *  1. `IKON_NAMA[base]` was consulted BEFORE the pack. Every well-known file
   *     (`package.json`, `README.md`, `Dockerfile`...) kept Zephyr's built-in
   *     drawing no matter which pack was chosen, so the rows a reader looks at
   *     most were exactly the ones that never changed.
   *  2. The pack was only asked when the name contained a dot. A file with no
   *     extension - `Dockerfile`, `Makefile`, `LICENSE`, `Procfile` - skipped
   *     the pack entirely and fell through to the built-in map.
   *
   * Now the pack answers first, and it answers for every name. The built-in
   * chain stays as the fallback, so an uninstalled pack hands the tree back to
   * Zephyr's own art with no special case.
   *
   * Art is preferred over a glyph inside the pack itself: a letter in a box is
   * not a different icon, it is the same icon with a different letter.
   */
  const dariPaket = ikonFileExt(base);
  return (
    (dariPaket
      ? dariPaket.svg
        ? { id: `ext:${dariPaket.paket ?? ''}:${base}`, svg: dariPaket.svg, color: dariPaket.color }
        : {
            id: `ext:${dariPaket.paket ?? ''}:${base}`,
            svg: null,
            glyph: dariPaket.glyph,
            color: dariPaket.color,
          }
      : null) ??
    bungkus(IKON_NAMA[base]) ??
    bungkus(cariEkstensi(base)) ??
    bungkus(lang ? IKON_LANG[lang.toLowerCase()] : undefined) ??
    /* The pack's generic file icon, before the built-in one: a pack that only
       renames its fallback has still changed every unnamed file. */
    (() => {
      const umum = ikonFileUmumExt();
      if (!umum) return null;
      return umum.svg
        ? { id: 'ext:file', svg: umum.svg, color: umum.color }
        : { id: 'ext:file', svg: null, glyph: umum.glyph, color: umum.color };
    })() ??
    { id: IKON_FILE, svg: IKON_SVG[IKON_FILE] ?? null }
  );
}

/** The icon for a folder row. `buka` picks the expanded variant. */
export function ikonFolder(nama?: string, buka = false): FileIkon {
  const base = (nama ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';

  /*
   * AN INSTALLED PACK WINS, and it wins OVER THE BUILT-IN NAME MAP.
   *
   * This is the bug that made icon themes look broken: the order used to be
   * pack-name -> built-in-name -> pack-generic, so a folder called `src` hit
   * Zephyr's own `folder-src` drawing before the pack's generic folder was ever
   * consulted. Every common folder (src, node_modules, dist, test...) kept its
   * built-in icon, and only the handful the pack happened to name by folder
   * changed - which reads exactly as "the icon theme does not change folders".
   *
   * The pack is the reader's choice, so it goes first: its per-name icon if it
   * has one, then its generic folder, and only then Zephyr's own art. That also
   * means an uninstalled pack cleanly hands the tree back to the built-in set.
   */
  if (base) {
    const khususPaket = ikonFolderExt(base, buka);
    if (khususPaket) {
      const p = khususPaket.paket ?? '';
      return khususPaket.svg
        ? { id: `ext:${p}:folder:${base}${buka ? ':open' : ''}`, svg: khususPaket.svg, color: khususPaket.color }
        : {
            id: `ext:${p}:folder:${base}${buka ? ':open' : ''}`,
            svg: null,
            glyph: khususPaket.glyph,
            color: khususPaket.color,
          };
    }
  }

  const umumPaket = ikonFolderUmumExt(buka);
  if (umumPaket) {
    const p = umumPaket.paket ?? '';
    return umumPaket.svg
      ? { id: `ext:${p}:folder${buka ? '-open' : ''}`, svg: umumPaket.svg, color: umumPaket.color }
      : {
          id: `ext:${p}:folder${buka ? '-open' : ''}`,
          svg: null,
          glyph: umumPaket.glyph,
          color: umumPaket.color,
        };
  }

  const khusus = base ? IKON_FOLDER_NAMA[base] : undefined;
  if (khusus) return { id: khusus, svg: IKON_SVG[khusus] ?? null };
  const id = buka ? IKON_FOLDER_BUKA : IKON_FOLDER;
  return { id, svg: IKON_SVG[id] ?? IKON_SVG[IKON_FOLDER] ?? null };
}
