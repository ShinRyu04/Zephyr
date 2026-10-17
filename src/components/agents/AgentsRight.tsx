import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useGit } from '../../lib/gitStore';
import { useStore } from '../../lib/store';
import { tx } from '../../lib/i18n';
import AgentsChanges from './AgentsChanges';
import AgentsEditor from './AgentsEditor';
import EditorTabBar from '../editor/EditorTabBar';

const ExplorerPanel = lazy(() => import('../explorer/ExplorerPanel'));
const SearchPanel = lazy(() => import('../explorer/SearchPanel'));
const AgentsBrowser = lazy(() => import('./AgentsBrowser'));

/**
 * The right column: a small TAB SET over Changes / Files / Search / Browser.
 *
 * This is a tab set, not a fixed pair, because the `+` button opens more
 * surfaces and each has to be closable — otherwise the column only ever grows.
 * Changes and Files START open the way VS Code starts Explorer and SCM open,
 * and like VS Code's they can be closed: the `+` menu carries all four views
 * (with their global shortcuts) so closing everything always leaves a way
 * back, which is why nothing here has to be pinned.
 *
 * The `…` menu carries the view options for the ACTIVE tab, and it is rendered
 * ONLY on Search and Browser. Changes and Files have no per-view options worth
 * a menu; offering `…` there would open a menu of dead controls, which is the
 * same lie the old Shortcuts page told.
 */
type TabId = 'changes' | 'files' | 'search' | 'browser';

interface Tab {
  id: TabId;
  judul: string;
}

/*
 * Changes and Files start open, like VS Code's Explorer and SCM — but they are
 * NOT pinned. They used to be: `tetap` suppressed the close control on them on
 * the theory that closing "the reason the column exists" would leave an empty
 * box. The reader asked for them to be closable like any other tab, and the
 * `+` menu below (four entries, like VS Code's) is the way back — a pinned tab
 * and a menu that can reopen everything are redundant, so the pin is what goes.
 */
const AWAL: Tab[] = [
  { id: 'changes', judul: 'Changes' },
  { id: 'files', judul: 'Files' },
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
  /*
   * Details: apakah daftar (folder/file) ditampilkan.
   *
   * Ini yang dimaksud "Toggle Details" — bukan maximize dan bukan chat.
   * Saat OFF, editor mengambil seluruh lebar kolom karena bagian kanan
   * memang yang disembunyikan, bukan kolomnya yang ditutup.
   */
  const [detailBuka, setDetailBuka] = useState(true);

  /*
   * The editor half belongs to Files and Changes ONLY.
   *
   * The split is not a property of the column, it is a property of the VIEW:
   * Files and Changes hand a file to the editor beside them, so half the column
   * is the point. Search and Browser are full-width surfaces — VS Code draws
   * them across the whole panel — and splitting them left a dead
   * "Open a file from Files or Changes" box taking half the width while the
   * page it was meant to show was squeezed into the other half.
   *
   * Deliberately NOT folded together with `detailBuka`: they are two different
   * things. `detailBuka` hides the LIST and gives the editor the whole column
   * (that is what "Toggle Details" means, and V12b measures it). This decides
   * whether there is an editor half at all. Merging them made turning Details
   * off delete the editor instead of widening it.
   *
   * Derived from `aktif` rather than stored, so switching tabs cannot leave the
   * split out of step with the view.
   */
  const bisaBelah = aktif === 'changes' || aktif === 'files';

  const jumlah = useGit((s) => s.status?.changes.length ?? 0);
  const isRepo = useGit((s) => s.status?.isRepo ?? false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* A file open in the editor — gates the `…` menu, which the reference
     design only draws once there is a file to act on. */
  const adaFileTerbuka = useStore((s) => s.tabs.length > 0);

  /* Opening the column on a folder that is not a repository would show an
     empty Changes tab, so fall through to the file tree instead. Only on the
     first load: after that the user's own tab choice wins. */
  const [sentuh, setSentuh] = useState(false);
  useEffect(() => {
    if (sentuh || isRepo) return;
    setAktif('files');
    setSentuh(true);
  }, [sentuh, isRepo]);

  /*
   * `Ctrl+Alt+L` — the shortcut VS Code puts on this control.
   *
   * Bound HERE rather than in `ACTIONS` (shortcuts.ts) on purpose: that table
   * is the MAIN window's keymap, every entry is user-remappable, and it has no
   * concept of "only in the agents window". A global action would fire in the
   * main window too, where there is no agents detail pane to toggle — a
   * shortcut that does nothing is worse than no shortcut, and it would also
   * collide with whatever the reader maps to it there.
   *
   * `preventDefault` only on an exact match, so Ctrl+Alt+L does not also reach
   * CodeMirror or the window as a character.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey || e.shiftKey || e.key.toLowerCase() !== 'l') return;
      e.preventDefault();
      setDetailBuka((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * Ctrl+Shift+G / E / B / F — the shortcuts the `+` menu advertises.
   *
   * They were previously only PRINTED in that menu, not bound. That was a real
   * defect, not a cosmetic one: closing the last tab unmounts the whole strip
   * (and with it the `+` button), so with no working shortcut there was no way
   * back and the column stayed empty for good. A shortcut shown in a menu must
   * do what it says.
   *
   * Bound here for the same reason as Ctrl+Alt+L below — these are the agents
   * window's own views, and the global `ACTIONS` table has no way to scope a
   * binding to one window.
   */
  useEffect(() => {
    const PETA: Record<string, [TabId, string]> = {
      g: ['changes', 'Changes'],
      e: ['files', 'Files'],
      b: ['browser', 'Browser'],
      f: ['search', 'Search'],
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
      const entri = PETA[e.key.toLowerCase()];
      if (!entri) return;
      e.preventDefault();
      bukaTab(entri[0], entri[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* `bukaTab` stabil (hanya memanggil setState), jadi listener tidak perlu
       dipasang ulang tiap render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const bukaTab = (id: TabId, judul: string) => {
    setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, judul }]));
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
          </button>
        ))}

        {/*
          * The open-file tab bar lives HERE, on the same row as Changes/Files.
          *
          * The reader's reference puts them together — "di vscode bisa setara",
          * one strip containing the column's views and the open files. Two
          * stacked strips (views on top, files under them) cost a row of height
          * and read as two unrelated bars.
          *
          * `EditorTabBar` renders `null` with nothing open, so the strip is
          * unchanged when no file is open. It is inside `.ag-tabbar-host` so the
          * strip's flex rules do not treat its buttons as view tabs.
          */}
        <div className="ag-tabbar-host">
          <EditorTabBar tanpaTabBaru />
        </div>

        {/*
          * `+` and `…` sit IMMEDIATELY after the last tab, before the spacer.
          *
          * They belong to the tab list: `+` adds a tab to it and `…` configures
          * the active one. Putting them at the far right (with Maximize) made a
          * row that read "tabs … unrelated controls … tab controls", and VS Code
          * puts this pair right where the list ends.
          */}
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
            /*
             * Four views, VS Code's own set in VS Code's own order — Changes,
             * Files, Browser, Search — each with the shortcut that opens it
             * from anywhere. This menu is the single way back to every view,
             * now that no tab is pinned: close them all and they all reopen
             * from here.
             */
            <div className="ag-menu" role="menu" data-testid="ag-menu-plus">
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-open-changes"
                onClick={() => bukaTab('changes', 'Changes')}
              >
                <span>{tx('Changes')}</span>
                <span className="ag-menu-kbd">Ctrl+Shift+G</span>
              </button>
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-open-files"
                onClick={() => bukaTab('files', 'Files')}
              >
                <span>{tx('Files')}</span>
                <span className="ag-menu-kbd">Ctrl+Shift+E</span>
              </button>
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-open-browser"
                onClick={() => bukaTab('browser', 'Browser')}
              >
                <span>{tx('Browser')}</span>
                <span className="ag-menu-kbd">Ctrl+Shift+B</span>
              </button>
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

        {/*
          * `…` — view options, shown ONLY on Search and Browser and only while
          * a file is open. The menu closes the active view; Changes and Files
          * do NOT get it because they are pinned and have no options, so a `…`
          * there would be a dead control.
          */}
        {(aktif === 'search' || aktif === 'browser') && adaFileTerbuka && (
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
                {/* Three lines of DECREASING length — the panel-menu glyph, not
                    an ellipsis. Same shape the sidebar toggle uses. */}
                <path d="M2.6 4.2h10.8M2.6 8h8.4M2.6 11.8h5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            {menuTitik && (
              <div className="ag-menu" role="menu" data-testid="ag-menu-more">
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
              </div>
            )}
          </div>
        )}

        <span className="ag-tabs-spacer" />

        {/*
          * Maximize, then Details — the two WINDOW-level controls, pinned to the
          * right end.
          *
          * `+` and `…` above sit with the TAB LIST they act on: `+` adds a tab to
          * that list and `…` configures the active one. These two are not about
          * the tab list at all — they are about the column as a whole — so they
          * are pushed to the far edge, which is where VS Code draws its editor
          * layout controls and what the reader asked to match.
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
            {/*
              * Corner brackets, not a box.
              *
              * The reference draws "Maximize Editor Area" as two L-shaped
              * corners — top-left and bottom-right — which is VS Code's own
              * glyph for the same control. A filled square inside a box read as
              * "zoom", not as "expand the corners outward".
              */}
            {maks ? (
              /* Restoring: the corners INWARD. */
              <>
                <path d="M2.4 6.6V3.2A.8.8 0 013.2 2.4h3.4M13.6 9.4v3.4a.8.8 0 01-.8.8H9.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9.4 2.4h3.4a.8.8 0 01.8.8v3.4M6.6 13.6H3.2a.8.8 0 01-.8-.8V9.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            ) : (
              /* Maximising: the corners OUTWARD. */
              <>
                <path d="M6.2 2.4H3.2a.8.8 0 00-.8.8v3M9.8 2.4h3a.8.8 0 01.8.8v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9.8 13.6h3a.8.8 0 00.8-.8v-3M6.2 13.6h-3a.8.8 0 01-.8-.8v-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>

        {/*
          * Toggle Details — hides the FOLDER half of this column so the editor
          * keeps the body.
          *
          * The reader was precise about the extent: it is the folder that goes,
          * not the column and not the chat. So this is NOT `kananBuka` (that
          * would close the whole column, editor included) and NOT the centre
          * panel (that is the chat). It is the one thing VS Code calls "Toggle
          * Details" in the Agents layout, and the glyph is the same panel icon
          * so the two read as the same control.
          */}
        <button
          className={`ag-tabs-ikon${!detailBuka ? ' is-on' : ''}`}
          data-testid="ag-toggle-details"
          title={tx(detailBuka ? 'Toggle Details' : 'Toggle Details')}
          aria-label={tx('Toggle Details')}
          aria-pressed={!detailBuka}
          onClick={() => setDetailBuka((v) => !v)}
          /* Hidden on Search/Browser: there is no details half to toggle there,
             and a control that changes nothing is a dead control. */
          style={bisaBelah ? undefined : { display: 'none' }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            {/*
              * The right column of the icon is FILLED: that is the half this
              * button takes away, so the glyph itself says which side goes.
              */}
            <path d="M9.6 3.2h3a1.2 1.2 0 011.2 1.2v7.2a1.2 1.2 0 01-1.2 1.2h-3z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/*
        * Body: editor on the LEFT, the tree/list on the RIGHT, side by side.
        *
        * This is the layout the reader asked for in words — "folder-nya di
        * kanan, di kiri code editor" — and it is the one that makes the column
        * usable: a file and the tree it came from are read together, so a
        * second file can be opened without losing sight of the first, which a
        * single stacked pane cannot do.
        *
        * The editor is FIRST in the markup, and there is no `row-reverse`: the
        * first child of a row is the left edge, so the order here is the order
        * on screen. Reversing the row to keep a different source order was
        * tried and put the two panes through each other in a narrow column,
        * where "left" and "first" stopped agreeing with what was drawn.
        *
        * The split is the DEFAULT state for Files and Changes, not something a
        * click turns on: those two views open as editor + list every time.
        * Gating it on an open file meant the column grew a second pane the
        * moment a file was clicked, which moved the file the reader had just
        * aimed at — the layout changed under the pointer. The editor's own
        * empty state says where files come from, so an idle half is
        * informative, not dead space.
        *
        * Search and Browser do NOT get the split at all (see `bisaBelah`
        * above): they are full-width surfaces, and an idle editor half beside
        * them was neither informative nor usable.
        */}
      <div className={`ag-tab-body${bisaBelah ? ' is-belah' : ''}${detailBuka ? '' : ' no-detail'}`}>
        {bisaBelah && (
          <div className="ag-body-ed" data-testid="ag-body-editor">
            <Suspense fallback={null}>
              <AgentsEditor tanpaBar />
            </Suspense>
          </div>
        )}
        {detailBuka && (
          <div className="ag-body-list" data-testid="ag-body-list">
            <Suspense fallback={null}>
              {aktif === 'changes' && <AgentsChanges />}
              {aktif === 'files' && <ExplorerPanel />}
              {aktif === 'search' && <SearchPanel />}
              {aktif === 'browser' && <AgentsBrowser />}
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
