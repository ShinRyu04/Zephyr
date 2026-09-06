// SplitEditor.tsx — area editor dengan dukungan grup (fase 33).
//
// Saat `split=false` (default) render PERSIS seperti EditorArea lama: tab bar
// + empty-state + satu editor. Saat `split=true` area dibagi 2 kolom; tiap
// kolom punya tab bar sendiri dan menampilkan tab aktif group-nya. Divider
// bisa digeser.
//
// Keamanan arsitektur:
//   * Tab global TETAP satu daftar; group hanya "jendela" ke daftar itu.
//   * Tab aktif store global = tab di group fokus. Klik di kolom kanan
//     memindahkan fokus + activeTabId, jadi konsumen lama (LSP, FindBar,
//     MCP) bekerja di kolom yang benar.
//   * Settings & Diff menumpang area yang sama persis seperti EditorArea.

import { useRef } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useLayout } from '../../lib/editorLayoutStore';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';
import ReadOnlyBanner from '../editor/ReadOnlyBanner';
import RestrictedBanner from '../workspace/RestrictedBanner';
import DebugToolbar from '../debug/DebugToolbar';
import ZephyrLogo from './ZephyrLogo';
import SettingsPage from '../settings/SettingsPage';
import DiffViewer from '../scm/DiffViewer';
import { useGit } from '../../lib/gitStore';

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

/** Satu group editor: tab bar + host editor. */
function EditorPane({ gid }: { gid: string }) {
  const tabs = useStore((s) => s.tabs);
  const tabGlobalAktif = useActiveTab();
  const tabGroup = useLayout((s) => s.groups.find((g) => g.id === gid));
  const fokus = useLayout((s) => s.fokus);
  const split = useLayout((s) => s.split);
  const setGroupTab = useLayout((s) => s.setGroupTab);
  const fokusGroup = useLayout((s) => s.fokusGroup);

  // Tab yang tampil di group ini:
  //  * NON-SPLIT (default): tab aktif global — persis perilaku EditorArea
  //    lama. group.tabId sengaja TIDAK dipakai: tidak pernah di-set saat
  //    buka file biasa, dan fallback `find(groupId)` menjebak ke file
  //    PERTAMA group (bug: isi editor tidak pernah ganti saat pindah tab).
  //  * SPLIT: group.tabId milik group itu; fallback tab pertama yang
  //    menandai groupId === gid (pemulihan); group fokus kosong → tab
  //    aktif global biar tidak kosong.
  let tabId: string | null = null;
  if (!split) {
    tabId = tabGlobalAktif?.id ?? null;
  } else {
    tabId =
      tabGroup?.tabId && tabs.some((t) => t.id === tabGroup.tabId)
        ? tabGroup.tabId
        : tabs.find((t) => t.groupId === gid)?.id ?? null;
    if (!tabId && gid === fokus && tabGlobalAktif) tabId = tabGlobalAktif.id;
  }
  const tab = tabs.find((t) => t.id === tabId) ?? null;

  // Non-split & tidak ada tab sama sekali → empty state hero (persis
  // perilaku EditorArea lama; harness F03-V0 memeriksanya).
  const kosongTotal = tabs.length === 0;

  return (
    <section
      className={`editor-group${fokus === gid ? ' is-fokus' : ''}`}
      data-editor-group={gid}
      onClick={() => {
        if (fokus !== gid) {
          if (tab) setGroupTab(gid, tab.id);
          else fokusGroup(gid);
        }
      }}
    >
      {!kosongTotal && <EditorTabBar gid={gid} />}
      <div className="editor-host">
        {kosongTotal ? (
          <EmptyState />
        ) : !tab ? (
          <div className="empty-group" data-testid={`empty-group-${gid}`}>
            <ZephyrLogo size={40} />
            <span className="empty-group-label">Grup kosong — buka file di sini</span>
          </div>
        ) : (
          <CodeMirrorEditor key={tab.id} tab={tab} />
        )}
      </div>
    </section>
  );
}

/** Divider antar grup — digeser untuk mengubah proporsi (25%..75%). */
function GroupDivider() {
  const setRatio = useLayout((s) => s.setRatio);
  const dragging = useRef(false);

  return (
    <div
      className="editor-split-divider"
      data-testid="editor-split-divider"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const wrap = (e.currentTarget as HTMLElement).parentElement;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        const frac = (e.clientX - r.left) / r.width;
        setRatio(frac);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ubah lebar grup editor"
      title="Geser untuk mengubah lebar"
    />
  );
}

export default function SplitEditor() {
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const hasDiff = useGit((s) => s.diff !== null);
  const split = useLayout((s) => s.split);
  const groups = useLayout((s) => s.groups);

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
          <SettingsPage />
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

  // Mode non-split: perilaku identik EditorArea fase lama — satu pane penuh
  // (tab bar + empty state + editor). EditorPane merender semuanya.
  if (!split || groups.length < 2) {
    return (
      <section className="editor-area">
        <RestrictedBanner />
        <ReadOnlyBanner />
        <FindBar />
        <DebugToolbar />
        <EditorPane gid={groups[0]?.id ?? 'g1'} />
      </section>
    );
  }

  // Mode split: dua kolom, masing-masing group punya pane sendiri.
  return (
    <section className={`editor-area is-split`}>
      <RestrictedBanner />
      <ReadOnlyBanner />
      <FindBar />
      <DebugToolbar />
      <div className="editor-split" data-testid="editor-split">
        <EditorPane gid={groups[0].id} />
        <GroupDivider />
        <EditorPane gid={groups[1].id} />
      </div>
    </section>
  );
}
