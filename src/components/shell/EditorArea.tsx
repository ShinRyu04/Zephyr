import { useStore, useActiveTab } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { useGit } from '../../lib/gitStore';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import DebugToolbar from '../debug/DebugToolbar';
import RestrictedBanner from '../workspace/RestrictedBanner';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';
import ReadOnlyBanner from '../editor/ReadOnlyBanner';
import ZephyrLogo from './ZephyrLogo';
import { ErrorBoundary } from './ErrorBoundary';
import SettingsPage from '../settings/SettingsPage';
import DiffViewer from '../scm/DiffViewer';
import ImagePreview, { PreviewGambar } from '../editor/ImagePreview';
import { apakahGambar, useTampilan } from '../../lib/tampilanStore';

function EmptyState() {
  const openFileDialog = useStore((s) => s.openFileDialog);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const newUntitled = useStore((s) => s.newUntitled);
  const tr = useT();

  return (
    <div className="empty-state">
      <ZephyrLogo size={88} className="empty-logo" />
      <h1 className="empty-title">Zephyr</h1>
      <p className="empty-sub">Code faster. Lighter. Yours.</p>

      <div className="empty-actions">
        <button className="btn btn-primary" onClick={openFileDialog}>
          {tr('welcome.openFile')}
        </button>
        <button className="btn" onClick={openFolderDialog}>
          {tr('welcome.openFolder')}
        </button>
        <button className="btn" onClick={newUntitled}>
          {tr('welcome.newFile')}
        </button>
      </div>

      <dl className="empty-keys">
        <div>
          <dt>Ctrl+N</dt>
          <dd>{tr('welcome.kb.newFile')}</dd>
        </div>
        <div>
          <dt>Ctrl+O</dt>
          <dd>{tr('welcome.kb.openFile')}</dd>
        </div>
        <div>
          <dt>Ctrl+S</dt>
          <dd>{tr('welcome.kb.save')}</dd>
        </div>
        <div>
          <dt>Ctrl+,</dt>
          <dd>{tr('welcome.kb.settings')}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function EditorArea() {
  const tr = useT();
  const tabs = useStore((s) => s.tabs);
  const tab = useActiveTab();

  const gambarStore = useTampilan((s) => s.gambar);
  const gambarAktif = !!gambarStore || !!(tab && apakahGambar(tab.path ?? ''));
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const hasDiff = useGit((s) => s.diff !== null);

  if (settingsOpen) {
    return (
      <section className="editor-area">
        <RestrictedBanner />
        <div className="set-topbar">
          <span className="set-topbar-title">{tr('Settings')}</span>
          <button
            className="btn btn-sm"
            data-testid="set-close"
            onClick={() => setSettingsOpen(false)}
          >
            {tr('Close')}
          </button>
        </div>
        <div className="editor-host">
          <ErrorBoundary nama="Settings">
            <SettingsPage />
          </ErrorBoundary>
        </div>
      </section>
    );
  }

  if (hasDiff) {
    return (
      <section className="editor-area">
        <RestrictedBanner />
        <EditorTabBar />
        <div className="editor-host">
          <DiffViewer />
        </div>
      </section>
    );
  }

  return (
    <section className="editor-area">
      {/* fase 29: banner Restricted di ATAS area editor, bukan sidebar -
          sidebar bisa disembunyikan dan peringatan keamanan tidak boleh
          ikut hilang. */}
      <RestrictedBanner />
      <EditorTabBar />
      {/* The shell version of <Breadcrumbs /> was REMOVED from here:
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
        {/* Gambar TIDAK dirender sebagai teks: membukanya di CodeMirror
            menampilkan biner rusak. Pratinjau menggantikannya. */}
        {gambarAktif ? (

          tab && apakahGambar(tab.path ?? '') ? (
            <PreviewGambar path={tab.path ?? ''} />
          ) : (
            <ImagePreview />
          )
        ) : tabs.length === 0 || !tab ? (
          <EmptyState />
        ) : (
          <CodeMirrorEditor key={tab.id} tab={tab} />
        )}
      </div>
    </section>
  );
}
