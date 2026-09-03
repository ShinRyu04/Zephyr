// EditorArea.tsx — tab bar + FindBar + editor tab aktif + empty state.
// Halaman Settings (fase 08) menumpang area yang sama: saat settingsOpen
// true, ia menggantikan editor supaya bisa dibuka tanpa mengganggu tab.
// Drag-drop file dari Windows Explorer ditangani lewat event Tauri
// (onDragDropEvent) di App.tsx, bukan di sini.

import { useStore, useActiveTab } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import DebugToolbar from '../debug/DebugToolbar';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';
import ReadOnlyBanner from '../editor/ReadOnlyBanner';
import ZephyrLogo from './ZephyrLogo';
import SettingsPage from '../settings/SettingsPage';
import DiffViewer from '../scm/DiffViewer';

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
          <dt>Ctrl+,</dt>
          <dd>pengaturan</dd>
        </div>
      </dl>
    </div>
  );
}

export default function EditorArea() {
  const tabs = useStore((s) => s.tabs);
  const tab = useActiveTab();
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  // Diff SCM (fase 10) menumpang area yang sama seperti Settings.
  const hasDiff = useGit((s) => s.diff !== null);

  if (settingsOpen) {
    return (
      <section className="editor-area">
        <div className="set-topbar">
          <span className="set-topbar-title">Pengaturan</span>
          <button
            className="btn btn-sm"
            data-testid="set-close"
            onClick={() => setSettingsOpen(false)}
          >
            Tutup
          </button>
        </div>
        <div className="editor-host">
          <SettingsPage />
        </div>
      </section>
    );
  }

  if (hasDiff) {
    return (
      <section className="editor-area">
        <EditorTabBar />
        <div className="editor-host">
          <DiffViewer />
        </div>
      </section>
    );
  }

  return (
    <section className="editor-area">
      <EditorTabBar />
      {/* fase 24.1: <Breadcrumbs /> versi shell DIHAPUS dari sini.
          Ada DUA komponen bernama Breadcrumbs: yang lama (shell/, hanya path)
          dan yang fase 24 (editor/, path + simbol LSP + dropdown navigasi).
          Keduanya terender sekaligus, jadi jalur file tampil dua kali dan
          memakan 46px tinggi editor. Yang dipertahankan versi fase 24, yang
          dirender di dalam CodeMirrorEditor (butuh EditorView + baris kursor,
          dan ikut mati saat file read-only). */}
      <ReadOnlyBanner />
      <FindBar />
      {/* fase 22: toolbar debug mengambang, hanya saat sesi hidup. Diletakkan
          di editor-area (bukan di dalam CodeMirrorEditor) supaya tetap terlihat
          walau tab yang aktif bukan file yang sedang di-debug. */}
      <DebugToolbar />
      <div className="editor-host">
        {tabs.length === 0 || !tab ? <EmptyState /> : <CodeMirrorEditor key={tab.id} tab={tab} />}
      </div>
    </section>
  );
}
