import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useGit } from '../../lib/gitStore';
import { tx } from '../../lib/i18n';
import AgentsChanges from './AgentsChanges';

const ExplorerPanel = lazy(() => import('../explorer/ExplorerPanel'));
const SearchPanel = lazy(() => import('../explorer/SearchPanel'));

/**
 * The right column: a small TAB SET over Changes / Files / Search.
 *
 * This is a tab set, not a fixed pair, because the `+` button opens more
 * surfaces (Search) and each has to be closable — otherwise the column only
 * ever grows. `Changes` and `Files` are pinned: they are the reason the column
 * exists and closing them would leave an empty box with no way back, which is
 * what the `+` menu is for anyway.
 *
 * The tab strip's own `…` menu carries the view options for the ACTIVE tab
 * (View as Tree for Changes), the way VS Code puts a view's options on the view
 * rather than in a global menu.
 *
 * NOTE on the Browser tab: the reference design also offers one, and this
 * column does not yet. `BrowserPane` (components/terminal/BrowserPane.tsx) is
 * NOT reusable here — it takes a `PaneMeta` and drives `useTerminal.setPaneUrl`,
 * so mounting it outside the terminal pane grid would either crash on a missing
 * pane or hijack the terminal's own pane state. A standalone browser view is a
 * separate piece of work.
 */
type TabId = 'changes' | 'files' | 'search';

interface Tab {
  id: TabId;
  judul: string;
  /** Pinned tabs cannot be closed — see the note above. */
  tetap?: boolean;
}

const AWAL: Tab[] = [
  { id: 'changes', judul: 'Changes', tetap: true },
  { id: 'files', judul: 'Files', tetap: true },
];

export default function AgentsRight({
  maks,
  onToggleMaks,
}: {
  maks: boolean;
  onToggleMaks: () => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>(AWAL);
  const [aktif, setAktif] = useState<TabId>('changes');
  const [menuPlus, setMenuPlus] = useState(false);
  const [menuTitik, setMenuTitik] = useState(false);
  const [pohon, setPohon] = useState(false);

  const jumlah = useGit((s) => s.status?.changes.length ?? 0);
  const isRepo = useGit((s) => s.status?.isRepo ?? false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* Opening the column on a folder that is not a repository would show an
     empty Changes tab, so fall through to the file tree instead. Only on the
     first load: after that the user's own tab choice wins. */
  const [sentuh, setSentuh] = useState(false);
  useEffect(() => {
    if (sentuh || isRepo) return;
    setAktif('files');
    setSentuh(true);
  }, [sentuh, isRepo]);

  /* Any click outside closes whichever menu is open. */
  useEffect(() => {
    if (!menuPlus && !menuTitik) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuPlus(false);
        setMenuTitik(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuPlus, menuTitik]);

  const bukaTab = (id: TabId, judul: string, tetap = false) => {
    setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, judul, tetap }]));
    setAktif(id);
    setMenuPlus(false);
    setSentuh(true);
  };

  const tutupTab = (id: TabId) => {
    setTabs((t) => {
      const sisa = t.filter((x) => x.id !== id);
      /* Closing the active tab falls back to its left neighbour (or the first
         tab), so the column never ends up pointing at a tab that is gone. */
      if (aktif === id) {
        const idx = t.findIndex((x) => x.id === id);
        const berikut = sisa[Math.max(0, idx - 1)];
        if (berikut) setAktif(berikut.id);
      }
      return sisa;
    });
  };

  return (
    <div className="ag-kanan" data-testid="ag-right" ref={wrapRef}>
      <div className="ag-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            className={`ag-tab${aktif === t.id ? ' is-aktif' : ''}`}
            data-testid={`ag-tab-${t.id}`}
            aria-selected={aktif === t.id}
            onClick={() => {
              setAktif(t.id);
              setSentuh(true);
            }}
          >
            <span className="ag-tab-teks">{tx(t.judul)}</span>
            {t.id === 'changes' && jumlah > 0 && (
              <span className="ag-tab-badge">{jumlah > 99 ? '99+' : jumlah}</span>
            )}
            {!t.tetap && (
              <span
                className="ag-tab-tutup"
                role="button"
                aria-label={tx('Close')}
                data-testid={`ag-tab-close-${t.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  tutupTab(t.id);
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}

        <span className="ag-tabs-spacer" />

        {/*
          * Maximise, at the right end of the tab strip — where the editor-area
          * toggle lives in the reference design (it is a control over the whole
          * workspace, not over any one tab, so it sits after the tab list and
          * before the view options). It collapses the LEFT column so the chat
          * gets the width; the right column stays because this button lives
          * inside it.
          */}
        <button
          className={`ag-tabs-ikon${maks ? ' is-on' : ''}`}
          data-testid="ag-maximize"
          title={tx(maks ? 'Restore Editor Area' : 'Maximize Editor Area')}
          aria-label={tx(maks ? 'Restore Editor Area' : 'Maximize Editor Area')}
          aria-pressed={maks}
          onClick={onToggleMaks}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {maks ? (
              <>
                <rect x="1.6" y="4.4" width="8.4" height="8.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M6 4.4V3.2A1.2 1.2 0 0 1 7.2 2h6.2A1.2 1.2 0 0 1 14.6 3.2v6.2A1.2 1.2 0 0 1 13.4 10.6h-1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </>
            ) : (
              <>
                <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.4 5.4h5.2v5.2H5.4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </>
            )}
          </svg>
        </button>

        {/* `+` — opens another surface as a tab. */}
        <div className="ag-tabs-menuwrap">
          <button
            className="ag-tabs-ikon"
            data-testid="ag-tab-plus"
            aria-label={tx('Open View')}
            aria-expanded={menuPlus}
            onClick={() => {
              setMenuPlus((v) => !v);
              setMenuTitik(false);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          {menuPlus && (
            <div className="ag-menu" role="menu" data-testid="ag-menu-plus">
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-open-search"
                onClick={() => bukaTab('search', 'Search')}
              >
                <span>{tx('Search')}</span>
                <span className="ag-menu-kbd">Ctrl+Shift+F</span>
              </button>
            </div>
          )}
        </div>

        {/* `…` — options for the ACTIVE tab. */}
        <div className="ag-tabs-menuwrap">
          <button
            className="ag-tabs-ikon"
            data-testid="ag-tab-more"
            aria-label={tx('View Options')}
            aria-expanded={menuTitik}
            onClick={() => {
              setMenuTitik((v) => !v);
              setMenuPlus(false);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3.4" cy="8" r="1.2" fill="currentColor" />
              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
              <circle cx="12.6" cy="8" r="1.2" fill="currentColor" />
            </svg>
          </button>
          {menuTitik && (
            <div className="ag-menu" role="menu" data-testid="ag-menu-more">
              {aktif === 'changes' && (
                <button
                  role="menuitem"
                  className="ag-menu-item"
                  data-testid="ag-view-as-tree"
                  onClick={() => {
                    setPohon((v) => !v);
                    setMenuTitik(false);
                  }}
                >
                  <span>{tx('View as Tree')}</span>
                  {pohon && <span className="ag-menu-centang">✓</span>}
                </button>
              )}
              {aktif === 'files' && (
                <button
                  role="menuitem"
                  className="ag-menu-item"
                  data-testid="ag-collapse-all"
                  onClick={() => {
                    void import('../../lib/explorerStore').then((m) =>
                      m.useExplorer.getState().collapseAll(),
                    );
                    setMenuTitik(false);
                  }}
                >
                  <span>{tx('Collapse Folders in Explorer')}</span>
                </button>
              )}
              {aktif !== 'changes' && aktif !== 'files' && (
                <button
                  role="menuitem"
                  className="ag-menu-item"
                  data-testid="ag-close-view"
                  onClick={() => {
                    tutupTab(aktif);
                    setMenuTitik(false);
                  }}
                >
                  <span>{tx('Close')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ag-tab-body">
        <Suspense fallback={null}>
          {aktif === 'changes' && <AgentsChanges />}
          {aktif === 'files' && <ExplorerPanel />}
          {aktif === 'search' && <SearchPanel />}
        </Suspense>
      </div>
    </div>
  );
}
