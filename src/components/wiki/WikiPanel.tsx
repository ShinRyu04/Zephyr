import { useT } from '../../lib/i18n';
import { useWiki } from '../../lib/wikiStore';

/*
 * The Atlas sidebar: two tabs (Map / Cards), a search box, and the entry list.
 *
 * WHY TWO TABS and not one list: the two artefacts have different READERS. The
 * Map pages are prose a person reads; the Cards are compact facts a model is
 * handed. Mixing them into one list would mean a reader scrolling past
 * machine-shaped cards to find the page they wanted, and a retrieval path having
 * to filter the human pages out again.
 *
 * The banner above the list says which is which, in the same words the editor
 * pane uses, so the distinction is stated once in the place it is needed rather
 * than assumed.
 */
export default function WikiPanel() {
  const tr = useT();
  const tab = useWiki((s) => s.tab);
  const setTab = useWiki((s) => s.setTab);
  const entri = useWiki((s) => s.entri);
  const dipilih = useWiki((s) => s.dipilih);
  const pilih = useWiki((s) => s.pilih);
  const sibuk = useWiki((s) => s.sibuk);
  const terakhir = useWiki((s) => s.terakhir);

  const daftar = entri[tab];
  const terpilih = dipilih[tab];

  return (
    <div className="wiki-panel" data-testid="wiki-panel">
      <div className="wiki-tabs" role="tablist" aria-label={tr('Atlas')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'wiki'}
          className={`wiki-tab${tab === 'wiki' ? ' is-active' : ''}`}
          data-testid="wiki-tab-wiki"
          onClick={() => setTab('wiki')}
        >
          {tr('Map')}
          {/*
            * The `generated` badge is not decoration: a Map page states file
            * counts and module sizes, and those are true only on the day of the
            * run. Saying so on the tab itself means the reader never has to
            * wonder whether "549 files" is current - it is visibly a snapshot.
            * Cards carry no badge because each one is traceable to its file.
            */}
          {terakhir && (
            <>
              {' '}
              <span
                className="wiki-tab-badge"
                data-testid="wiki-map-badge"
                title={`${tr('generated')} ${new Date(terakhir).toLocaleString()}`}
              >
                {tr('generated')}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'knowledge'}
          className={`wiki-tab${tab === 'knowledge' ? ' is-active' : ''}`}
          data-testid="wiki-tab-knowledge"
          onClick={() => setTab('knowledge')}
        >
          {tr('Cards')}
        </button>
      </div>

      <div className="wiki-cari">
        <input
          type="text"
          placeholder={tab === 'wiki' ? tr('Search the Map') : tr('Search Cards')}
          aria-label={tab === 'wiki' ? tr('Search the Map') : tr('Search Cards')}
          data-testid="wiki-search"
        />
      </div>

      <div className="wiki-list" data-testid="wiki-list">
        {sibuk && <p className="wiki-note">{tr('Generating…')}</p>}

        {!sibuk && daftar.length === 0 && (
          /*
           * The empty state names the NEXT ACTION rather than saying "nothing
           * here". A reader who lands on an empty list needs to know that this
           * is the expected state before a run, not a failure.
           */
          <p className="wiki-note" data-testid="wiki-kosong">
            {tr('Nothing generated yet. Press Generate in the editor to build the wiki and the cards.')}
          </p>
        )}

        {daftar.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`wiki-item${terpilih === e.id ? ' is-active' : ''}`}
            data-testid={`wiki-item-${e.id}`}
            aria-current={terpilih === e.id}
            onClick={() => pilih(tab, e.id)}
          >
            <span className="wiki-item-judul">{e.judul}</span>
            <span className="wiki-item-sumber">{e.sumber}</span>
          </button>
        ))}
      </div>

      <div className="wiki-banner" role="note">
        {tr(
          'Map (for you) and Cards (for agents) are generated and updated together from your codebase.',
        )}
      </div>
    </div>
  );
}
