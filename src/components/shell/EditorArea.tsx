// EditorArea.tsx — tab bar + FindBar + editor tab aktif + empty state.
// Drag-drop file dari Windows Explorer ditangani lewat event Tauri
// (onDragDropEvent) di App.tsx, bukan di sini.

import { useStore, useActiveTab } from '../../lib/store';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';

function EmptyState() {
  const openFileDialog = useStore((s) => s.openFileDialog);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const newUntitled = useStore((s) => s.newUntitled);

  return (
    <div className="empty-state">
      <svg viewBox="0 0 120 120" className="empty-logo" aria-hidden="true">
        <rect x="4" y="4" width="112" height="112" rx="24" fill="var(--surface)" stroke="var(--border)" />
        <path
          d="M34 38h52l-34 44h34"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="empty-title">Zephyr</h1>
      <p className="empty-sub">Code faster. Lighter. Yours.</p>

      <div className="empty-actions">
        <button className="btn btn-primary" onClick={openFileDialog}>
          Buka File
        </button>
        <button className="btn" onClick={openFolderDialog}>
          Buka Folder
        </button>
        <button className="btn" onClick={newUntitled}>
          File Baru
        </button>
      </div>

      <dl className="empty-keys">
        <div>
          <dt>Ctrl+N</dt>
          <dd>file baru</dd>
        </div>
        <div>
          <dt>Ctrl+O</dt>
          <dd>buka file</dd>
        </div>
        <div>
          <dt>Ctrl+S</dt>
          <dd>simpan</dd>
        </div>
        <div>
          <dt>Ctrl+F</dt>
          <dd>cari</dd>
        </div>
      </dl>
    </div>
  );
}

export default function EditorArea() {
  const tabs = useStore((s) => s.tabs);
  const tab = useActiveTab();

  return (
    <section className="editor-area">
      <EditorTabBar />
      <FindBar />
      <div className="editor-host">
        {tabs.length === 0 || !tab ? <EmptyState /> : <CodeMirrorEditor key={tab.id} tab={tab} />}
      </div>
    </section>
  );
}
