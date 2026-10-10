import { useRef, lazy, Suspense, useEffect } from 'react';
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
import { useAiChatSettings } from '../../lib/chatSettingsStore';
const SettingsPage = lazy(() => import('../settings/SettingsPage'));
const AiChatView = lazy(() => import('../ai/AiPanel'));
const ChatSettingsPage = lazy(() => import('../ai/ChatSettingsPage'));
// Dev Environment, API Client and SFTP are full-page views: each carries its own
// header and row layout. They take over the middle area the same way Settings
// does below, instead of sitting in the sidebar, where they were squeezed into a
// narrow column while the editor stayed empty beside them.
const DevEnvView = lazy(() => import('../devenv/DevEnvView'));
const TestsView = lazy(() => import('../shell/TestsView'));
const ApiClientView = lazy(() => import('../api/ApiClientView'));
const SftpView = lazy(() => import('../sftp/SftpView'));
const ToolsView = lazy(() => import('../shell/ToolsView'));
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

/*
 * The chat as an editor tab — the CHAT ONLY, with no bar above it.
 *
 * Not `AiHost`. That component is the right-hand panel's full surface and it
 * carries the "Chat / Claude Code / Codex" tab strip; mounting it here would put
 * a second tab strip inside an editor tab and offer the CLI tabs in a place the
 * reader did not ask for them. This tab is the Zephyr conversation only.
 *
 * There is deliberately NO header row. An editor tab already has a title in the
 * tab strip, so a second bar repeating "Chat" under it is the frame-around-a-
 * frame the reader asked to have removed. The chat's own actions (new chat,
 * history, "…") are reachable from the "…" menu and the docked panel, and the
 * chat's status chips already sit in its bottom bar — so the tab is just the
 * conversation, edge to edge.
 */
function AiChatOnly() {
  return (
    <div className="ai-view-chat" data-testid="ai-view-chat">
      {/*
        * `composerId` is what keeps this composer's text its own.
        *
        * The right-hand column mounts the same `AiPanel` with the primary id
        * ('') at the same time, and before this both read one `draft` from
        * `aiStore` — so the two boxes mirrored each other: type here, the column
        * typed too. The transcript is still shared (one conversation), but each
        * surface now owns its half-typed message.
        */}
      <AiChatView composerId="editor" />
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
        {/*
          * A VIEW tab (chat / Chat Settings) comes first.
          *
          * Checked before the image branch on purpose: these tabs carry a null
          * path, and every path-based test below would otherwise fall through to
          * CodeMirror and render an empty buffer behind the button that opened
          * them. `key` on the tab id so switching between two view tabs remounts
          * — the two are different components with their own state.
        */}
        {tab?.view === 'ai-chat' ? (
          <div className="ai-view-tab" data-testid="ai-view-tab-chat">
            <ErrorBoundary nama="AI">
              <Suspense fallback={null}>
                <AiChatOnly />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : tab?.view === 'chat-settings' ? (
          <div className="ai-view-tab" data-testid="ai-view-tab-chat-settings">
            <ErrorBoundary nama="ChatSettings">
              <Suspense fallback={null}>
                <ChatSettingsPage onClose={() => useStore.getState().requestCloseTab(tab.id)} />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : gambarGrup ? (

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
  const activity = useStore((s) => s.activity);
  const hasDiff = useGit((s) => s.diff !== null);
  const split = useLayout((s) => s.split);
  const groups = useLayout((s) => s.groups);

  /*
   * Chat Settings and the AI chat are TABS now, not branches here.
   *
   * Both used to swap this whole editor area for a lone page with no tab row,
   * which is what made them read as "maximize": nothing to click back to, no tab
   * in the strip, nothing to close. They are ordinary `Tab`s carrying a `view`
   * and are routed inside `EditorPane` instead, so they get the real tab strip,
   * real close button, and sit beside the files. `aiPanel: 'editor'` is still
   * read below for the layout the user saved in an older version — it opens the
   * chat tab the first time it is seen, then is not consulted again.
   */
  /*
   * The Chat Settings OVERLAY is not drawn here at all — it floats inside the
   * chat panel (see ChatSettingsPopup). The branch that used to live here drew
   * the page full-bleed in the editor area with no tab row, which is the
   * "maximize, not a tab" complaint; it is a real tab now.
   */
  const chatSettingsOpen = useAiChatSettings((s) => s.buka);
  void chatSettingsOpen;

  /*
   * A layout saved by an older version can still say `aiPanel: 'editor'`.
   *
   * That value used to mean "draw the chat in the editor area", and the drawing
   * is gone — so an upgraded install would be left with the setting and no chat
   * anywhere on screen. Open the real chat tab once and write the setting back
   * to 'right' (the docked column, which is what the tab's panel trail controls
   * anyway), so the reader keeps the chat they had and the stale value does not
   * keep re-triggering. An effect, not a render-time write: setting state while
   * rendering is what `applySettings` would do on its own.
   */
  const migrasiChatEditor = useStore((s) => (s.settings.general.aiPanel ?? 'right') === 'editor');
  const applySettings = useStore((s) => s.applySettings);
  useEffect(() => {
    if (!migrasiChatEditor) return;
    useStore.getState().bukaViewAi('ai-chat');
    void applySettings({ general: { aiPanel: 'right' } } as never);
  }, [migrasiChatEditor, applySettings]);

  if (
    activity === 'tools' ||
    activity === 'devenv' ||
    activity === 'api' ||
    activity === 'sftp' ||
    activity === 'tests'
  ) {
    return (
      <section className="editor-area">
        {/* editor-host is what gives its child the full height (it carries
            flex: 1 + min-height: 0). Without it each view collapsed to its own
            content height: 212px for the API client, 39px for SFTP. */}
        <div className="editor-host">
          <ErrorBoundary nama="Panel">
            <Suspense fallback={null}>
              {/* The rail has one entry for all four; the single-activity
                  branches stay so the palette can still jump straight to one
                  of them without going through the tab strip. */}
              {activity === 'tools' && <ToolsView />}
              {activity === 'devenv' && <DevEnvView />}
              {activity === 'api' && <ApiClientView />}
              {activity === 'sftp' && <SftpView />}
              {activity === 'tests' && <TestsView />}
            </Suspense>
          </ErrorBoundary>
        </div>
      </section>
    );
  }

  if (settingsOpen) {    return (
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
