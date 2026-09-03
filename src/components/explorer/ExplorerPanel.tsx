// ExplorerPanel.tsx — panel Explorer lengkap: header (nama workspace +
// aksi), tree, dan empty state berisi daftar recent workspace.

import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import FileTree from './FileTree';
import TimelineView from './TimelineView';
import ContextMenu from './ContextMenu';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

function EmptyWorkspace() {
  const recents = useStore((s) => s.recents);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const openFileDialog = useStore((s) => s.openFileDialog);

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">Workspace</div>
        <p className="side-muted">Belum ada workspace — buka folder</p>
        <div className="side-actions">
          <button className="btn btn-primary" onClick={openFolderDialog}>
            Buka Folder
          </button>
          <button className="btn" onClick={openFileDialog}>
            Buka File
          </button>
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">Recent ({recents.length})</div>
        {recents.length === 0 ? (
          <p className="side-muted">Belum ada folder yang pernah dibuka</p>
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
  const workspace = useStore((s) => s.workspace);
  const closeWorkspace = useStore((s) => s.closeWorkspace);
  const collapseAll = useExplorer((s) => s.collapseAll);
  const refreshAll = useExplorer((s) => s.refreshAll);
  const startInline = useExplorer((s) => s.startInline);

  if (!workspace) return <EmptyWorkspace />;

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="explorer-title" title={workspace}>
          {baseOf(workspace)}
        </span>
        <div className="explorer-actions">
          <button
            className="ex-btn"
            title="File baru"
            aria-label="File baru"
            onClick={() =>
              startInline({ kind: 'new-file', target: workspace, initial: 'file-baru.txt' })
            }
          >
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M4 2h5l3 3v9H4V2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            className="ex-btn"
            title="Folder baru"
            aria-label="Folder baru"
            onClick={() =>
              startInline({ kind: 'new-folder', target: workspace, initial: 'folder-baru' })
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
          <button className="ex-btn" title="Collapse all" aria-label="Collapse all" onClick={collapseAll}>
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M3 5h10M3 8h10M3 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ex-btn" title="Tutup workspace" aria-label="Tutup workspace" onClick={() => void closeWorkspace()}>
            <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="explorer-body">
        <FileTree />
      </div>

      <TimelineView />

      <ContextMenu />
    </div>
  );
}
