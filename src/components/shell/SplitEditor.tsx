import { useRef, lazy, Suspense } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useLayout } from '../../lib/editorLayoutStore';
import CodeMirrorEditor from '../editor/CodeMirrorEditor';
import ImagePreview, { PreviewGambar } from '../editor/ImagePreview';
import { useTampilan, apakahGambar } from '../../lib/tampilanStore';
import NotebookView from '../editor/NotebookView';
import EditorTabBar from '../editor/EditorTabBar';
import FindBar from '../editor/FindBar';
import ReadOnlyBanner from '../editor/ReadOnlyBanner';
import RestrictedBanner from '../workspace/RestrictedBanner';
import DebugToolbar from '../debug/DebugToolbar';
import ZephyrLogo from './ZephyrLogo';
import { ErrorBoundary } from './ErrorBoundary';
import DiffViewer from '../scm/DiffViewer';
const SettingsPage = lazy(() => import('../settings/SettingsPage'));
import { useGit } from '../../lib/gitStore';
import { useT, tx } from '../../lib/i18n';
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
          {tr('Open File')}
        </button>
        <button className="btn" onClick={openFolderDialog}>
          {tr('Open Folder')}
        </button>
        <button className="btn" onClick={newUntitled}>
          {tr('New File')}
        </button>
      </div>

      <dl className="empty-keys">
        <div>
          <dt>Ctrl+N</dt>
          <dd>{tr('new file')}</dd>
        </div>
        <div>
          <dt>Ctrl+O</dt>
          <dd>{tr('open file')}</dd>
        </div>
        <div>
          <dt>Ctrl+S</dt>
          <dd>{tr('save')}</dd>
        </div>
        <div>
          <dt>Ctrl+,</dt>
          <dd>{tr('settings')}</dd>
        </div>
      </dl>
    </div>
  );
}

function EditorPane({ gid }: { gid: string }) {
  const tabs = useStore((s) => s.tabs);
  const tabGlobalAktif = useActiveTab();
  const tabGroup = useLayout((s) => s.groups.find((g) => g.id === gid));
  const fokus = useLayout((s) => s.fokus);
  const split = useLayout((s) => s.split);
  const setGroupTab = useLayout((s) => s.setGroupTab);
  const fokusGroup = useLayout((s) => s.fokusGroup);

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

  const kosongTotal = tabs.length === 0;

  const gambarStore = useTampilan((s) => s.gambar);
  const gambarGrup = !!gambarStore || !!(tab && apakahGambar(tab.path ?? ''));

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
        {gambarGrup ? (

          tab && apakahGambar(tab.path ?? '') ? (
            <PreviewGambar path={tab.path ?? ''} />
          ) : (
            <ImagePreview />
          )
        ) : kosongTotal ? (
          <EmptyState />
        ) : !tab ? (
          <div className="empty-group" data-testid={`empty-group-${gid}`}>
            <ZephyrLogo size={40} />
            <span className="empty-group-label">{tx('Empty group - open a file here')}</span>
          </div>
        ) : tab && (tab.path ?? '').toLowerCase().endsWith('.ipynb') ? (
          <NotebookView />
        ) : (
          <CodeMirrorEditor key={tab.id} tab={tab} />
        )}
      </div>
    </section>
  );
}

function GroupDivider() {
  const tr = useT();
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
      aria-label={tr('Resize editor group width')}
      title={tr('Drag to change the width')}
    />
  );
}

export default function SplitEditor() {
  const tr = useT();
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
            <Suspense fallback={null}>
              <SettingsPage />
            </Suspense>
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
