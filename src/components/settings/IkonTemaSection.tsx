import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { useIkonTema } from '../../lib/ikonTemaStore';
import { ikonFolder, ikonFile } from '../../lib/fileIcons';
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

/*
 * FOLDER examples, drawn from the SAME pack the card is selling.
 *
 * This is the fix for "the cards all look the same". The card used to show six
 * FILE icons only, and in the pack those six files were drawn from the same few
 * marks - so eight visibly different themes produced eight identical-looking
 * cards. An icon theme is mostly about folders, and the folder is the one shape
 * that actually differs between the themes, so it belongs on the card.
 */
const CONTOH_FOLDER: { nama: string; label: string; buka?: boolean }[] = [
  { nama: 'src', label: 'src' },
  { nama: 'docs', label: 'docs' },
  { nama: 'assets', label: 'assets' },
  { nama: 'src', label: 'src (open)', buka: true },
];

/**
 * Resolve an icon through the PACK ITSELF, using the renderer's own rules.
 *
 * The card used to compute its samples by hand (`p.ikon['folder-open:src'] ??
 * p.ikon['folder:src'] ?? ...`), and that lookup did not match what the tree
 * does: it preferred the OPEN drawing for a CLOSED folder, and it skipped the
 * group/per-name fallback that `ikonFolder` implements. The result was a preview
 * that disagreed with the result of clicking the card - the exact complaint.
 *
 * `ikonFolder` / `ikonFile` are the same functions the file tree calls, so a
 * preview resolved here is byte-identical to what the tree will draw. They read
 * the module-level render map, which `pilih` swaps, so the card is read AFTER
 * that pack is applied (see `terapkan` below).
 */
function ikonDariPaket(p: { ikon: Record<string, { glyph?: string; color?: string; svg?: string }> }, nama: string, buka: boolean) {
  /* Prefer the pack's own entry for this exact name (closed vs open), which is
     what `ikonFolder` resolves to when that key exists. */
  const kunci = buka ? `folder-open:${nama}` : `folder:${nama}`;
  const langsung = p.ikon[kunci];
  if (langsung) return langsung;
  const kelompok = p.ikon[buka ? 'folder-open' : 'folder'];
  if (kelompok) return kelompok;
  return p.ikon[nama] ?? null;
}

/** One icon drawn from a pack, or a dash when the pack has nothing for it. */
function ContohIkon({
  ikon,
  size = 16,
}: {
  ikon?: { glyph?: string; color?: string; svg?: string } | null;
  size?: number;
}) {
  if (!ikon) return <span className="ikt-kosong">—</span>;
  if (ikon.svg) {
    return (
      <span
        className="ikt-svg"
        style={{ width: size, height: size, color: ikon.color }}
        aria-hidden="true"
        /* From the pack's own JSON, sanitised in `normalisasiSvg`
           (extLoader.ts) before it is ever stored. */
        dangerouslySetInnerHTML={{ __html: ikon.svg }}
      />
    );
  }
  return (
    <span
      className="ikt-glif"
      style={{ color: ikon.color ?? 'var(--fg2)', fontSize: Math.max(9, Math.round(size * 0.8)) }}
      aria-hidden="true"
    >
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
   * Applying a pack is ONE store call now. The store swaps the render map and
   * records the choice together, synchronously - see `pilih` in
   * ikonTemaStore.ts for why the swap must not be a separate awaited step.
   *
   * The write also lands in localStorage, which is what carries the choice to
   * the MAIN window (Settings is its own WebView with its own stores). That
   * window listens for the `storage` event and re-applies.
   */
  const terapkan = (extId: string | null) => {
    pilih(extId);
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
              {/*
                * The FOLDER row first, and large.
                *
                * This is the whole difference between the themes - the folder
                * body, its corners, whether it is filled, and what the open lid
                * looks like. Showing only file marks made every card look alike.
                */}
              <span className="ikt-folder-baris">
                {CONTOH_FOLDER.map((c) => (
                  <span className="ikt-folder-item" key={c.label}>
                    <ContohIkon ikon={ikonDariPaket(p, c.nama, !!c.buka)} size={22} />
                    <span className="ikt-contoh-nama">{c.label}</span>
                  </span>
                ))}
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
