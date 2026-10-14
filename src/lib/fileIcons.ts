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
import { ikonFileExt } from './extIkonFile';

export interface FileIkon {
  /** Icon name from the theme, used as the React key and by tests. */
  id: string;
  /** Inline SVG markup, or null when the name is unknown. */
  svg: string | null;
  /**
   * A text glyph contributed by an installed icon pack, drawn instead of the
   * theme's SVG. Both fields are absent for every built-in icon.
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
   * An installed icon pack is consulted before the built-in extension chain: a
   * pack that only repeated what the theme already drew would be invisible, and
   * "the pack installed but the tree never changed" is the defect this closes.
   * An exact file NAME still wins, so `package.json` keeps its npm mark.
   */
  const dariPaket = base.includes('.') ? ikonFileExt(base) : null;
  return (
    bungkus(IKON_NAMA[base]) ??
    (dariPaket
      ? { id: `ext:${base}`, svg: null, glyph: dariPaket.glyph, color: dariPaket.color }
      : null) ??
    bungkus(cariEkstensi(base)) ??
    bungkus(lang ? IKON_LANG[lang.toLowerCase()] : undefined) ??
    { id: IKON_FILE, svg: IKON_SVG[IKON_FILE] ?? null }
  );
}

/** The icon for a folder row. `buka` picks the expanded variant. */
export function ikonFolder(nama?: string, buka = false): FileIkon {
  // Folder-specific names ("node_modules", "src") have their own marks in the
  // theme; anything else falls back to the plain folder.
  const base = (nama ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
  const khusus = base ? IKON_FOLDER_NAMA[base] : undefined;
  if (khusus) return { id: khusus, svg: IKON_SVG[khusus] ?? null };
  const id = buka ? IKON_FOLDER_BUKA : IKON_FOLDER;
  return { id, svg: IKON_SVG[id] ?? IKON_SVG[IKON_FOLDER] ?? null };
}
