import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useWiki } from '../../lib/wikiStore';
import { hasilkanWiki, eksporWiki } from '../../lib/wikiGen';
import { fsWrite } from '../../lib/commands';
import { UI_LANGS } from '../../lib/i18n';
import MarkdownPreview from '../editor/MarkdownPreview';

/*
 * "Generate Your Repo Wiki" — the editor-area page for the Repo Wiki.
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
          tr('Generated {n} wiki pages and {m} knowledge cards')
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
            '/knowledge-plan Describe your focus (module scope, directory structure, knowledge card types), and I will generate the config first, then create the Repo Wiki and knowledge cards accordingly.',
        }),
      );
    }, 180);
  };

  return (
    <div className="wiki-page" data-testid="wiki-page">
      <div className="wiki-page-head">
        <h1 className="wiki-page-title">{tr('Generate Your Repo Wiki')}</h1>
        <p className="wiki-page-sub">
          {tr(
            'Document this codebase as pages you can read and as cards your agent can cite.',
          )}
        </p>
      </div>

      {!workspace ? (
        <p className="wiki-page-note" data-testid="wiki-tanpa-workspace">
          {tr('Open a folder first — the wiki describes a workspace, and there is none open.')}
        </p>
      ) : (
        <>
          <div className="wiki-opsi">
            <label className="wiki-opsi-row">
              <span className="wiki-opsi-label">{tr('Language')}</span>
              <select
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

            {/*
              * The three switches, each with the sentence that says what it
              * actually does. "Auto Update" is the one most likely to be
              * misunderstood - it does NOT watch the filesystem live, it
              * regenerates when a new commit lands - so its hint says exactly
              * that rather than leaving the reader to find out.
              */}
            <label className="wiki-opsi-row">
              <span className="wiki-opsi-label">
                {tr('Auto Update')}
                <span className="wiki-opsi-hint">{tr('Regenerate when a new commit lands.')}</span>
              </span>
              <input
                type="checkbox"
                className="wiki-switch"
                data-testid="wiki-auto-update"
                checked={autoUpdate}
                onChange={(e) => setOpsi({ autoUpdate: e.target.checked })}
              />
            </label>

            <label className="wiki-opsi-row">
              <span className="wiki-opsi-label">
                {tr('Auto Export')}
                <span className="wiki-opsi-hint">{tr('Write the pages into .zephyr/ in this folder.')}</span>
              </span>
              <input
                type="checkbox"
                className="wiki-switch"
                data-testid="wiki-auto-export"
                checked={autoExport}
                onChange={(e) => setOpsi({ autoExport: e.target.checked })}
              />
            </label>

            <label className="wiki-opsi-row">
              <span className="wiki-opsi-label">
                {tr('Citation')}
                <span className="wiki-opsi-hint">
                  {tr('Let the agent cite these pages when it answers.')}
                </span>
              </span>
              <input
                type="checkbox"
                className="wiki-switch"
                data-testid="wiki-citation"
                checked={citation}
                onChange={(e) => setOpsi({ citation: e.target.checked })}
              />
            </label>
          </div>

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
