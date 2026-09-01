// EditorArea.tsx — tab bar + FindBar + editor tab aktif + empty state.
// Drag-drop file dari Windows Explorer ditangani lewat event Tauri
// (onDragDropEvent) di App.tsx, bukan di sini.

import { useStore, useActiveTab } from '../../lib/store';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';
import Breadcrumbs from './Breadcrumbs';
import ZephyrLogo from './ZephyrLogo';

function EmptyState() {
  const openFileDialog = useStore((s) => s.openFileDialog);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const newUntitled = useStore((s) => s.newUntitled);

  return (
    <div className="empty-state">
      <ZephyrLogo size={88} className="empty-logo" />
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
      <Breadcrumbs />
      <FindBar />
      <div className="editor-host">
        {tabs.length === 0 || !tab ? <EmptyState /> : <CodeMirrorEditor key={tab.id} tab={tab} />}
      </div>
    </section>
  );
}
