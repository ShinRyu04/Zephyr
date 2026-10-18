import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { useIkonTema } from '../../lib/ikonTemaStore';
import { Section } from './SettingsControls';

/*
 * Settings -> Icon Themes: pick which pack draws the file-tree icons.
 *
 * ## Why this is a page and not a row in Extensions
 *
 * Themes and icon themes answer the same question - "how does the editor look" -
 * so they belong side by side in the rail. A reader who just changed the colours
 * is the one most likely to want the icons to match, and hunting for that in a
 * marketplace list is how it gets missed.
 *
 * ## Why a grid of cards rather than a dropdown
 *
 * Because an icon theme is a LOOK, and a name does not tell you what it looks
 * like. Each card draws the same handful of file types with that pack's icons, so
 * the choice is made by looking. A dropdown would make the reader pick, apply,
 * look at the tree, and come back - three steps to answer a question that one
 * glance can settle.
 *
 * ## Why the choice needs an Apply at all
 *
 * It does not: picking a card applies it immediately. The packs are already
 * loaded (the loader read them at startup), so switching is re-registering one
 * pack's icons into the render map - no reload, no restart. The "Zephyr" card is
 * the built-in set, and it is first so "back to normal" is always in the same
 * place.
 */

/** File types drawn in every card, so the cards are comparable. */
const CONTOH = [
  { nama: 'app.tsx', ext: 'tsx', label: 'TSX' },
  { nama: 'main.rs', ext: 'rs', label: 'Rust' },
  { nama: 'script.py', ext: 'py', label: 'Python' },
  { nama: 'data.json', ext: 'json', label: 'JSON' },
  { nama: 'style.css', ext: 'css', label: 'CSS' },
  { nama: 'README.md', ext: 'md', label: 'Markdown' },
];

/** One icon drawn from a pack, or a dash when the pack has nothing for it. */
function ContohIkon({
  ikon,
}: {
  ikon?: { glyph?: string; color?: string; svg?: string };
}) {
  if (!ikon) return <span className="ikt-kosong">—</span>;
  if (ikon.svg) {
    return (
      <span
        className="ikt-svg"
        aria-hidden="true"
        /* From the pack's own JSON, sanitised in `normalisasiSvg`
           (extLoader.ts) before it is ever stored. */
        dangerouslySetInnerHTML={{ __html: ikon.svg }}
      />
    );
  }
  return (
    <span className="ikt-glif" style={{ color: ikon.color ?? 'var(--fg2)' }} aria-hidden="true">
      {ikon.glyph}
    </span>
  );
}

export default function IkonTemaSection() {
  const tr = useT();
  const packs = useIkonTema((s) => s.packs);
  const aktif = useIkonTema((s) => s.aktif);
  const pilih = useIkonTema((s) => s.pilih);
  const [cari, setCari] = useState('');

  /*
   * Applying a pack is a store write plus a re-register. The re-register is what
   * the tree sees; it lives in `extLoader.terapkanIkonTema` so there is ONE
   * implementation of "make this pack the one on screen" - the loader uses it at
   * startup and this uses it on click, and two copies would drift.
   */
  const terapkan = (extId: string | null) => {
    pilih(extId);
    void import('../../lib/extLoader').then((m) => m.terapkanIkonTema(extId));
  };

  const q = cari.trim().toLowerCase();
  const tampil = q ? packs.filter((p) => p.label.toLowerCase().includes(q)) : packs;

  return (
    <Section title={tr('settings.icons')}>
      <p className="set-note">
        {tr(
          'Which icon set the file tree, tabs and breadcrumb use. Picking a card applies it immediately - no restart.',
        )}
      </p>

      {packs.length > 0 && (
        <div className="ikt-cari">
          <input
            type="text"
            data-testid="ikt-search"
            placeholder={tr('Search icon themes…')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            aria-label={tr('Search icon themes…')}
          />
        </div>
      )}

      <div className="ikt-grid" data-testid="ikt-grid" role="radiogroup" aria-label={tr('settings.icons')}>
        {/*
          * The built-in set is ALWAYS a card, even with nothing installed.
          *
          * Without it there is no way back: a reader who installs a pack, dislikes
          * it, and uninstalls it would be left with whatever pack the loader read
          * last. "Zephyr" here means the icons that ship with the app.
          */}
        {(!q || 'zephyr'.includes(q) || 'bawaan'.includes(q)) && (
          <button
            type="button"
            role="radio"
            aria-checked={aktif === null}
            className={`ikt-card${aktif === null ? ' is-active' : ''}`}
            data-testid="ikt-card-bawaan"
            onClick={() => terapkan(null)}
          >
            <span className="ikt-card-head">
              <span className="ikt-card-nama">{tr('Zephyr (built-in)')}</span>
              {aktif === null && <span className="ikt-badge">{tr('Active')}</span>}
            </span>
            <span className="ikt-contoh">
              {CONTOH.map((c) => (
                <span className="ikt-contoh-item" key={c.ext}>
                  {/* No pack icon: the built-in art is drawn by the tree itself,
                      so this card shows the fallback dot rather than pretending
                      to know what Zephyr's icons look like out of context. */}
                  <span className="ikt-kosong" aria-hidden="true">
                    ●
                  </span>
                  <span className="ikt-contoh-nama">{c.label}</span>
                </span>
              ))}
            </span>
          </button>
        )}

        {tampil.map((p) => {
          const aktifIni = aktif === p.extId;
          return (
            <button
              key={p.extId}
              type="button"
              role="radio"
              aria-checked={aktifIni}
              className={`ikt-card${aktifIni ? ' is-active' : ''}`}
              data-testid={`ikt-card-${p.extId}`}
              onClick={() => terapkan(p.extId)}
            >
              <span className="ikt-card-head">
                <span className="ikt-card-nama">{p.label}</span>
                {aktifIni && <span className="ikt-badge">{tr('Active')}</span>}
              </span>
              <span className="ikt-contoh">
                {CONTOH.map((c) => (
                  <span className="ikt-contoh-item" key={c.ext}>
                    <ContohIkon ikon={p.ikon[c.ext] ?? p.ikon[`file:${c.ext}`]} />
                    <span className="ikt-contoh-nama">{c.label}</span>
                  </span>
                ))}
              </span>
              <span className="ikt-card-meta">
                {p.jumlahSvg > 0
                  ? `${Object.keys(p.ikon).length} ${tr('icons')} · ${p.jumlahSvg} ${tr('drawings')}`
                  : `${Object.keys(p.ikon).length} ${tr('letter marks')}`}
              </span>
            </button>
          );
        })}
      </div>

      {tampil.length === 0 && q && (
        <p className="set-note" data-testid="ikt-kosong">
          {tr('No icon theme matches that search.')}
        </p>
      )}

      {packs.length === 0 && (
        /*
         * The honest empty state.
         *
         * No packs installed is the DEFAULT, not a failure: Zephyr ships with its
         * own icons. Saying so - and naming where packs come from - is better
         * than an empty grid that reads as a broken page.
         */
        <p className="set-note" data-testid="ikt-tidak-ada">
          {tr(
            'No icon packs installed yet. Install one from Extensions -> Icon Themes, and it will appear here.',
          )}
        </p>
      )}
    </Section>
  );
}
