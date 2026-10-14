import { useEffect, useMemo, useState } from 'react';
import { useT, useTf } from '../../lib/i18n';
import { useSearch } from '../../lib/searchStore';
import { useStore } from '../../lib/store';
import { keMarkdown, petikanUntuk, type Petikan } from '../../lib/searchEditor';
import { fsRead } from '../../lib/commands';
import { clipboardWrite } from '../../lib/clipboard';
import { useAi } from '../../lib/aiStore';

/*
 * Search Editor: every hit, with its surroundings, in one scrollable tab.
 *
 * This is the VS Code Search Editor, not Zed's multibuffer. The difference is
 * stated plainly because it matters:
 *
 *   - A MULTIBUFFER makes excerpts from many files into ONE EDITABLE buffer
 *     whose edits write back to the sources. That needs a document model
 *     mapping buffer positions to file positions across N files.
 *   - THIS is a read-only document of the matches WITH context, navigable and
 *     copyable as a whole — which is what most people actually want from the
 *     other one.
 *
 * The editing half is honestly absent rather than half-present.
 *
 * ## Why the file contents are fetched here and not by the search
 *
 * A search hit carries only its own line. Showing it in context means reading
 * the surrounding lines, and doing that inside the search pass would mean
 * reading every matching file in full during every keystroke of the query. The
 * reader pays for it once, when they open this tab.
 *
 * ## Why the fetches are capped
 *
 * A search across a large repo can match a thousand files. Reading all of them
 * to render a tab nobody has scrolled yet is a lot of disk for no visible gain,
 * so the first `BERKAS_MAKS` are read and the rest are counted and named. A
 * silent truncation would read as "that is all of them".
 */
const BERKAS_MAKS = 60;

interface BerkasPetikan {
  path: string;
  isi: boolean;
  petikan: Petikan[];
  /** Lines of this file the search matched, for the heading. */
  barisCocok: number[];
}

export default function SearchEditorView() {
  const tr = useT();
  const tf = useTf();
  const query = useSearch((s) => s.query);
  const grup = useSearch((s) => s.grup);
  const total = useSearch((s) => s.total);
  const [isi, setIsi] = useState<Record<string, BerkasPetikan>>({});
  const [menyalin, setMenyalin] = useState(false);

  /*
   * Read the matching files once. Keyed on the GROUP array rather than the
   * query, so re-running the same search does not re-read anything, and a new
   * search does.
   *
   * The cleanup guards against a search that finished after this tab was closed
   * — reading files for a view nobody is looking at, and setting state on an
   * unmounted component.
   */
  useEffect(() => {
    let batal = false;
    const jalan = grup.slice(0, BERKAS_MAKS);
    void (async () => {
      const hasil: Record<string, BerkasPetikan> = {};
      for (const g of jalan) {
        try {
          const r = await fsRead(g.path);
          const teks = typeof r === 'string' ? r : ((r as { content?: string })?.content ?? '');
          const barisCocok = g.hits.map((h) => h.line);
          hasil[g.path] = {
            path: g.path,
            isi: true,
            petikan: petikanUntuk(teks, barisCocok),
            barisCocok,
          };
        } catch {
          /* A file that vanished between the search and this read is reported
             as unreadable rather than dropped: the reader ran the search that
             found it, and a missing row would look like a bug in the search. */
          hasil[g.path] = { path: g.path, isi: false, petikan: [], barisCocok: [] };
        }
        if (batal) return;
      }
      if (!batal) setIsi(hasil);
    })();
    return () => {
      batal = true;
    };
  }, [grup]);

  const judul = useMemo(() => tr('Search Results'), [tr]);

  const salin = () => {
    const bagian = grup
      .slice(0, BERKAS_MAKS)
      .map((g) => ({ path: g.path, petikan: isi[g.path]?.petikan ?? [] }))
      .filter((b) => b.petikan.length > 0);
    const md = keMarkdown(query, bagian);
    setMenyalin(true);
    void clipboardWrite(md)
      .then(() => useAi.getState().setToast(tf('{n} results copied as Markdown', { n: String(total) })))
      .finally(() => setMenyalin(false));
  };

  const bukaDiEditor = (path: string, line: number, col: number) => {
    void useStore.getState().openPathAt(path, line, col);
  };

  if (!query.trim()) {
    return (
      <div className="se-view" data-testid="search-editor-view">
        <p className="se-kosong">{tr('Run a search first, then open the results as a tab.')}</p>
      </div>
    );
  }

  const terpotong = grup.length > BERKAS_MAKS;

  return (
    <div className="se-view" data-testid="search-editor-view">
      <div className="se-head">
        <span className="se-judul" data-testid="se-query">
          {judul}: <code>{query}</code>
        </span>
        <span className="se-ringkas" data-testid="se-ringkas">
          {tf('{n} results in {f} files', { n: String(total), f: String(grup.length) })}
        </span>
        <button
          className="btn btn-sm"
          data-testid="se-copy-md"
          disabled={menyalin || total === 0}
          onClick={salin}
        >
          {tr('Copy as Markdown')}
        </button>
      </div>

      {/*
        Truncation is SAID, not silent. A reader who scrolls to the bottom and
        finds nothing more would otherwise conclude the search found only this
        much.
      */}
      {terpotong && (
        <p className="se-terpotong" data-testid="se-truncated">
          {tf('Showing the first {a} of {b} files. Narrow the search to see the rest.', {
            a: String(BERKAS_MAKS),
            b: String(grup.length),
          })}
        </p>
      )}

      <div className="se-body">
        {grup.slice(0, BERKAS_MAKS).map((g) => {
          const b = isi[g.path];
          return (
            <div className="se-berkas" key={g.path} data-testid={`se-file-${g.path}`}>
              <div className="se-berkas-head" title={g.path}>
                {g.path}
                <span className="se-berkas-count">{g.hits.length}</span>
              </div>
              {!b ? (
                <p className="se-memuat">{tr('Reading…')}</p>
              ) : !b.isi ? (
                <p className="se-gagal">{tr('Could not read this file.')}</p>
              ) : (
                b.petikan.map((p, pi) => (
                  <div className="se-petikan" key={pi}>
                    {p.teks.map((t, i) => {
                      const nomor = p.dari + i;
                      const cocok = !!p.cocok[nomor];
                      return (
                        <div
                          className={`se-baris${cocok ? ' is-cocok' : ''}`}
                          key={nomor}
                          data-line={nomor}
                          data-match={cocok ? '1' : undefined}
                          /*
                           * Only a matching line is clickable. A context line
                           * that jumped somewhere would be a promise the row
                           * cannot keep — there is nothing at that line the
                           * reader asked for.
                           */
                          onClick={cocok ? () => bukaDiEditor(g.path, nomor, 1) : undefined}
                        >
                          <span className="se-no">{nomor}</span>
                          <code className="se-teks">{t || ' '}</code>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          );
        })}
        {grup.length === 0 && <p className="se-kosong">{tr('No results.')}</p>}
      </div>
    </div>
  );
}
