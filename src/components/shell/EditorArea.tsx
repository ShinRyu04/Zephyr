// EditorArea.tsx — tab bar + FindBar + editor tab aktif + empty state.
// Halaman Settings (fase 08) menumpang area yang sama: saat settingsOpen
// true, ia menggantikan editor supaya bisa dibuka tanpa mengganggu tab.
// Drag-drop file dari Windows Explorer ditangani lewat event Tauri
// (onDragDropEvent) di App.tsx, bukan di sini.

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

/**
 * Muat gambar tab aktif ke store tampilan.
 *
 * KENAPA komponen kecil terpisah: `bukaGambar` adalah efek samping (baca file
 * lewat Rust), dan efek samping di dalam render EditorArea akan terpanggil
 * setiap render ulang.
 */

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
  const tabs = useStore((s) => s.tabs);
  const tab = useActiveTab();
  // Ada gambar yang harus dipratinjau (dari tab gambar atau dari store).
  const gambarStore = useTampilan((s) => s.gambar);
  const gambarAktif = !!gambarStore || !!(tab && apakahGambar(tab.path ?? ''));
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  // Diff SCM (fase 10) menumpang area yang sama seperti Settings.
  const hasDiff = useGit((s) => s.diff !== null);

  if (settingsOpen) {
    return (
      <section className="editor-area">
        <RestrictedBanner />
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
      {/* fase 29: banner Restricted di ATAS area editor, bukan sidebar —
          sidebar bisa disembunyikan dan peringatan keamanan tidak boleh
          ikut hilang. */}
      <RestrictedBanner />
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
        {/* Gambar TIDAK dirender sebagai teks: membukanya di CodeMirror
            menampilkan biner rusak. Pratinjau menggantikannya. */}
        {gambarAktif ? (
          // Pratinjau gambar: dipakai baik saat tab gambar dibuka maupun saat
          // gambar dimuat langsung ke store (command / drag-drop).
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
