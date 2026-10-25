import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { useWs } from '../../lib/workspaceStore';
import FileTree from './FileTree';
import TimelineView from './TimelineView';
import OutlinePanel from './OutlinePanel';
import WorkingSet from './WorkingSet';
import { bacaKerja, langgananKerja } from '../../lib/workingSet';
import SectionLipat from './SectionLipat';
import ContextMenu from './ContextMenu';
import RootSection from '../workspace/RootSection';
import { useT } from '../../lib/i18n';
/*
 * Satu sumber jawaban untuk "apakah ini window Agents?". Dulu hook ini tinggal
 * di file ini, tapi `CodeMirrorEditor` juga membutuhkannya — dan mengimpornya
 * dari sini membentuk impor melingkar yang membuat modul gagal dimuat. Sekarang
 * keduanya membaca dari `lib/useDiAgen`.
 */
import { useDiAgen } from '../../lib/useDiAgen';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

function EmptyWorkspace() {
  const tr = useT();
  const recents = useStore((s) => s.recents);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const openFileDialog = useStore((s) => s.openFileDialog);

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">Workspace</div>
        <p className="side-muted">{tr('No workspace yet - open a folder')}</p>
        <div className="side-actions">
          <button className="btn btn-primary" onClick={openFolderDialog}>
            {tr('Open Folder')}
          </button>
          <button className="btn" onClick={openFileDialog}>
            {tr('Open File')}
          </button>
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">Recent ({recents.length})</div>
        {recents.length === 0 ? (
          <p className="side-muted">{tr('No folder has been opened yet')}</p>
        ) : (
          <ul className="side-list" data-testid="recent-list">
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  className="side-item recent-item"
                  title={r.path}
                  onClick={() => void openWorkspace(r.path)}
                >
                  <span className="side-item-name">{baseOf(r.path)}</span>
                  <span className="recent-path">{r.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ExplorerPanel() {
  const tr = useT();
  const workspace = useStore((s) => s.workspace);
  const closeWorkspace = useStore((s) => s.closeWorkspace);
  const collapseAll = useExplorer((s) => s.collapseAll);
  const refreshAll = useExplorer((s) => s.refreshAll);
  const startInline = useExplorer((s) => s.startInline);
  const filter = useExplorer((s) => s.filter);
  const filterHasil = useExplorer((s) => s.filterHasil);
  const filterJalan = useExplorer((s) => s.filterJalan);
  const filterTerpotong = useExplorer((s) => s.filterTerpotong);
  const setFilter = useExplorer((s) => s.setFilter);
  const clearFilter = useExplorer((s) => s.clearFilter);
  /*
   * The name filter is a TOOLBAR control, not a section of the panel body.
   *
   * It used to sit in the body, between the working set and the tree, so on a
   * fresh workspace the reader saw a heading, an empty line and a stray input
   * before a single file - the reported "kenapa harus bawah". A search control
   * belongs next to the other file actions, and the field only takes a row
   * while the reader is actually typing in it.
   */
  const [filterBuka, setFilterBuka] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const filterAktif = filterBuka || filter.trim() !== '';
  useEffect(() => {
    if (filterAktif) filterRef.current?.focus();
  }, [filterAktif]);
  /* The working-set section follows the same module the list itself reads, so
     the heading appears on the first entry and leaves with the last one. */
  const [adaKerja, setAdaKerja] = useState(false);
  useEffect(() => {
    const kunciKerja = workspace ?? '';
    const segarkan = () => setAdaKerja(bacaKerja(kunciKerja).length > 0);
    segarkan();
    return langgananKerja(segarkan);
  }, [workspace]);

  const jumlahRoot = useWs((s) => s.roots.length);
  const kunciRoots = useWs((s) => s.roots.map((r) => r.path).join('|'));
  const wsFile = useWs((s) => s.file);
  const diAgen = useDiAgen();

  if (!workspace) return <EmptyWorkspace />;

  const roots = useWs.getState().roots;
  const multi = jumlahRoot > 1;

  return (
    <div className="explorer" data-roots={jumlahRoot} data-ws-file={wsFile}>
      {/*
        * No header inside the Agents window.
        *
        * This bar (folder name + new file / new folder / refresh / collapse /
        * close) belongs to VS Code's EDITOR Explorer, where it titles the whole
        * sidebar. The "Open in Agents" window is a different surface with its
        * own layout: the folder is already named in this window's title bar, and
        * the tree here sits under the Changes/Files tab that owns it, so a
        * second title plus a row of editor-level commands is chrome that names
        * nothing and controls the wrong thing. The main window keeps it.
        */}
      {!diAgen && (
        <div className="explorer-header">
        <span className="explorer-title" title={wsFile || workspace}>
          {wsFile ? baseOf(wsFile).replace(/\.code-workspace$/, '') : baseOf(workspace)}
          {multi && <span className="explorer-count"> ({jumlahRoot} folders)</span>}
        </span>
        <div className="explorer-actions">
          <button
            className="ex-btn"
            title="New file"
            aria-label="New file"
            onClick={() =>
              startInline({ kind: 'new-file', target: workspace, initial: 'new-file.txt' })
            }
          >
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M4 2h5l3 3v9H4V2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            className="ex-btn"
            title={tr('New folder')}
            aria-label={tr('New folder')}
            onClick={() =>
              startInline({ kind: 'new-folder', target: workspace, initial: 'new-folder' })
            }
          >
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path
                d="M2 4.2A1.2 1.2 0 013.2 3h2.4l1.2 1.5h5.9a1.2 1.2 0 011.2 1.2v6.1a1.2 1.2 0 01-1.2 1.2H3.2A1.2 1.2 0 012 11.8V4.2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path d="M8 7.5v3.5M6.25 9.25h3.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="ex-btn" title="Refresh" aria-label="Refresh" onClick={() => void refreshAll()}>
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path
                d="M13 8a5 5 0 11-1.8-3.85M13 2.5V6h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className={`ex-btn${filterAktif ? ' is-on' : ''}`}
            title={tr('explorer.filter')}
            aria-label={tr('explorer.filter')}
            aria-pressed={filterAktif}
            data-testid="explorer-filter-toggle"
            onClick={() => {
              if (filterAktif) {
                clearFilter();
                setFilterBuka(false);
              } else {
                setFilterBuka(true);
              }
            }}
          >
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10.2 10.2L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ex-btn" title="Collapse all" aria-label="Collapse all" onClick={collapseAll}>
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M3 5h10M3 8h10M3 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ex-btn" title={tr('Close workspace')} aria-label={tr('Close workspace')} onClick={() => void closeWorkspace()}>
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      )}

      <div className="explorer-body">
        {/*
          * Working set ABOVE the tree.
          *
          * It answers "where is the file I keep jumping to", so it has to be
          * visible without expanding anything - below the tree it would be
          * behind the same scrolling it is meant to save. It starts open for
          * the same reason: a shortcut nobody sees is not a shortcut.
          *
          * The section is HIDDEN while the list is empty: an expanded heading
          * over a grey placeholder spends the first two rows of a fresh
          * workspace on a list that cannot be used yet.
          */}
        {adaKerja && (
          <SectionLipat judul={tr('explorer.workingSet')} testid="sec-working-set" bawaanBuka>
            <WorkingSet />
          </SectionLipat>
        )}
        {/*
          * The field is a one-row strip under the header, shown only while the
          * toolbar toggle is on. It used to be a permanent block above the tree,
          * so an empty workspace opened with a search box floating over nothing.
          */}
        {filterAktif && (
          <div className="ex-filter">
            <input
              ref={filterRef}
              className="ex-filter-input"
              placeholder={tr('explorer.filter')}
              aria-label={tr('explorer.filter')}
              data-testid="explorer-filter"
              value={filter}
              spellCheck={false}
              onChange={(e) => void setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  clearFilter();
                  setFilterBuka(false);
                } else if (e.key === 'Enter' && filterHasil.length > 0) {
                  e.preventDefault();
                  void useStore.getState().openPath(filterHasil[0], { preview: false });
                }
              }}
              onBlur={() => {
                if (filter.trim() === '') setFilterBuka(false);
              }}
            />
            {filter.trim() !== '' && (
              <button
                className="ex-filter-clear"
                title={tr('explorer.filterClear')}
                aria-label={tr('explorer.filterClear')}
                data-testid="explorer-filter-clear"
                onClick={clearFilter}
              >
                ✕
              </button>
            )}
          </div>
        )}
        {filterAktif && filter.trim() !== '' && (
          <p className="ex-filter-note" data-testid="explorer-filter-note" data-count={filterHasil.length}>
            {filterJalan
              ? tr('explorer.filterJalan')
              : filterHasil.length === 0
                ? tr('explorer.filterEmpty')
                : `${filterHasil.length} ${tr('explorer.filterHasil')}${filterTerpotong ? ` (${tr('explorer.filterTerpotong')})` : ''}`}
          </p>
        )}

        {/* A single root is still rendered without a section header: adding one
            header layer for one folder only wastes vertical space.
            `kunciRoots` is used as the key so the tree is rebuilt when the
            root list changes. */}
        {multi ? (
          <div className="root-list" data-testid="root-list" key={kunciRoots}>
            {roots.map((r) => (
              <RootSection key={r.path} root={r} tunggal={false} />
            ))}
          </div>
        ) : (
          <FileTree />
        )}
      </div>

      {/*
        * Outline and Timeline, as COLLAPSIBLE SECTIONS under the tree.
        *
        * They used to be separate icons in the activity bar - three rail buttons
        * for one idea ("things about the file I am looking at"). VS Code and
        * Qoder both put them here, at the bottom of the Explorer, so a reader
        * coming from either looks for them here rather than in the rail.
        *
        * Both start COLLAPSED: the file tree is the reason this column exists,
        * and an Outline that opens by default takes half the height away from
        * the thing the reader actually came for.
        *
        * Absent in the Agents window for the reason Timeline always was: this
        * column is already narrow and split, and neither section is what the
        * Changes/Files column is for.
        */}
      {!diAgen && (
        <>
          <SectionLipat judul={tr('Outline')} testid="sec-outline">
            <OutlinePanel />
          </SectionLipat>
          <SectionLipat judul={tr('Timeline')} testid="sec-timeline">
            <TimelineView />
          </SectionLipat>
        </>
      )}

      <ContextMenu />
    </div>
  );
}
