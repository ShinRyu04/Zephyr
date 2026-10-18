import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useWiki } from '../../lib/wikiStore';
import type { EntriWiki } from '../../lib/wikiStore';
import { hasilkanWiki, eksporWiki } from '../../lib/wikiGen';
import { fsWrite, fsRead, fsExists, scanDir } from '../../lib/commands';
import { UI_LANGS } from '../../lib/i18n';
import MarkdownPreview from '../editor/MarkdownPreview';

/*
 * "Generate Your Atlas" — the editor-area page for Atlas.
 *
 * TWO BUTTONS, and they are genuinely different paths:
 *
 *   Generate          deterministic. Walks the workspace, reads files, writes
 *                     pages from what it found. Same input, same output, no
 *                     network, no model. Every sentence is traceable to a file.
 *   Create With Plan  opens the chat and hands it `/knowledge-plan`, so the
 *                     reader and the agent agree on scope BEFORE anything is
 *                     written. This is the path for "document only the payment
 *                     module, as architecture notes" - a request no walker can
 *                     infer.
 *
 * Having only the first would make the feature rigid; having only the second
 * would make it slow and non-repeatable. Both write to the same store, so the
 * sidebar shows either result identically.
 *
 * NO ACCOUNT, NO SIGN-IN: the options below are all local, and the page says so
 * by simply not asking for anything.
 */
export default function WikiPage() {
  const tr = useT();
  const workspace = useStore((s) => s.workspace);
  const bukaViewAi = useStore((s) => s.bukaViewAi);

  const tab = useWiki((s) => s.tab);
  const entri = useWiki((s) => s.entri);
  const dipilih = useWiki((s) => s.dipilih);
  const setEntri = useWiki((s) => s.setEntri);
  const setSibuk = useWiki((s) => s.setSibuk);
  const sibuk = useWiki((s) => s.sibuk);
  const galat = useWiki((s) => s.galat);
  const setGalat = useWiki((s) => s.setGalat);
  const terakhir = useWiki((s) => s.terakhir);
  const setTerakhir = useWiki((s) => s.setTerakhir);

  const autoUpdate = useWiki((s) => s.autoUpdate);
  const autoExport = useWiki((s) => s.autoExport);
  const citation = useWiki((s) => s.citation);
  const setOpsi = useWiki((s) => s.setOpsi);
  const bahasa = useWiki((s) => s.bahasa);
  const setBahasa = useWiki((s) => s.setBahasa);

  const [status, setStatus] = useState<string>('');

  /*
   * The 3-dots options menu.
   *
   * Every knob this page owns lives HERE rather than spread across the body:
   * Language, the three Auto switches, plus Export/Import which need a disk
   * action but belong to the same "how this wiki is produced" group. The body
   * keeps only what you press to RUN something (Generate / Create With Plan),
   * so the page reads top-to-bottom as: what it is -> options -> run.
   *
   * Closes on outside click and Escape, same contract as the commit dropdown -
   * a menu that survives a click elsewhere covers the very output you want to
   * read.
   */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const tutup = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('mousedown', tutup);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', tutup);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  /*
   * Export writes the CURRENT in-memory entries, not a fresh generation: the
   * reader presses it after a run they are happy with, and regenerating here
   * would silently replace pages they just read. With nothing generated yet it
   * says so instead of writing an empty tree.
   */
  const eksporSekarang = async () => {
    const wiki = entri.wiki;
    const knowledge = entri.knowledge;
    if (wiki.length === 0 && knowledge.length === 0) {
      setStatus(tr('Nothing to export yet - generate first.'));
      return;
    }
    const r = await eksporWiki({ wiki, knowledge, dibaca: 0, dilewati: 0 }, (p, isi) => fsWrite(p, isi));
    setStatus(
      r.gagal > 0
        ? tr('Exported {ok} pages, {gagal} failed').replace('{ok}', String(r.ditulis)).replace('{gagal}', String(r.gagal))
        : tr('Exported {ok} pages to .zephyr/').replace('{ok}', String(r.ditulis)),
    );
  };

  /*
   * Import reads `.zephyr/wiki/` and `.zephyr/knowledge/` back into the store.
   *
   * The title comes from the first `# ` heading when there is one, else the
   * file name - a re-imported page must look identical in the sidebar to the
   * one that was exported, and headingless markdown still needs a label that
   * is not its slug.
   */
  const imporDariDisk = async () => {
    const akar = useStore.getState().workspace;
    if (!akar) return;
    const dasar = `${akar.replace(/[\\/]+$/, '')}/.zephyr`;
    let baca = 0;
    let gagal = 0;
    for (const tab of ['wiki', 'knowledge'] as const) {
      const folder = `${dasar}/${tab}`;
      const out: EntriWiki[] = [];
      try {
        if (await fsExists(folder)) {
          for (const n of await scanDir(folder)) {
            if (n.isDir || !n.name.toLowerCase().endsWith('.md')) continue;
            try {
              /* fsRead answers with a ReadResult envelope, not a bare string -
                 the content is `.content`. */
              const r = await fsRead(n.path, 'utf8');
              const isi = typeof r === 'string' ? r : r.content;
              const h = /^#\s+(.+)$/m.exec(isi);
              out.push({
                id: n.name.replace(/\.md$/i, ''),
                judul: h?.[1]?.trim() ?? n.name.replace(/\.md$/i, ''),
                isi,
                sumber: `.zephyr/${tab}`,
              });
              baca++;
            } catch {
              gagal++;
            }
          }
        }
      } catch {
        gagal++;
      }
      setEntri(tab, out);
    }
    setStatus(
      baca === 0
        ? tr('Nothing to import yet - export to .zephyr/ first.')
        : gagal > 0
          ? tr('Imported {ok} pages, {gagal} failed').replace('{ok}', String(baca)).replace('{gagal}', String(gagal))
          : tr('Imported {ok} pages from .zephyr/').replace('{ok}', String(baca)),
    );
  };

  const daftar = entri[tab];
  const idTerpilih = dipilih[tab];
  const terpilih = daftar.find((e) => e.id === idTerpilih) ?? null;

  const jalankan = async () => {
    setGalat(null);
    setSibuk(true);
    setStatus('');
    try {
      const hasil = await hasilkanWiki(setStatus);

      setEntri('wiki', hasil.wiki);
      setEntri('knowledge', hasil.knowledge);

      /* Auto Export is honoured HERE rather than in the generator: the generator
         has no opinion about disk, and a caller that only wants to look at the
         result should not have to opt out of writing. */
      if (autoExport) {
        const r = await eksporWiki(hasil, (p, isi) => fsWrite(p, isi));
        setStatus(
          r.gagal > 0
            ? tr('Exported {ok} pages, {gagal} failed').replace('{ok}', String(r.ditulis)).replace('{gagal}', String(r.gagal))
            : tr('Exported {ok} pages to .zephyr/').replace('{ok}', String(r.ditulis)),
        );
      } else {
        setStatus(
          tr('Generated {n} Map pages and {m} Cards')
            .replace('{n}', String(hasil.wiki.length))
            .replace('{m}', String(hasil.knowledge.length)),
        );
      }
      setTerakhir(new Date().toISOString());
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  /*
   * "Create With Plan" opens the chat with the command already typed.
   *
   * The prompt is the SAME text the command describes, so the reader sees what
   * they are about to send instead of a mystery action. It is not sent
   * automatically: the agent needs the reader's answer about scope, and sending
   * a prompt that immediately asks a question is a worse experience than showing
   * the prompt and letting them add the answer.
   */
  const buatRencana = () => {
    bukaViewAi('ai-chat');
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('zephyr-ai-isi', {
          detail:
            '/knowledge-plan Describe your focus (module scope, directory structure, knowledge card types), and I will generate the config first, then create the Atlas Map and Cards accordingly.',
        }),
      );
    }, 180);
  };

  return (
    <div className="wiki-page" data-testid="wiki-page">
      <div className="wiki-page-head">
        <div className="wiki-page-headbar">
          <div className="wiki-page-headteks">
            <h1 className="wiki-page-title">{tr('Generate Your Atlas')}</h1>
            <p className="wiki-page-sub">
              {tr(
                'Document this codebase as pages you can read and as cards your agent can cite.',
              )}
            </p>
          </div>
          {/*
            * The 3-dots button. Sits at the far right of the title row, the
            * conventional place for "everything else this page can do", and it
            * stays visible whether or not a folder is open - options like
            * Citation are preferences, not actions that need a workspace.
            */}
          <div className="wiki-titik3-wrap" ref={menuRef}>
            <button
              type="button"
              className="wiki-titik3"
              data-testid="wiki-options"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={tr('More options')}
              title={tr('More options')}
              onClick={() => setMenu((v) => !v)}
            >
              ⋯
            </button>
            {menu && (
              <div className="wiki-menu" role="menu" data-testid="wiki-options-menu">
                <button type="button" role="menuitem" data-testid="wiki-export" onClick={() => { setMenu(false); void eksporSekarang(); }}>
                  {tr('Export to .zephyr/')}
                </button>
                <button type="button" role="menuitem" data-testid="wiki-import" onClick={() => { setMenu(false); void imporDariDisk(); }}>
                  {tr('Import from .zephyr/')}
                </button>
                <hr className="wiki-menu-pisah" />
                <label className="wiki-menu-row" htmlFor="wiki-menu-bahasa">
                  <span>{tr('Language')}</span>
                  <select
                    id="wiki-menu-bahasa"
                    className="wiki-select"
                    data-testid="wiki-bahasa"
                    value={bahasa}
                    onChange={(e) => setBahasa(e.target.value)}
                  >
                    <option value="">{tr('Follow interface')}</option>
                    {UI_LANGS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wiki-menu-row" title={tr('Regenerate when a new commit lands.')}>
                  <span>{tr('Auto Update')}</span>
                  <input
                    type="checkbox"
                    className="wiki-switch"
                    data-testid="wiki-auto-update"
                    checked={autoUpdate}
                    onChange={(e) => setOpsi({ autoUpdate: e.target.checked })}
                  />
                </label>
                <label className="wiki-menu-row" title={tr('Write the pages into .zephyr/ in this folder.')}>
                  <span>{tr('Auto Export')}</span>
                  <input
                    type="checkbox"
                    className="wiki-switch"
                    data-testid="wiki-auto-export"
                    checked={autoExport}
                    onChange={(e) => setOpsi({ autoExport: e.target.checked })}
                  />
                </label>
                <label className="wiki-menu-row" title={tr('Let the agent cite these pages when it answers.')}>
                  <span>{tr('Citation')}</span>
                  <input
                    type="checkbox"
                    className="wiki-switch"
                    data-testid="wiki-citation"
                    checked={citation}
                    onChange={(e) => setOpsi({ citation: e.target.checked })}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {!workspace ? (
        <p className="wiki-page-note" data-testid="wiki-tanpa-workspace">
          {tr('Open a folder first — the wiki describes a workspace, and there is none open.')}
        </p>
      ) : (
        <>
          <div className="wiki-aksi">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="wiki-generate"
              disabled={sibuk}
              onClick={() => void jalankan()}
            >
              {sibuk ? tr('Generating…') : tr('Generate')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="wiki-create-plan"
              title={tr('Use the /knowledge-plan command to generate wiki conversations')}
              onClick={buatRencana}
            >
              {tr('Create With Plan')}
            </button>
          </div>

          {status && (
            <p className="wiki-page-note" data-testid="wiki-status" role="status">
              {status}
            </p>
          )}

          {galat && (
            <p className="wiki-page-error" data-testid="wiki-galat" role="alert">
              {galat}
            </p>
          )}

          {terakhir && (
            <p className="wiki-page-note">
              {tr('Last generated')}: {new Date(terakhir).toLocaleString()}
            </p>
          )}

          {/* The selected entry, rendered. No entry selected yet: the page shows
              the options only, which is the honest state before a run. */}
          {terpilih && (
            <article className="wiki-artikel" data-testid="wiki-artikel">
              <h2 className="wiki-artikel-judul">{terpilih.judul}</h2>
              <p className="wiki-artikel-sumber">
                {tr('Source')}: <code>{terpilih.sumber}</code>
              </p>
              <MarkdownPreview source={terpilih.isi} />
            </article>
          )}
        </>
      )}
    </div>
  );
}
