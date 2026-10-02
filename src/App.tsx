import { useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ActivityBar from './components/shell/ActivityBar';
import Sidebar from './components/shell/Sidebar';
import SplitEditor from './components/shell/SplitEditor';
import Panel from './components/shell/Panel';
import TerminalArea from './components/shell/TerminalArea';
import AiPanel from './components/ai/AiPanel';
import SubAgentInfo from './components/ai/SubAgentInfo';
import StatusBar from './components/shell/StatusBar';
import Toast from './components/notifications/Toast';
import MenuBar from './components/shell/MenuBar';
import LiveRegion from './components/a11y/LiveRegion';

const ClearChatsDialog = lazy(() => import('./components/ai/ClearChatsDialog'));
const ConfirmDialog = lazy(() => import('./components/shell/ConfirmDialog'));
const SaveIssueDialog = lazy(() => import('./components/shell/SaveIssueDialog'));
const NotificationCenter = lazy(() => import('./components/notifications/NotificationCenter'));
const DeleteConfirmDialog = lazy(() => import('./components/explorer/DeleteConfirmDialog'));
const TrustDialog = lazy(() => import('./components/workspace/TrustDialog'));
const UpdateBanner = lazy(() => import('./components/shell/UpdateBanner'));
const DonateDialog = lazy(() => import('./components/shell/DonateDialog'));
const ExtApprovalModal = lazy(() => import('./components/extensions/ExtApprovalModal'));
const KeybindingsEditor = lazy(() => import('./components/shell/KeybindingsEditor'));
const LspOverlay = lazy(() => import('./components/editor/LspOverlay'));
const ScmConfirmDialog = lazy(() => import('./components/scm/ScmConfirmDialog'));
const CommandPalette = lazy(() => import('./components/shell/CommandPalette'));
const McpToast = lazy(() => import('./components/shell/McpToast'));
/*
 * The tool gate floats over the editor, so it mounts here rather than inside
 * the AI panel: it has to survive the panel being resized or hidden, and it
 * needs a z-index above the dock.
 */
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));
/* Same reason as the tool gate: the request log floats over the editor and must
   outlive the AI panel being hidden or resized. */
const DebugPanel = lazy(() => import('./components/ai/DebugPanel'));
const NotesPanel = lazy(() => import('./components/ai/NotesPanel'));
const CrashDialog = lazy(() => import('./components/shell/CrashDialog'));
const LayoutMenu = lazy(() => import('./components/shell/LayoutMenu'));
import { useStore } from './lib/store';
import { useTampilan } from './lib/tampilanStore';
import { useLayoutCustom } from './lib/layoutStore';
import { useExplorer } from './lib/explorerStore';
import { useTerminal } from './lib/terminalStore';
import { useAi } from './lib/aiStore';
import { useGit } from './lib/gitStore';
import { useMcp } from './lib/mcpStore';
import { usePalette } from './lib/paletteStore';
import { useExtensions } from './lib/extensionStore';
import { useSettingsUi } from './lib/settingsStore';
import { useUpdater } from './lib/updaterStore';
import { applyTheme, watchSystemTheme } from './lib/themes';
import { terapkanA11y, umumkan as umumkanA11y } from './lib/a11yStore';
import { muatSemuaEkstensi } from './lib/extLoader';
import { bindTaskListeners, useTasks } from './lib/tasksStore';
import { useHistory } from './lib/historyStore';
import { bindSearchListeners, useSearch } from './lib/searchStore';
import { bindDebugListeners } from './lib/debugStore';
import { bindCliListeners } from './lib/cliStore';
import { bindWorkspaceListeners } from './lib/workspaceStore';
import { pasangPendengarCron } from './lib/cronRunner';
import { usePanel } from './lib/panelStore';
import { useSchedBuka } from './lib/schedStore';
import { bindingMap, eventToBinding } from './lib/shortcuts';
import { useKb } from './lib/keybindingStore';
import { useLsp } from './lib/lspStore';
import { runCommand } from './lib/commandRegistry';
import { notifyWarn } from './lib/notificationStore';
import { cekPengumuman } from './lib/announcements';
import { flushTab, getActiveView } from './lib/editorRegistry';
import { logFrontend, perfMark } from './lib/commands';
import { onAiChunk, onFsChanged, onGhLogin, onGitProgress, onLspEvent, onMcpAction, onMcpConnect, onMcpScreenshot, onPtyExit, onPtyOutput } from './lib/events';
import { writeTo, disposeHandle, retheme } from './lib/xtermRegistry';
import './styles/theme.css';
import './styles/theme-light.css';
import './styles/themes-extra.css';
import './styles/tokens.css';
import './styles/settings.css';
import './styles/ai.css';
import './styles/scm.css';
import './styles/palette.css';
import './styles/panel.css';
import './styles/lsp.css';
import './styles/editor-extras.css';
import './styles/extensions.css';
import './styles/split-editor.css';
import './styles/history.css';
import './styles/debug.css';
import './styles/workspace.css';
import './styles/devenv.css';
import './styles/devupdate.css';
import './styles/api.css';
import './styles/sftp.css';
import './styles/tools.css';
/*
 * Loaded after ai.css (which is imported above with the other early styles) so
 * the compact panel rules win: this file flattens the AI header into one row of
 * icon buttons and reshapes the input into a single rounded field.
 */
import './styles/ai-panel-compact.css';
/*
 * The agent trace sits after the compact panel rules: it restyles the same
 * step rows (one line per action, per-kind accent rail) and has to win.
 */
import './styles/ai-trace.css';
/*
 * ai-tool-cards.css was written but never imported, so every `.w4-status*`
 * rule in it (the status-card styling, ~440 lines) was dead CSS that shipped
 * in the repo and never reached the browser. Same story for ai-work-stack.css,
 * which is the half of the status stack that had no rules at all.
 */
import './styles/ai-tool-cards.css';
import './styles/ai-work-stack.css';
/*
 * Reasoning ("Thinking") block: replaces the auto-opened italic block with one
 * folded row that shows a live shimmer and a timer while tokens arrive.
 */
import './styles/ai-reasoning.css';
/*
 * Streaming states: the thinking dots and the caret that follows the text as it
 * arrives. After ai.css, which styles the same classes for the older shape.
 */
import './styles/ai-streaming.css';
import '@xterm/xterm/css/xterm.css';
import './index.css';
/*
 * Loaded after index.css on purpose: this file restyles `.modal`,
 * `.modal-title` and `.modal-body` for the sub-agent and persona dialogs, and
 * index.css carries the base rules for those same classes. With the import
 * placed before it, every override lost the cascade and the dialogs kept the
 * 18px padding and the muted body text.
 */
import './styles/subagent-custom.css';
import './styles/subagent-view.css';
import './styles/subagent-timeline.css';
import './styles/ai-icons.css';
import './styles/tool-gate.css';
import './styles/ai-debug.css';
import './styles/sched.css';
import './styles/notes-todos.css';
import './styles/model-menu.css';
import './styles/ai-sesi.css';
import './styles/ai-todo-card.css';
import './styles/ai-subagents-menu.css';
import './styles/ai-tanya.css';

import './styles/a11y.css';
import { useT, tx } from './lib/i18n';

let ptyListenersBound = false;
let ptyListenersBinding: Promise<(() => void)[]> | undefined;
let ptyListenersUnlisten: (() => void)[] = [];
let ptyListenerConsumers = 0;

let aiListenerBound = false;
let aiListenerBinding: Promise<(() => void) | undefined> | undefined;
let aiListenerUnlisten: (() => void) | undefined;
let aiListenerConsumers = 0;

let ghListenerBound = false;
let ghListenerUnlisten: (() => void) | undefined;

let mcpListenerBound = false;
let mcpListenerUnlisten: (() => void) | undefined;

/* mcp-screenshot dan mcp-connect dulu hanya menumpang guard mcp-action. Kalau
   listen mcp-action sudah siap, kedua pemasangan ini ikut dilewati; sebaliknya
   saat mcp-action gagal keduanya ikut dipasang ulang. Masing-masing sekarang
   punya guard dan unlisten sendiri supaya tidak saling bergantung. */
let mcpShotListenerBound = false;
let mcpShotListenerUnlisten: (() => void) | undefined;

let mcpConnectListenerBound = false;
let mcpConnectListenerUnlisten: (() => void) | undefined;

let lspListenerBound = false;
let lspListenerUnlisten: (() => void) | undefined;

let cronListenerBound = false;
let cronListenerUnlisten: (() => void) | undefined;

// git-progress dulu menumpang ghListenerBound, jadi kegagalan gh-login ikut
// memutus pemasangan ulang progres git. Guard-nya sekarang berdiri sendiri.
let gitProgressListenerBound = false;
let gitProgressListenerUnlisten: (() => void) | undefined;

// Event jendela (drop/close/focus) TIDAK idempoten: drop ganda membuka path dua
// kali, close ganda menjalankan persist session dua kali. Cleanup effect saja
// tidak cukup karena StrictMode melepas effect sebelum listen() selesai, jadi
// listener kedua tetap terpasang. Guard tingkat modul + unlisten yang disimpan
// memastikan hanya satu listener yang hidup dan benar-benar bisa dilepas.
let dragDropListenerBound = false;
let dragDropListenerUnlisten: (() => void) | undefined;

let closeReqListenerBound = false;
let closeReqListenerUnlisten: (() => void) | undefined;

let focusChgListenerBound = false;
let focusChgListenerUnlisten: (() => void) | undefined;

// Two separate effects subscribe to fs-changed (explorer tree, git refresh).
// Each needs its own guard so StrictMode does not double-bind either one.
let fsListenerBound = false;
let gitFsListenerBound = false;
let gitFsListenerUnlisten: (() => void) | undefined;

let errorHandlersBound = false;

let autoCollapsed = false;

function applyLatestTheme(): void {
  const { settings } = useStore.getState();
  const activeTheme = applyTheme(settings.general, settings.theme, settings.background);
  useStore.setState({ activeTheme });
}

async function cekUpdateStartup() {
  try {
    const s = useStore.getState();
    if (!s.settings.general?.checkUpdates) return;
    const u = useUpdater.getState();
    if (u.status === 'idle') await u.check({ senyap: true });
  } catch {
    /* silent */
  }
}

export default function App() {
  const tr = useT();
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const sidebarHeight = useStore((s) => s.sidebarHeight);
  const pos = useStore((s) => s.settings.sidebar) ?? 'left';
  const activity = useStore((s) => s.activity);

  const zen = useTampilan((s) => s.mode === 'zen');

  const L = useLayoutCustom();

  const layoutDimuat = useRef(false);
  useEffect(() => {
    if (layoutDimuat.current) return;
    layoutDimuat.current = true;
    void useLayoutCustom.getState().muat();
  }, []);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const setSidebarHeight = useStore((s) => s.setSidebarHeight);
  const bootstrap = useStore((s) => s.bootstrap);
  const terminalMaximized = useTerminal((s) => s.maximized);
  const panelBawahVisible = useTerminal((s) => s.visible);
  const aiPanelPos = useStore((s) => s.settings.general.aiPanel ?? 'bottom');
  const subKanan = useLayoutCustom((s) => s.subKanan);
  const aiWidth = useStore((s) => s.aiWidth);
  const aiMax = useStore((s) => s.aiMax);
  const setAiWidth = useStore((s) => s.setAiWidth);
  const layoutTerminal = useStore((s) => s.settings.general.layout === 'terminal');

  const aiKanan = aiPanelPos === 'right';

  useEffect(() => {
    if (layoutTerminal && !panelBawahVisible) useTerminal.getState().setVisible(true);
  }, [layoutTerminal, panelBawahVisible]);

  const dragging = useRef(false);

  /*
   * ActivityBar owns the sidebar state, while AI lives in the independent
   * bottom-panel store. Remember whether the clicked surface was open before
   * ActivityBar updates its own state, then apply one unambiguous toggle after
   * its click handler has run. This also repairs stale states such as
   * `activity === 'settings'` with the settings editor already closed.
   */
  const activityToggleIntent = useRef<{ id: 'ai' | 'settings'; wasOpen: boolean } | null>(null);
  const rememberActivityToggle = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-activity]')?.dataset.activity;
    if (id === 'ai') {
      const terminal = useTerminal.getState();
      activityToggleIntent.current = {
        id,
        wasOpen: terminal.visible && usePanel.getState().activeTab === 'ai',
      };
    } else if (id === 'settings') {
      activityToggleIntent.current = { id, wasOpen: useStore.getState().settingsOpen };
    } else {
      activityToggleIntent.current = null;
    }
  }, []);
  const applyActivityToggle = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-activity]')?.dataset.activity;
    const intent = activityToggleIntent.current;
    activityToggleIntent.current = null;
    if (!intent || intent.id !== id) return;

    const store = useStore.getState();
    if (intent.id === 'ai') {
      store.setSettingsOpen(false);
      store.setActivity('ai');
      if (intent.wasOpen) {
        useTerminal.getState().setVisible(false);
      } else {
        store.setSidebarVisible(true);
        usePanel.getState().focusTab('ai');
      }
      return;
    }

    const open = !intent.wasOpen;
    store.setSettingsOpen(open);
    store.setSidebarVisible(open);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (useStore.getState().settingsLoaded) {
      void cekPengumuman();
      void cekUpdateStartup();
      return;
    }
    const unsub = useStore.subscribe((s, prev) => {
      if (!prev.settingsLoaded && s.settingsLoaded) {
        void cekPengumuman();
        void cekUpdateStartup();
        const l = s.settings.layout;
        if (l && l !== 'default') {
          void s.applyLayout(l);
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const s = useStore.getState();
      const p = s.settings.sidebar ?? 'left';

      if (p === 'top' || p === 'bottom') {
        const rect = document
          .querySelector<HTMLElement>('.app-body-col')
          ?.getBoundingClientRect();
        if (!rect) return;
        const h = p === 'top' ? e.clientY - rect.top - 48 : rect.bottom - e.clientY - 48;
        setSidebarHeight(h);
        return;
      }

      setSidebarWidth(p === 'right' ? window.innerWidth - e.clientX - 48 : e.clientX - 48);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('is-resizing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setSidebarWidth]);

  const startResize = useCallback(() => {
    dragging.current = true;
    document.body.classList.add('is-resizing');
  }, []);

  const dragAi = useRef(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragAi.current) return;
      setAiWidth(window.innerWidth - e.clientX);
    };
    const onUp = () => {
      if (!dragAi.current) return;
      dragAi.current = false;
      document.body.classList.remove('is-resizing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setAiWidth]);

  const startDragAi = useCallback(() => {
    dragAi.current = true;
    document.body.classList.add('is-resizing');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {

      if (useSettingsUi.getState().capturing) return;

      if (usePalette.getState().open) {
        const b = eventToBinding(e);
        const id = b ? bindingMap(useStore.getState().settings.shortcuts).get(b) : null;
        if (id === 'view.palette' || id === 'view.quickOpen') {
          e.preventDefault();
          void usePalette
            .getState()
            .openPalette(id === 'view.palette' ? 'command' : 'file');
        }
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return;

      const hitKb = useKb.getState().resolve(binding);
      if (hitKb) return;

      const s = useStore.getState();
      const actionId = bindingMap(s.settings.shortcuts).get(binding);
      if (!actionId) return;

      const t = useTerminal.getState();
      const g = s.settings.general;

      switch (actionId) {
        case 'file.new':
          s.newUntitled();
          break;
        case 'file.open':
          void s.openFileDialog();
          break;
        case 'file.openFolder':
          void s.openFolderDialog();
          break;
        case 'file.save':
          if (!s.activeTabId) return;
          flushTab(s.activeTabId);
          void s.saveTab(s.activeTabId);
          break;
        case 'file.saveAs':
          if (!s.activeTabId) return;
          flushTab(s.activeTabId);
          void s.saveTabAs(s.activeTabId);
          break;
        case 'file.closeTab':
          if (s.activeTabId) s.requestCloseTab(s.activeTabId);
          break;
        case 'edit.find':
          s.setFindOpen(true);
          break;
        case 'edit.findInFiles':
          s.setSettingsOpen(false);
          s.setActivity('search');
          if (!s.sidebarVisible) s.toggleSidebar();
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('.search-input')?.focus();
          }, 60);
          break;

        case 'edit.replaceInFiles':
          s.setSettingsOpen(false);
          s.setActivity('search');
          if (!s.sidebarVisible) s.toggleSidebar();
          useSearch.getState().setReplaceTerbuka(true);
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('.search-input')?.focus();
          }, 60);
          break;
        case 'edit.nextMatch':
          void useSearch.getState().lompat(1);
          break;
        case 'edit.prevMatch':
          void useSearch.getState().lompat(-1);
          break;
        case 'view.sidebar':
          s.toggleSidebar();
          break;
        case 'view.panel':

          if (t.allPanes().length === 0 && !t.visible) void t.addPane('shell');
          else t.toggleVisible();
          break;
        case 'view.subagents':

          usePanel.getState().focusTab('subagents');
          if (!t.visible) t.setVisible(true);
          break;
        case 'view.notes':
          /* Toggle: the same key closes the panel it opened. */
          useSchedBuka.getState().toggle();
          break;
        case 'view.palette':
          void usePalette.getState().openPalette('command');
          break;
        case 'view.quickOpen':
          void usePalette.getState().openPalette('file');
          break;
        case 'view.nextTab':
          s.cycleTab(1);
          break;
        case 'view.prevTab':
          s.cycleTab(-1);
          break;
        case 'view.explorer':
          s.setSettingsOpen(false);
          s.setActivity('explorer');
          if (!s.sidebarVisible) s.toggleSidebar();
          break;
        case 'view.settings':
          s.setActivity('settings');
          s.setSettingsOpen(true);
          break;
        case 'view.zoomIn':
          void s.applySettings({ general: { zoom: Math.min(200, g.zoom + 10) } });
          break;
        case 'view.zoomOut':
          void s.applySettings({ general: { zoom: Math.max(50, g.zoom - 10) } });
          break;
        case 'view.zoomReset':
          void s.applySettings({ general: { zoom: 100 } });
          break;
        case 'terminal.toggle':
          if (t.allPanes().length === 0) void t.addPane('shell');
          else t.toggleVisible();
          break;
        case 'terminal.new':
          void t.addPane('shell');
          break;
        case 'terminal.newPane':
          void t.addPane('shell');
          break;

        case 'ai.panel': {

          s.setSettingsOpen(false);
          s.setActivity('ai');
          if (!s.sidebarVisible) s.toggleSidebar();

          const P = usePanel.getState();
          if (t.visible && P.activeTab === 'ai') t.setVisible(false);
          else {
            t.setVisible(true);
            P.focusTab('ai');
          }
          break;
        }
        case 'ai.send':
          void useAi.getState().send();
          break;
        case 'git.panel':
          s.setSettingsOpen(false);
          s.setActivity('scm');
          if (!s.sidebarVisible) s.toggleSidebar();
          break;

        case 'tasks.build':
          usePanel.getState().focusTab('output');
          void useTasks.getState().jalankanBuild();
          break;
        case 'tasks.run':
          window.dispatchEvent(
            new CustomEvent('zephyr-palette-open', { detail: { query: 'Task: ' } }),
          );
          break;
        case 'tasks.terminate':
          void useTasks.getState().hentikanSemua();
          break;
        default:
          return; // action belum punya implementasi -> jangan telan event
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey || e.key !== '`') return;
      e.preventDefault();
      const t = useTerminal.getState();
      if (!t.visible) t.setVisible(true);
      t.toggleMaximized();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'i') return;

      if ((e.target as HTMLElement | null)?.closest?.('.zephyr-cm-host')) return;
      e.preventDefault();
      const s = useStore.getState();
      const t = useTerminal.getState();
      s.setSettingsOpen(false);
      t.setVisible(true);
      usePanel.getState().focusTab('ai');

      window.setTimeout(() => window.dispatchEvent(new Event('zephyr-ai-focus')), 80);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    void useKb.getState().load();

    /*
     * Keep the keybinding table in step with settings.json.
     *
     * The Settings page writes remaps to settings.shortcuts, while this store
     * builds its chord table from keybindings.json plus settings at load time.
     * Without this subscription a remap made from Settings never reached the
     * table, so the old chord stayed live and the new one did nothing until
     * the app was restarted.
     */
    const unsub = useStore.subscribe((state, prev) => {
      if (state.settings.shortcuts !== prev.settings.shortcuts) {
        useKb.getState().syncDariSettings();
      }
    });

    const onKey = (e: KeyboardEvent) => {

      if (useSettingsUi.getState().capturing) return;
      if (useKb.getState().editorOpen && document.querySelector('[data-testid="kb-recording"]')) {
        return;
      }

      const chord = eventToBinding(e);
      if (!chord) return;

      const kb = useKb.getState();
      const pending = kb.pending;
      const seq = pending ? `${pending} ${chord}` : chord;

      if (pending && e.key === 'Escape') {
        e.preventDefault();
        kb.setPending('');
        useStore.getState().setStatus('');
        return;
      }

      if (!pending && kb.isPrefix(chord)) {
        e.preventDefault();

        e.stopImmediatePropagation();
        kb.setPending(chord);
        useStore.getState().setStatus(`${chord} - waiting for the next key…`);
        return;
      }

      const hit = kb.resolve(seq);
      if (pending) kb.setPending('');

      if (!hit) {
        if (pending) useStore.getState().setStatus('');
        return;
      }

      const el = document.activeElement;
      const diEditor = !!el?.closest('.zephyr-cm-host');
      const diTerminal = !!el?.closest('.xterm');
      if (hit.layer === 'editor' && diEditor) return;
      if (hit.layer === 'terminal' && diTerminal) return;

      const diInput =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (diInput && !e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      kb.setLastRun(hit.command);

      if (hit.layer === 'stub') {

        notifyWarn(`${hit.label ?? hit.command} is not available in this version`, {
          source: 'keybinding',
        });
        useStore.getState().setStatus('');
        return;
      }

      useStore.getState().setStatus('');
      void runCommand(hit.command).then((ok) => {
        if (!ok) {
          notifyWarn(`Command ${hit.command} is not registered`, { source: 'keybinding' });
        }
      });
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  useEffect(() => {
    const perbarui = () => {
      const el = document.activeElement;
      const kb = useKb.getState();
      kb.setCtx('editorFocus', !!el?.closest('.zephyr-cm-host'));
      kb.setCtx('terminalFocus', !!el?.closest('.xterm'));
    };
    window.addEventListener('focusin', perbarui);
    window.addEventListener('click', perbarui);
    perbarui();
    return () => {
      window.removeEventListener('focusin', perbarui);
      window.removeEventListener('click', perbarui);
    };
  }, []);

  useEffect(() => {
    if (lspListenerBound) return;

    // Bentuk guardnya sama seperti pty: flag baru di-set setelah listen() benar-benar sukses,
    // supaya satu kegagalan sesaat tidak mematikan LSP selama-lamanya.
    onLspEvent((ev) => useLsp.getState().onEvent(ev))
      .then((un) => {
        lspListenerUnlisten = un;
        lspListenerBound = true;
      })
      .catch((e) => {
        lspListenerBound = false;
        console.error('gagal memasang listener lsp-event', e);
      });

    const timer = window.setInterval(() => {
      void useLsp.getState().reap();
    }, 30_000);

    return () => {
      lspListenerUnlisten?.();
      lspListenerUnlisten = undefined;
      window.clearInterval(timer);
      lspListenerBound = false;
    };
  }, []);

  useEffect(() => {
    if (dragDropListenerBound) return;
    dragDropListenerBound = true;

    try {
      getCurrentWindow()
        .onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return;
          const s = useStore.getState();
          for (const p of event.payload.paths) {
            try {
              await s.openPath(p);
            } catch {
              s.setStatus(`Could not open: ${p}`);
            }
          }
        })
        .then((un) => {
          dragDropListenerUnlisten = un;
        })
        .catch(() => {
          /* outside Tauri (browser dev) this event does not exist */
          dragDropListenerBound = false;
        });
    } catch {
      /* non-Tauri */
      dragDropListenerBound = false;
    }
    return () => {
      // Drop ganda membuka setiap path dua kali, jadi unlisten-nya dipegang di
      // module scope dan hanya dipasang sekali untuk seluruh umur proses.
      dragDropListenerUnlisten?.();
      dragDropListenerUnlisten = undefined;
      dragDropListenerBound = false;
    };
  }, []);

  useEffect(() => {
    if (closeReqListenerBound) return;
    closeReqListenerBound = true;

    try {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          const s = useStore.getState();
          flushTab(s.activeTabId);
          await s.persistSession();
          if (!useStore.getState().requestCloseWindow()) {
            event.preventDefault();
          }
        })
        .then((un) => {
          closeReqListenerUnlisten = un;
        })
        .catch(() => {
          /* non-Tauri */
          closeReqListenerBound = false;
        });
    } catch {
      /* non-Tauri */
      closeReqListenerBound = false;
    }
    return () => {
      // Close ganda menjalankan persistSession dua kali dan bisa menutup jendela
      // padahal handler sudah membatalkannya.
      closeReqListenerUnlisten?.();
      closeReqListenerUnlisten = undefined;
      closeReqListenerBound = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const set = (idle: boolean) => {
      if (idle) root.dataset.idle = '1';
      else delete root.dataset.idle;
    };
    const onVis = () => set(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    onVis();

    if (!focusChgListenerBound) {
      focusChgListenerBound = true;
      try {
        void getCurrentWindow()
          .onFocusChanged(({ payload: fokus }) => set(!fokus || document.hidden))
          .then((un) => {
            focusChgListenerUnlisten = un;
          })
          .catch(() => {
            /* non-Tauri */
            focusChgListenerBound = false;
          });
      } catch {
        /* non-Tauri */
        focusChgListenerBound = false;
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      // Two mounts would leave two focus listeners toggling data-idle, so the
      // unlisten lives in module scope and the mount is guarded.
      focusChgListenerUnlisten?.();
      focusChgListenerUnlisten = undefined;
      focusChgListenerBound = false;
      delete root.dataset.idle;
    };
  }, []);

  useEffect(() => {
    // StrictMode mounts this twice; without a module guard every filesystem
    // change refreshes the explorer and git twice. Same pattern as the
    // pty/lsp/ai listeners above.
    if (fsListenerBound) return;
    fsListenerBound = true;
    let unlisten: (() => void) | undefined;
    onFsChanged(({ dir, path, kind }) => {
      const ex = useExplorer.getState();
      void ex.refreshDir(dir);

      if (kind === 'modify') {
        const tab = useStore
          .getState()
          .tabs.find((t) => t.path?.toLowerCase() === path.toLowerCase());
        if (tab && !tab.unsaved) void useStore.getState().reloadTabFromDisk(path);
      }
    })
      .then((un) => {
        unlisten = un;
      })
      .catch(() => {
        /* non-Tauri */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    void useTerminal.getState().loadShells();
    void useTerminal.getState().loadAgents();

    ptyListenerConsumers++;
    if (!ptyListenersBound && !ptyListenersBinding) {
      ptyListenersBinding = Promise.all([
        onPtyOutput((id, data) => writeTo(id, data)),
        onPtyExit((id, code) => {
          useTerminal.getState().markExited(id, code);
          const p = useTerminal.getState().findPane(id);

          if (p && p.kind !== 'private') {
            const label = code === null || code === undefined ? 'exited' : `exited code ${code}`;
            writeTo(id, `\r\n\x1b[90m[process ${label}]\x1b[0m\r\n`);
          }

          if (p?.kind === 'private') disposeHandle(id);
        }),
      ])
        .then((unlisteners) => {
          ptyListenersUnlisten = unlisteners;
          // Set the process-wide guard only after both listen() calls succeed.
          ptyListenersBound = true;
          if (ptyListenerConsumers === 0) {
            for (const unlisten of unlisteners) unlisten();
            ptyListenersUnlisten = [];
            ptyListenersBound = false;
            ptyListenersBinding = undefined;
          }
          return unlisteners;
        })
        .catch((): (() => void)[] => {
          ptyListenersBound = false;
          ptyListenersBinding = undefined;
          ptyListenersUnlisten = [];
          // A later mount may retry after a transient listen failure.
          return [];
        });
    }
    return () => {
      ptyListenerConsumers--;
      if (ptyListenerConsumers === 0 && ptyListenersBound) {
        for (const unlisten of ptyListenersUnlisten) unlisten();
        ptyListenersUnlisten = [];
        ptyListenersBound = false;
        ptyListenersBinding = undefined;
      }
    };
  }, []);

  useEffect(() => {
    void useAi.getState().init();
    aiListenerConsumers++;
    if (!aiListenerBound && !aiListenerBinding) {
      aiListenerBinding = onAiChunk((c) => useAi.getState().onChunk(c))
        .then((un) => {
          aiListenerUnlisten = un;
          aiListenerBound = true;
          aiListenerBinding = undefined;
          return un;
        })
        .catch((e) => {
          aiListenerBound = false;
          aiListenerBinding = undefined;
          console.error('gagal memasang listener ai-chunk', e);
          return undefined;
        });
    }
    return () => {
      aiListenerConsumers--;
      if (aiListenerConsumers === 0) {
        aiListenerUnlisten?.();
        aiListenerUnlisten = undefined;
        aiListenerBound = false;
        aiListenerBinding = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (cronListenerBound) return;
    void pasangPendengarCron().then((un) => {
      // pasangPendengarCron sendiri sudah melepas guard-nya saat listen() gagal,
      // jadi di sini cukup simpan unlisten untuk pembersihan.
      cronListenerUnlisten = un;
      cronListenerBound = true;
    });
    return () => {
      cronListenerUnlisten?.();
      cronListenerUnlisten = undefined;
      cronListenerBound = false;
    };
  }, []);

  useEffect(() => {
    bindTaskListeners();

    bindSearchListeners();

    bindDebugListeners();

    void bindCliListeners();

    void bindWorkspaceListeners();

    const T = () => useTasks.getState();
    if (useStore.getState().workspace) void T().muat();
    return useStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace && s.workspace) void T().muat();
    });
  }, []);

  useEffect(() => {
    void useGit.getState().init();
    if (ghListenerBound) return;

    // Sama seperti pty: jangan klaim guard sebelum listen() sukses, kalau gagal
    // lepas lagi supaya mount berikutnya masih bisa mencoba.
    onGhLogin((e) => useGit.getState().onGhLogin(e))
      .then((un) => {
        ghListenerUnlisten = un;
        ghListenerBound = true;
      })
      .catch((e) => {
        ghListenerBound = false;
        console.error('gagal memasang listener gh-login', e);
      });

    return () => {
      ghListenerUnlisten?.();
      ghListenerUnlisten = undefined;
      ghListenerBound = false;
    };
  }, []);

  useEffect(() => {
    // git-progress dulu menumpang guard gh-login; sekarang punya guard sendiri
    // supaya kedua listener tidak saling memutus saat salah satunya gagal.
    if (gitProgressListenerBound) return;
    gitProgressListenerBound = true;

    onGitProgress((p) => useGit.getState().setProgress(p))
      .then((un) => {
        gitProgressListenerUnlisten = un;
      })
      .catch((e) => {
        gitProgressListenerBound = false;
        console.error('gagal memasang listener git-progress', e);
      });

    return () => {
      gitProgressListenerUnlisten?.();
      gitProgressListenerUnlisten = undefined;
      gitProgressListenerBound = false;
    };
  }, []);

  useEffect(() => {
    const timer = { id: undefined as number | undefined };
    const bump = () => {
      window.clearTimeout(timer.id);
      timer.id = window.setTimeout(() => void useGit.getState().refresh(), 250);
    };

    // Guard-nya harus DICEK, bukan cuma di-set: kalau hanya ditandai, mount kedua
    // dari StrictMode tetap memasang listener kedua, jadi setiap perubahan berkas
    // menjalankan refresh git dua kali.
    if (!gitFsListenerBound) {
      gitFsListenerBound = true;
      onFsChanged(bump)
        .then((un) => {
          gitFsListenerUnlisten = un;
        })
        .catch(() => {
          /* non-Tauri */
          gitFsListenerBound = false;
        });
    }

    const unsub = useStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace) void useGit.getState().init();

      if (s.tabs !== prev.tabs) bump();
    });
    return () => {
      window.clearTimeout(timer.id);
      gitFsListenerUnlisten?.();
      gitFsListenerUnlisten = undefined;
      gitFsListenerBound = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    void useMcp.getState().init();

    if (!mcpListenerBound) {
      // Guard-nya di-set setelah listen() utama sukses (pola pty), supaya kegagalan
      // sesaat tidak membuat MCP mati permanen di proses ini.
      onMcpAction((a) => void useMcp.getState().handleAction(a))
        .then((un) => {
          mcpListenerUnlisten = un;
          mcpListenerBound = true;
          void import('./lib/commands').then((c) => c.mcpUiReady().catch(() => {}));
        })
        .catch((e) => {
          mcpListenerBound = false;
          console.error('gagal memasang listener mcp-action', e);
        });
    }

    if (!mcpShotListenerBound) {
      mcpShotListenerBound = true;
      // Dulu unlisten-nya dibuang dengan void, jadi satu tombol screenshot tercatat
      // dua kali di log MCP setelah StrictMode memasang listener kedua.
      onMcpScreenshot(({ paneId, path }) => {
        const m = useMcp.getState();
        m.setToast(`AI CLI captured a screenshot of pane ${paneId.slice(-6)}`);
        m.pushLog(`screenshot_pane ${paneId.slice(-6)} → ${path.split(/[\\/]/).pop()}`, 'action');
        useMcp.setState({ lastShot: path, mcpInfo: `Screenshot pane ${paneId} → ${path}` });
      })
        .then((un) => {
          mcpShotListenerUnlisten = un;
        })
        .catch((e) => {
          mcpShotListenerBound = false;
          console.error('gagal memasang listener mcp-screenshot', e);
        });
    }

    if (!mcpConnectListenerBound) {
      mcpConnectListenerBound = true;
      // Sama: satu koneksi klien MCP akan muncul dua kali di log tanpa guard ini.
      onMcpConnect(({ client }) => {
        useMcp.getState().pushLog(`MCP connected: ${client}`, 'connect');
      })
        .then((un) => {
          mcpConnectListenerUnlisten = un;
        })
        .catch((e) => {
          mcpConnectListenerBound = false;
          console.error('gagal memasang listener mcp-connect', e);
        });
    }

    return () => {
      mcpListenerUnlisten?.();
      mcpListenerUnlisten = undefined;
      mcpListenerBound = false;

      mcpShotListenerUnlisten?.();
      mcpShotListenerUnlisten = undefined;
      mcpShotListenerBound = false;

      mcpConnectListenerUnlisten?.();
      mcpConnectListenerUnlisten = undefined;
      mcpConnectListenerBound = false;
    };
  }, []);

  useEffect(() => {
    void useExtensions.getState().refresh();

    void muatSemuaEkstensi().then(() => {
      applyLatestTheme();
      const s = useStore.getState();
      terapkanA11y(s.settings.accessibility); // fase 31
    });

    const openPalette = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string }>).detail?.query;
      void usePalette
        .getState()
        .openPalette('command')
        .then(() => {
          if (q) usePalette.getState().setQuery(q);
        });
    };
    window.addEventListener('zephyr-palette-open', openPalette);

    const openQuick = () => void usePalette.getState().openPalette('file');
    window.addEventListener('zephyr-quickopen', openQuick);

    const onSnapshot = (e: Event) => {
      const d = (e as CustomEvent<{ path?: string; reason?: string }>).detail;
      if (!d?.path) return;
      void useHistory
        .getState()
        .snapshotSave(d.path, (d.reason as 'save' | 'manual') ?? 'save');
    };
    window.addEventListener('zephyr-history-snapshot', onSnapshot);

    const stopWatch = watchSystemTheme(() => {
      const s = useStore.getState();
      if (s.settings.general.theme !== 'system') return;

      applyLatestTheme();
      terapkanA11y(useStore.getState().settings.accessibility);
      retheme();
    });

    return () => {
      window.removeEventListener('zephyr-palette-open', openPalette);
      window.removeEventListener('zephyr-quickopen', openQuick);
      window.removeEventListener('zephyr-history-snapshot', onSnapshot);
      stopWatch();
    };
  }, []);

  useEffect(() => {
    const NARROW = 1000;
    const apply = () => {
      const narrow = window.innerWidth < NARROW;
      document.body.classList.toggle('is-narrow', narrow);
      const s = useStore.getState();
      if (narrow && s.sidebarVisible) {
        autoCollapsed = true;
        s.toggleSidebar();
      } else if (!narrow && autoCollapsed && !s.sidebarVisible) {
        autoCollapsed = false;
        s.toggleSidebar();
      } else if (!narrow) {
        autoCollapsed = false;
      }
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  useEffect(() => {
    if (errorHandlersBound) return;
    errorHandlersBound = true;

    const lapor = (level: 'error' | 'warn', text: string) => {
      void logFrontend(level, text).catch(() => {
        /* Rust not available (browser mode), leave it */
      });
      useStore.getState().setStatus('An error occurred; see the log');
    };

    const onErr = (e: ErrorEvent) => {
      lapor('error', `onerror: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const text =
        r instanceof Error ? `${r.message}\n${r.stack ?? ''}` : JSON.stringify(r ?? null);
      lapor('error', `unhandledrejection: ${text}`);
    };

    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);

    void perfMark('ui-ready', Math.round(performance.now())).catch(() => {
      /* non-Tauri */
    });
  }, []);

  return (
    <div
      className="app-root"
      onClickCapture={rememberActivityToggle}
      onClick={applyActivityToggle}
    >
      {/* FASE 31: skip link - elemen fokusabel PERTAMA di app.
          Without it a keyboard user has to tab past ~20 ActivityBar buttons + the
          Sidebar before reaching the editor, every single time. It is a <button> and not
          an <a href="#..."> because the editor is not an anchor target and CodeMirror
          butuh .focus() nyata, bukan perpindahan hash. */}
      <button
        className="a11y-skip"
        data-testid="a11y-skip"
        onClick={() => {
          const v = getActiveView();
          if (v) {
            v.focus();
            umumkanA11y('Focus in editor.');
          } else {
            umumkanA11y('No file is open.', 'assertive');
          }
        }}
      >
        {tr('win.skipToEditor')}
      </button>
      {L.menuBar && <MenuBar />}
      <Suspense fallback={null}>
        <UpdateBanner />
        <DonateDialog />
      </Suspense>
      <div className={`app-body sidebar-pos-${pos}${zen ? ' is-zen' : ''}${L.kerapatan === 'compact' ? ' is-compact' : ''}`}>
        {/* ActivityBar IKUT PINDAH mengikuti posisi panel:
            - left/right : vertical on the panel side (right = flipped by CSS)
            - top/bottom : horizontal on the top/bottom edge (CSS)
            The DOM order is kept fixed as [ActivityBar, sidebar?, main, …] so that
            flex-direction row-reverse/column from sidebar-pos-* works. */}
        <div className="app-body-col">
          {pos !== 'bottom' && L.activityBar && <ActivityBar />}

          {/* Posisi ATAS: panel di atas editor, divider horizontal. */}
          {pos === 'top' && sidebarVisible && L.sidebar && (
            <>
              <aside
                className="sidebar sidebar-h"
                style={{ height: sidebarHeight }}
                aria-label="Sidebar"
              >
                <Sidebar />
              </aside>
              <div
                className="resizer resizer-h"
                role="separator"
                aria-orientation="horizontal"
                aria-label={tr('Resize panel height')}
                onPointerDown={startResize}
              />
            </>
          )}

          {/* Posisi KIRI/KANAN: panel di samping editor, divider vertikal.
              Dev Environment, API Client and SFTP use the full width, so their
              sidebar (whose contents are null for those activities) does not need
              mengambil ruang sama sekali. */}
          {(pos === 'left' || pos === 'right') &&
            sidebarVisible &&
            L.sidebar &&
            !['tools', 'devenv', 'api', 'sftp', 'tests'].includes(activity) && (
            <>
              <aside className="sidebar" style={{ width: sidebarWidth }} aria-label="Sidebar">
                <Sidebar />
              </aside>
              <div
                className="resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={tr('Resize sidebar width')}
                onPointerDown={startResize}
              />
            </>
          )}

          <main className={`main-area${terminalMaximized ? ' term-maximized' : ''}`}>
            {/* C-19: layout terminal-first ala Terax - terminal jadi area
                area, the editor sticks as a pane on the right. The default stays
                editor-first so the old behaviour does not change. */}
            {layoutTerminal ? (
              <div className="term-first" data-testid="term-first">
                <section className="term-first-term" aria-label="Main terminal">
                  <TerminalArea />
                </section>
                <aside className="term-first-editor" aria-label="Editor">
                  <SplitEditor />
                </aside>
              </div>
            ) : (
              <>
                <SplitEditor />
                <Panel />
              </>
            )}
          </main>

          {/* A-10: panel AI sebagai kolom kanan 340px ala VS Code, bukan dock
              dock level with the terminal. Rendered ONLY when dock = 'ai' so the
              editor width does not shrink while the user is in the terminal. */}
          {/* AI column resizer: draggable like the sidebar. Previously the width
              340px WAS FIXED - the user asked for "bisa di lebarkan" (make it wider). */}
          {aiKanan && !aiMax && (
            <div
              className="resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label={tr('Resize AI panel width')}
              data-testid="ai-resizer"
              onPointerDown={startDragAi}
            />
          )}
          {aiKanan && (
            <aside
              className={`ai-side-col${aiMax ? ' is-max' : ''}`}
              data-testid="ai-side-col"
              data-lebar={aiMax ? 'max' : String(aiWidth)}
              style={
                aiMax
                  ? undefined
                  : ({
                      flex: `0 0 ${aiWidth}px`,
                      width: aiWidth,

                      '--ai-w': `${aiWidth}px`,
                    } as React.CSSProperties)
              }
              aria-label={tx('AI panel')}
            >
              {/* The row: chat on the left, the subagent info panel on the right. This wrapper is
                  MANDATORY - without it .ai-side-col (flex column) puts the info
                  info di BAWAH chat, bukan di sampingnya. */}
              <div className="ai-side-row">
                <AiPanel />
                {/* T4.1b: panel INFO subagent di sebelah kanan chat. Ditaruh
                    inside the AI column so it only appears when the chat is
                    actually showing - otherwise it hangs there with no context. */}
                {subKanan && <SubAgentInfo />}
              </div>
            </aside>
          )}

          {/* Posisi BAWAH: divider horizontal + panel di bawah editor. */}
          {pos === 'bottom' && sidebarVisible && L.sidebar && (
            <>
              <div
                className="resizer resizer-h"
                role="separator"
                aria-orientation="horizontal"
                aria-label={tr('Resize panel height')}
                onPointerDown={startResize}
              />
              <aside
                className="sidebar sidebar-h"
                style={{ height: sidebarHeight }}
                aria-label="Sidebar"
              >
                <Sidebar />
              </aside>
            </>
          )}

          {pos === 'bottom' && L.activityBar && <ActivityBar />}
        </div>
      </div>

      {L.statusBar && <StatusBar />}

      {/* Panel Customize Layout dirender di SINI (bukan di dalam MenuBar).
          If it were inside the MenuBar, turning the Menu Bar off would remove
          the only button available to turn it back on.

          It MUST stay inside a Suspense boundary: it is a lazy() component, and
          a lazy component that suspends while React is processing a sync update
          (a click that flips menuBuka) tears the whole tree down with "A
          component suspended while responding to synchronous input". In dev the
          chunk is already warm from an earlier load, so the bug only shows on a
          fresh install — where the first click killed the app. */}
      <Suspense fallback={null}>
        {L.menuBuka && <LayoutMenu onTutup={() => L.setMenuBuka(false)} />}
      </Suspense>
      <Suspense fallback={null}>
        <ConfirmDialog />
        <SaveIssueDialog />
        <ScmConfirmDialog />
        <CommandPalette />
        <McpToast />
        <ToolGatePanel />
        <DebugPanel />
        <NotesPanel />
        <CrashDialog />
        <NotificationCenter />
        <DeleteConfirmDialog />
        <ClearChatsDialog />
        <TrustDialog />
        {/* Extension external-runtime permissions - global, they can appear at any
            time because execution can be requested from any worker. */}
        <ExtApprovalModal />
        <KeybindingsEditor />
        <LspOverlay />
      </Suspense>
      <Toast />
      {/* phase 31: the a11y live region. Rendered LAST so it does not slip in
          between landmarks and does not disturb the Tab order (it is not focusable). */}
      <LiveRegion />
    </div>
  );
}
