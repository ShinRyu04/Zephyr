import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ActivityBar from './components/shell/ActivityBar';
import Sidebar from './components/shell/Sidebar';
import SplitEditor from './components/shell/SplitEditor';
import Panel from './components/shell/Panel';
import TerminalArea from './components/shell/TerminalArea';
import AiPanel from './components/ai/AiPanel';
import SubAgentInfo from './components/ai/SubAgentInfo';
import ClearChatsDialog from './components/ai/ClearChatsDialog';
import StatusBar from './components/shell/StatusBar';
import ConfirmDialog from './components/shell/ConfirmDialog';
import SaveIssueDialog from './components/shell/SaveIssueDialog';
import Toast from './components/notifications/Toast';
import NotificationCenter from './components/notifications/NotificationCenter';
import DeleteConfirmDialog from './components/explorer/DeleteConfirmDialog';
import TrustDialog from './components/workspace/TrustDialog';
import MenuBar from './components/shell/MenuBar';
import UpdateBanner from './components/shell/UpdateBanner';
import DonateDialog from './components/shell/DonateDialog';
import ExtApprovalModal from './components/extensions/ExtApprovalModal';
import KeybindingsEditor from './components/shell/KeybindingsEditor';
import LspOverlay from './components/editor/LspOverlay';
import ScmConfirmDialog from './components/scm/ScmConfirmDialog';
import CommandPalette from './components/shell/CommandPalette';
import McpToast from './components/shell/McpToast';
import CrashDialog from './components/shell/CrashDialog';
import { useStore } from './lib/store';
import { useTampilan } from './lib/tampilanStore';
import { useLayoutCustom } from './lib/layoutStore';
import LayoutMenu from './components/shell/LayoutMenu';
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
import LiveRegion from './components/a11y/LiveRegion';
import { muatSemuaEkstensi } from './lib/extLoader';
import { bindTaskListeners, useTasks } from './lib/tasksStore';
import { useHistory } from './lib/historyStore';
import { bindSearchListeners, useSearch } from './lib/searchStore';
import { bindDebugListeners } from './lib/debugStore';
import { bindCliListeners } from './lib/cliStore';
import { bindWorkspaceListeners } from './lib/workspaceStore';
import { usePanel } from './lib/panelStore';
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
import '@xterm/xterm/css/xterm.css';
import './index.css';

import './styles/a11y.css';
import { useT } from './lib/i18n';

let ptyListenersBound = false;

let aiListenerBound = false;

let ghListenerBound = false;

let mcpListenerBound = false;

let lspListenerBound = false;

let errorHandlersBound = false;

let autoCollapsed = false;

async function cekUpdateStartup() {
  try {
    const s = useStore.getState();
    if (!s.settings.general?.checkUpdates) return;
    const u = useUpdater.getState();
    if (u.status === 'idle') await u.check({ senyap: true });
  } catch {
    /* diam */
  }
}

export default function App() {
  const tr = useT();
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const sidebarHeight = useStore((s) => s.sidebarHeight);
  const pos = useStore((s) => s.settings.sidebar) ?? 'left';

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
        useStore.getState().setStatus(`${chord} — menunggu tombol berikutnya…`);
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

        notifyWarn(`${hit.label ?? hit.command} belum tersedia di versi ini`, {
          source: 'keybinding',
        });
        useStore.getState().setStatus('');
        return;
      }

      useStore.getState().setStatus('');
      void runCommand(hit.command).then((ok) => {
        if (!ok) {
          notifyWarn(`Command ${hit.command} tidak terdaftar`, { source: 'keybinding' });
        }
      });
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    lspListenerBound = true;

    let un: (() => void) | undefined;
    onLspEvent((ev) => useLsp.getState().onEvent(ev))
      .then((u) => {
        un = u;
      })
      .catch(() => {
        /* mode browser tanpa Tauri — biarkan */
      });

    const timer = window.setInterval(() => {
      void useLsp.getState().reap();
    }, 30_000);

    return () => {
      un?.();
      window.clearInterval(timer);
      lspListenerBound = false;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWindow()
        .onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return;
          const s = useStore.getState();
          for (const p of event.payload.paths) {
            try {
              await s.openPath(p);
            } catch {
              s.setStatus(`Tidak bisa membuka: ${p}`);
            }
          }
        })
        .then((un) => {
          unlisten = un;
        })
        .catch(() => {
          /* di luar Tauri (browser dev) event ini tidak ada */
        });
    } catch {
      /* non-Tauri */
    }
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

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
          unlisten = un;
        })
        .catch(() => {
          /* non-Tauri */
        });
    } catch {
      /* non-Tauri */
    }
    return () => unlisten?.();
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

    let unlisten: (() => void) | undefined;
    try {
      void getCurrentWindow()
        .onFocusChanged(({ payload: fokus }) => set(!fokus || document.hidden))
        .then((un) => {
          unlisten = un;
        });
    } catch {
      /* non-Tauri */
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      unlisten?.();
      delete root.dataset.idle;
    };
  }, []);

  useEffect(() => {
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

    if (ptyListenersBound) return;
    ptyListenersBound = true;

    void onPtyOutput((id, data) => writeTo(id, data));
    void onPtyExit((id, code) => {
      useTerminal.getState().markExited(id, code);
      const p = useTerminal.getState().findPane(id);

      if (p && p.kind !== 'private') {
        const label = code === null || code === undefined ? 'exited' : `exited code ${code}`;
        writeTo(id, `\r\n\x1b[90m[process ${label}]\x1b[0m\r\n`);
      }

      if (p?.kind === 'private') disposeHandle(id);
    });
  }, []);

  useEffect(() => {
    void useAi.getState().init();
    if (aiListenerBound) return;
    aiListenerBound = true;
    void onAiChunk((c) => useAi.getState().onChunk(c));
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
    ghListenerBound = true;
    void onGhLogin((e) => useGit.getState().onGhLogin(e));

    void onGitProgress((p) => useGit.getState().setProgress(p));
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void useGit.getState().refresh(), 250);
    };
    let unlisten: (() => void) | undefined;
    onFsChanged(bump)
      .then((un) => {
        unlisten = un;
      })
      .catch(() => {
        /* non-Tauri */
      });
    const unsub = useStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace) void useGit.getState().init();

      if (s.tabs !== prev.tabs) bump();
    });
    return () => {
      window.clearTimeout(timer);
      unlisten?.();
      unsub();
    };
  }, []);

  useEffect(() => {
    void useMcp.getState().init();
    if (mcpListenerBound) return;
    mcpListenerBound = true;
    void onMcpAction((a) => void useMcp.getState().handleAction(a));
    void onMcpScreenshot(({ paneId, path }) => {
      const m = useMcp.getState();
      m.setToast(`AI CLI mengambil screenshot pane ${paneId.slice(-6)}`);
      m.pushLog(`screenshot_pane ${paneId.slice(-6)} → ${path.split(/[\\/]/).pop()}`, 'action');
      useMcp.setState({ lastShot: path, mcpInfo: `Screenshot pane ${paneId} → ${path}` });
    });

    void onMcpConnect(({ client }) => {
      useMcp.getState().pushLog(`MCP connected: ${client}`, 'connect');
    });
  }, []);

  useEffect(() => {
    void useExtensions.getState().refresh();

    void muatSemuaEkstensi().then(() => {
      const s = useStore.getState();
      useStore.setState({ activeTheme: applyTheme(s.settings.general, s.settings.theme, s.settings.background) });
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

      useStore.setState({ activeTheme: applyTheme(s.settings.general, s.settings.theme, s.settings.background) });
      terapkanA11y(s.settings.accessibility);
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
      useStore.getState().setStatus('Terjadi kesalahan; lihat log');
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
    <div className="app-root">
      {/* FASE 31: skip link — elemen fokusabel PERTAMA di app.
          Tanpa ini pengguna keyboard harus melewati ~20 tombol ActivityBar +
          Sidebar sebelum sampai ke editor, setiap kali. Dibuat <button> bukan
          <a href="#..."> karena editor bukan anchor target dan CodeMirror
          butuh .focus() nyata, bukan perpindahan hash. */}
      <button
        className="a11y-skip"
        data-testid="a11y-skip"
        onClick={() => {
          const v = getActiveView();
          if (v) {
            v.focus();
            umumkanA11y('Fokus di editor.');
          } else {
            umumkanA11y('Belum ada file yang terbuka.', 'assertive');
          }
        }}
      >
        {tr('win.skipToEditor')}
      </button>
      {L.menuBar && <MenuBar />}
      <UpdateBanner />
      <DonateDialog />
      <div className={`app-body sidebar-pos-${pos}${zen ? ' is-zen' : ''}${L.kerapatan === 'compact' ? ' is-compact' : ''}`}>
        {/* ActivityBar IKUT PINDAH mengikuti posisi panel:
            - kiri/kanan : vertikal di sisi panel (kanan = dibalik CSS)
            - atas/bawah : horizontal di tepi atas/bawah (CSS)
            Urutan DOM dibuat tetap [ActivityBar, sidebar?, main, …] supaya
            flex-direction row-reverse/column dari sidebar-pos-* bekerja. */}
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
                aria-label={tr('Ubah tinggi panel')}
                onPointerDown={startResize}
              />
            </>
          )}

          {/* Posisi KIRI/KANAN: panel di samping editor, divider vertikal. */}
          {(pos === 'left' || pos === 'right') && sidebarVisible && L.sidebar && (
            <>
              <aside className="sidebar" style={{ width: sidebarWidth }} aria-label="Sidebar">
                <Sidebar />
              </aside>
              <div
                className="resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={tr('Ubah lebar sidebar')}
                onPointerDown={startResize}
              />
            </>
          )}

          <main className={`main-area${terminalMaximized ? ' term-maximized' : ''}`}>
            {/* C-19: layout terminal-first ala Terax — terminal jadi area
                utama, editor menempel sebagai pane di kanan. Default tetap
                editor-first supaya perilaku lama tidak berubah. */}
            {layoutTerminal ? (
              <div className="term-first" data-testid="term-first">
                <section className="term-first-term" aria-label="Terminal utama">
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
              bawah sejajar terminal. Dirender HANYA saat dock = 'ai' supaya
              lebar editor tidak berkurang saat user sedang di terminal. */}
          {/* AI column resizer: draggable like the sidebar. Previously the width
              340px MATI — user minta "bisa di lebarkan". */}
          {aiKanan && !aiMax && (
            <div
              className="resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label={tr('Ubah lebar panel AI')}
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
              aria-label="Panel AI"
            >
              {/* Baris: chat di kiri, panel info subagent di kanan. Wrapper ini
                  WAJIB — tanpa-nya .ai-side-col (flex column) menaruh panel
                  info di BAWAH chat, bukan di sampingnya. */}
              <div className="ai-side-row">
                <AiPanel />
                {/* T4.1b: panel INFO subagent di sebelah kanan chat. Ditaruh
                    di dalam kolom AI supaya hanya muncul saat chat memang
                    sedang tampil — kalau tidak, ia menggantung tanpa konteks. */}
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
                aria-label={tr('Ubah tinggi panel')}
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
          Kalau di dalam MenuBar, mematikan Menu Bar akan menghilangkan
          satu-satunya tombol untuk menyalakannya kembali. */}
      {L.menuBuka && <LayoutMenu onTutup={() => L.setMenuBuka(false)} />}
      <ConfirmDialog />
      <SaveIssueDialog />
      <ScmConfirmDialog />
      <CommandPalette />
      <McpToast />
      <CrashDialog />
      <Toast />
      <NotificationCenter />
      <DeleteConfirmDialog />
      <ClearChatsDialog />
      <TrustDialog />
      {/* Izin runtime eksternal ekstensi — global, bisa muncul kapan
          saja karena eksekusi bisa diminta dari worker mana pun. */}
      <ExtApprovalModal />
      <KeybindingsEditor />
      <LspOverlay />
      {/* fase 31: live region a11y. Dirender TERAKHIR supaya tidak menyisip
          di antara landmark dan tidak mengganggu urutan Tab (ia tak fokusabel). */}
      <LiveRegion />
    </div>
  );
}
