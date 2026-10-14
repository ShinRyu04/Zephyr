/**
 * Theme Builder — reading the live palette, overriding it, and exporting it.
 *
 * ## How an override works without touching the stylesheets
 *
 * Every colour in Zephyr is a CSS custom property on `:root` or on
 * `[data-theme='…']`. An INLINE custom property on `document.documentElement`
 * beats both — inline style wins over any selector — which is exactly the
 * mechanism `applyTheme` already uses for `--accent`. So a reader's override
 * needs no new theme file, no stylesheet surgery, and no `data-theme` change:
 * setting `root.style.setProperty('--bg', …)` is enough, and removing it puts
 * the base theme back.
 *
 * Because it is the same mechanism the accent already uses, an override survives
 * a theme switch only if the reader wants it to — see `terapkanOverride`.
 *
 * ## Why the palette is READ from the DOM rather than from a table
 *
 * The value a reader should start from is the one currently on screen, which is
 * the result of the base theme, an optional theme EXTENSION, the accent, and any
 * existing overrides — four layers whose combined output only exists in the
 * computed style. A table in this file would be a fifth copy of the same
 * information and would drift from all four.
 */

/**
 * The tokens the builder offers.
 *
 * Imported from `themes.ts` rather than listed again: that module is the one
 * that WRITES them, and a second list here would be a copy that can drift from
 * the applier — the failure being an override the builder offers and the theme
 * engine ignores, which looks like a broken colour picker.
 */
import { TOKEN_OVERRIDE } from './themes';

export const TOKEN_WARNA = TOKEN_OVERRIDE;
export type TokenWarna = (typeof TOKEN_OVERRIDE)[number];

/** A reader's overrides, keyed by token. */
export type OverrideTema = Partial<Record<string, string>>;

/**
 * What a token resolves to RIGHT NOW.
 *
 * `getComputedStyle` on the root returns the CASCADED value — base theme,
 * extension, accent and any existing override already applied. That is the value
 * the reader is looking at, and the only honest starting point for an edit.
 */
export function bacaPalet(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof document === 'undefined') return out;
  const gaya = getComputedStyle(document.documentElement);
  for (const t of TOKEN_WARNA) {
    const v = gaya.getPropertyValue(t).trim();
    if (v) out[t] = v;
  }
  return out;
}

/**
 * Is this a value a colour input can accept?
 *
 * `#rgb`, `#rrggbb` and `#rrggbbaa` only. The computed value is usually a hex
 * for a theme token, but an extension theme may set `rgb(...)`,
 * `color-mix(...)` or a `var()` indirection, and handing any of those to an
 * `<input type="color">` silently produces `#000000` — a control that shows
 * black while the screen shows something else.
 *
 * A non-convertible value is not an error; the row falls back to a text field so
 * the reader sees what is actually there.
 */
export function hexBisa(v: string): string | null {
  const s = v.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (!m) return null;
  const h = m[1];
  /* `<input type="color">` takes six digits only; 8-digit values keep their
     alpha in a separate text field rather than being silently truncated. */
  if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  return `#${h.slice(0, 6)}`;
}

/**
 * Write the overrides onto the document, or clear them.
 *
 * An empty or missing value REMOVES the inline property rather than setting it
 * to an empty string: `setProperty('--bg', '')` makes the property invalid
 * rather than absent, and an invalid value falls back differently from a missing
 * one. Removing is what "no override" means.
 *
 * `--accent-hover` and `--accent-subtle` follow `--accent`, because they are
 * derived from it — setting only the base would leave the hover state on the old
 * colour, which reads as a bug in the theme rather than as an incomplete
 * override.
 */
export function terapkanOverride(ov: OverrideTema): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const t of TOKEN_WARNA) {
    const v = ov[t];
    if (v && v.trim()) root.style.setProperty(t, v.trim());
    else root.style.removeProperty(t);
  }
  const aksen = ov['--accent'];
  if (aksen && aksen.trim()) {
    root.style.setProperty('--accent-hover', aksen.trim());
    root.style.setProperty('--accent-subtle', hexKeRgba(aksen.trim(), 0.16));
  } else {
    root.style.removeProperty('--accent-hover');
    root.style.removeProperty('--accent-subtle');
  }
}

/** `#rrggbb` to `rgba(r,g,b,a)`, for the subtle-accent tint. */
export function hexKeRgba(hex: string, alpha: number): string {
  const h = hexBisa(hex);
  if (!h) return hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Only the tokens actually overridden, so an export does not carry noise. */
export function overrideTerisi(ov: OverrideTema): OverrideTema {
  const out: OverrideTema = {};
  for (const t of TOKEN_WARNA) {
    const v = ov[t];
    if (v && v.trim()) out[t] = v.trim();
  }
  return out;
}
