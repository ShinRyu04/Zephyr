import { useMemo } from 'react';
import type { PaketIkon } from '../../lib/ikonTemaStore';
import { normalisasiSvg } from '../../lib/extLoader';

/*
 * A real preview of an icon theme: the pack's own marks, not a placeholder.
 *
 * WHAT WAS WRONG: a card for an icon theme drew a colour swatch, and one for a
 * bundled pack drew its two initials ("RB" for Round Icons). So the one thing a
 * reader chooses an icon theme BY - how the marks actually look - was absent
 * from the only screen that offers them.
 *
 * THE DATA WAS ALREADY THERE. `PaketIkon.ikon` holds every entry the pack
 * contributes as inline `<svg>` or as a glyph, so this renders straight from it
 * with no new command and no second loader.
 *
 * ALL of them, not a sample: the reader asked to see the whole set, and the
 * whole set is what tells one theme from another. The grid is capped in height
 * and scrolls, so a hundred-file theme cannot push the card past the window.
 */

/** The reserved fallback keys, which are not file types and are shown first. */
const KHUSUS = ['file', 'folder', 'folder-open'];

export interface PratinjauArgs {
  /** Title shown by the browser tooltip and used in the a11y label. */
  label: string;
}

export function PratinjauIkon({ paket }: { paket: PaketIkon } & PratinjauArgs) {
  /*
   * Ordered, de-duplicated list of entries.
   *
   * `ikon` is a map keyed by file extension or name, and the same definition is
   * often bound to several keys. Rendering one cell per KEY would show the same
   * drawing five times (`ts`, `tsx`, `mts`, ...) and hide the variety the card
   * exists to show - so identical definitions collapse to one cell.
   */
  const sel = useMemo(() => {
    const seen = new Set<string>();
    const nama = Object.keys(paket.ikon).filter((k) => !k.startsWith('folder:'));
    const urut = [
      ...KHUSUS.filter((k) => nama.includes(k)),
      ...nama.filter((k) => !KHUSUS.includes(k)).sort(),
    ];
    const out: { kunci: string; svg?: string; glyph?: string; color?: string }[] = [];
    for (const k of urut) {
      const d = paket.ikon[k];
      if (!d) continue;
      /*
       * The markup is sanitised here, not trusted because it came from a pack.
       *
       * `normalisasiSvg` is the same gate the loader applies when a pack is
       * installed: it drops scripts, event handlers and `javascript:` targets.
       * A preview renders on the SAME page as the app, so the preview path must
       * not be the one that skips the gate - and an icon theme can come from a
       * third-party extension package, not only from Zephyr's own bundle.
       */
      const svg = d.svg ? normalisasiSvg(d.svg) ?? undefined : undefined;
      const kunci = svg ?? d.glyph ?? '';
      if (!kunci || seen.has(kunci)) continue;
      seen.add(kunci);
      out.push({ kunci: k, svg, glyph: d.glyph, color: d.color });
    }
    return out;
  }, [paket]);

  if (sel.length === 0) return null;

  return (
    <div className="xmkt-ikon-pratinjau" data-testid={`xmkt-pratinjau-${paket.extId}`}>
      {sel.map((e) => (
        <span
          key={e.kunci}
          className="xmkt-ikon-sel"
          title={e.kunci}
          aria-hidden="true"
        >
          {e.svg ? (
            /*
             * `dangerouslySetInnerHTML` is the same call the file tree makes for
             * these packs: the markup IS the icon, and it cannot be applied any
             * other way. The content comes from a package the reader installed
             * or from Zephyr's own bundled pack, never from remote input.
             */
            <span
              className="xmkt-ikon-svg"
              dangerouslySetInnerHTML={{ __html: e.svg }}
            />
          ) : (
            <span className="xmkt-ikon-glyph" style={e.color ? { color: e.color } : undefined}>
              {e.glyph}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default PratinjauIkon;
