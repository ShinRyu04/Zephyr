// App.tsx — shell Zephyr: ActivityBar | Sidebar | EditorArea + TerminalArea,
// StatusBar, dialog konfirmasi. Wiring: bootstrap, shortcut global,
// drag-drop file dari Explorer, dan onCloseRequested.

import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ActivityBar from './components/shell/ActivityBar';
import Sidebar from './components/shell/Sidebar';
import EditorArea from './components/shell/EditorArea';
import TerminalArea from './components/shell/TerminalArea';
import StatusBar from './components/shell/StatusBar';
import ConfirmDialog from './components/shell/ConfirmDialog';
import ScmConfirmDialog from './components/scm/ScmConfirmDialog';
import CommandPalette from './components/shell/CommandPalette';
import McpToast from './components/shell/McpToast';
import { useStore } from './lib/store';
import { useExplorer } from './lib/explorerStore';
import { useTerminal } from './lib/terminalStore';
import { useAi } from './lib/aiStore';
import { useGit } from './lib/gitStore';
import { useMcp } from './lib/mcpStore';
import { usePalette } from './lib/paletteStore';
import { useSettingsUi } from './lib/settingsStore';
import { bindingMap, eventToBinding } from './lib/shortcuts';
import { flushTab } from './lib/editorRegistry';
import { onAiChunk, onFsChanged, onGhLogin, onMcpAction, onMcpConnect, onMcpScreenshot, onPtyExit, onPtyOutput } from './lib/events';
import { writeTo, disposeHandle } from './lib/xtermRegistry';
import './styles/theme.css';
import './styles/settings.css';
import './styles/ai.css';
import './styles/scm.css';
import './styles/palette.css';
import '@xterm/xterm/css/xterm.css';
import './index.css';

/** Guard: listener PTY hanya boleh didaftarkan sekali per proses.
 *  React StrictMode (dev) menjalankan effect dua kali — kalau listener
 *  terdaftar dua kali, setiap byte output terminal tampil dobel. */
let ptyListenersBound = false;

/** Guard yang sama untuk listener `ai-chunk` (fase 09). */
let aiListenerBound = false;

/** Guard yang sama untuk listener `gh-login` (fase 10). */
let ghListenerBound = false;

/** Guard yang sama untuk listener `mcp-action` (fase 11). Tanpa ini setiap
 *  permintaan MCP dieksekusi dua kali di dev — editor_open membuka dua tab
 *  dan `mcp_reply` kedua ditolak Rust. */
let mcpListenerBound = false;

export default function App() {
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const bootstrap = useStore((s) => s.bootstrap);
  const terminalMaximized = useTerminal((s) => s.maximized);
  const dragging = useRef(false);

  // 1) Muat settings + restore session sekali di awal.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 2) Drag divider sidebar (pointer events supaya tetap jalan di luar elemen).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // 48px = lebar ActivityBar (token --activitybar-w)
      setSidebarWidth(e.clientX - 48);
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

  // 3) Shortcut global: dibaca dari KATALOG (lib/shortcuts.ts) + override user
  //    di settings.shortcuts, jadi remap di Settings langsung berlaku tanpa
  //    restart. Jangan kembalikan ke if/else hardcoded.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Saat satu baris Shortcuts sedang menunggu tombol, jangan jalankan
      // action apa pun (handler capture di SettingsPage yang menangani).
      if (useSettingsUi.getState().capturing) return;

      // Palette terbuka: modal-nya yang memegang keyboard (Arrow/Enter/Esc).
      // Hanya pemicu palette sendiri yang boleh lewat supaya Ctrl+P ↔
      // Ctrl+Shift+P bisa berganti mode tanpa menutup dulu.
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
          flushTab(s.activeTabId); // ambil isi terbaru dari CodeMirror
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
        case 'view.sidebar':
          s.toggleSidebar();
          break;
        case 'view.panel':
          // Ctrl+J: kalau belum ada pane sama sekali, buat satu supaya panel
          // yang muncul tidak kosong melongo.
          if (t.allPanes().length === 0 && !t.visible) void t.addPane('shell');
          else t.toggleVisible();
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
        // ── AI panel (fase 09) ──
        case 'ai.panel': {
          // Toggle seperti ikon lain: kalau panel AI sudah tampil, tutup.
          s.setSettingsOpen(false);
          s.setActivity('ai');
          if (!s.sidebarVisible) s.toggleSidebar();
          if (t.visible && t.dock === 'ai') t.setVisible(false);
          else {
            t.setVisible(true);
            t.setDock('ai');
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
        default:
          return; // action belum punya implementasi -> jangan telan event
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 3b) Ctrl+Alt+` tidak ada di katalog (khusus perbesar panel terminal).
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

  // 3c) Ctrl+I (fase 09 §9.4): buka panel AI lalu fokuskan input.
  //     Tidak masuk katalog shortcut karena bukan action yang bisa di-remap
  //     di fase 08 — ini pintasan "inline" ala Copilot.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'i') return;
      e.preventDefault();
      const s = useStore.getState();
      const t = useTerminal.getState();
      s.setSettingsOpen(false);
      t.setVisible(true);
      t.setDock('ai');
      // Panel mungkin baru ter-mount; beri satu frame sebelum fokus.
      window.setTimeout(() => window.dispatchEvent(new Event('zephyr-ai-focus')), 80);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 4) Drop file dari Windows Explorer -> buka jadi tab (PRD V9).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
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
    return () => unlisten?.();
  }, []);

  // 5) Tutup window dengan tab kotor -> tahan, tampilkan dialog.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
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
    return () => unlisten?.();
  }, []);

  // 6) Watcher (fase 04): file berubah dari luar -> re-scan folder terkait.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onFsChanged(({ dir, path, kind }) => {
      const ex = useExplorer.getState();
      void ex.refreshDir(dir);
      // Perubahan isi file yang sedang dibuka & belum diedit -> muat ulang.
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

  // 7) Terminal (fase 05/06): daftar shell + agent, output PTY, exit proses.
  useEffect(() => {
    void useTerminal.getState().loadShells();
    void useTerminal.getState().loadAgents();
    // StrictMode dev menjalankan effect DUA kali; tanpa guard ini listener
    // terdaftar ganda dan setiap byte output terminal tampil dobel.
    if (ptyListenersBound) return;
    ptyListenersBound = true;

    void onPtyOutput((id, data) => writeTo(id, data));
    void onPtyExit((id) => {
      useTerminal.getState().markExited(id);
      // Pane private: buang scrollback begitu prosesnya berakhir.
      const p = useTerminal.getState().findPane(id);
      if (p?.kind === 'private') disposeHandle(id);
    });
  }, []);

  // 8) AI (fase 09): init store + listener `ai-chunk`.
  //    Guard modul WAJIB seperti pty: StrictMode dev memasang listener dua
  //    kali dan setiap token jawaban akan tampil dobel.
  useEffect(() => {
    void useAi.getState().init();
    if (aiListenerBound) return;
    aiListenerBound = true;
    void onAiChunk((c) => useAi.getState().onChunk(c));
  }, []);

  // 9) Source Control (fase 10): status awal + listener `gh-login`.
  //    Guard modul sama seperti pty/ai — device flow yang di-handle dua kali
  //    akan menimpa pesan status berulang.
  useEffect(() => {
    void useGit.getState().init();
    if (ghListenerBound) return;
    ghListenerBound = true;
    void onGhLogin((e) => useGit.getState().onGhLogin(e));
  }, []);

  // 9b) Refresh status git setiap workspace berganti atau file berubah.
  //     Debounce 250ms: satu `git status` per burst, bukan per event.
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
      // Simpan file → status git berubah walau watcher tidak sempat kirim.
      if (s.tabs !== prev.tabs) bump();
    });
    return () => {
      window.clearTimeout(timer);
      unlisten?.();
      unsub();
    };
  }, []);

  // 9c) MCP (fase 11): status server + listener `mcp-action`.
  //     Guard modul WAJIB (lihat mcpListenerBound di atas): satu permintaan
  //     MCP tidak boleh dieksekusi dua kali.
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
    // fase 12: setiap AI CLI menyapa /health saat menyambung → bukti koneksi.
    void onMcpConnect(({ client }) => {
      useMcp.getState().pushLog(`MCP connected: ${client}`, 'connect');
    });
  }, []);

  return (
    <div className="app-root">
      <div className="app-body">
        <ActivityBar />

        {sidebarVisible && (
          <>
            <aside className="sidebar" style={{ width: sidebarWidth }} aria-label="Sidebar">
              <Sidebar />
            </aside>
            <div
              className="resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Ubah lebar sidebar"
              onPointerDown={startResize}
            />
          </>
        )}

        <main className={`main-area${terminalMaximized ? ' term-maximized' : ''}`}>
          <EditorArea />
          <TerminalArea />
        </main>
      </div>

      <StatusBar />
      <ConfirmDialog />
      <ScmConfirmDialog />
      <CommandPalette />
      <McpToast />
    </div>
  );
}
