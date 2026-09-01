// Sidebar.tsx — panel kiri. Fase 03 masih placeholder untuk semua tab
// kecuali Explorer (tree penuh dikerjakan di fase 04); Explorer sudah
// bisa buka folder/file + daftar tab yang terbuka.

import { useStore } from '../../lib/store';
import FileIcon from '../editor/FileIcon';

function ExplorerPanel() {
  const workspace = useStore((s) => s.workspace);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const openFileDialog = useStore((s) => s.openFileDialog);

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">Workspace</div>
        {workspace ? (
          <p className="side-path" title={workspace}>
            {workspace}
          </p>
        ) : (
          <p className="side-muted">Belum ada workspace — buka folder</p>
        )}
        <div className="side-actions">
          <button className="btn btn-primary" onClick={openFolderDialog}>
            Buka Folder
          </button>
          <button className="btn" onClick={openFileDialog}>
            Buka File
          </button>
        </div>
        {workspace && (
          <p className="side-hint">File tree lengkap menyusul di fase 04.</p>
        )}
      </div>

      <div className="side-section">
        <div className="side-title">Editor Terbuka ({tabs.length})</div>
        {tabs.length === 0 ? (
          <p className="side-muted">Belum ada file terbuka</p>
        ) : (
          <ul className="side-list">
            {tabs.map((t) => (
              <li key={t.id}>
                <button
                  className={`side-item${t.id === activeTabId ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                  title={t.path ?? t.name}
                >
                  <FileIcon lang={t.lang} />
                  <span className="side-item-name">{t.name}</span>
                  {t.unsaved && <span className="tab-dot" aria-label="belum disimpan" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">{title}</div>
        <p className="side-muted">{note}</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const activity = useStore((s) => s.activity);

  switch (activity) {
    case 'explorer':
      return <ExplorerPanel />;
    case 'search':
      return <Placeholder title="Search" note="Cari di workspace — fase 04." />;
    case 'scm':
      return <Placeholder title="Source Control" note="Integrasi git — fase 10." />;
    case 'ai':
      return <Placeholder title="AI / MCP" note="Panel AI fase 09, MCP 9222 fase 11." />;
    case 'terminal':
      return <Placeholder title="Terminal" note="Terminal & agent pane — fase 05–06." />;
    case 'settings':
      return <Placeholder title="Settings" note="Halaman settings lengkap — fase 08." />;
  }
}
