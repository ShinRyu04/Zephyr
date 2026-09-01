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
import { useStore } from './lib/store';
import { useExplorer } from './lib/explorerStore';
import { useTerminal } from './lib/terminalStore';
import { flushTab } from './lib/editorRegistry';
import { onFsChanged, onPtyExit, onPtyOutput } from './lib/events';
import { writeTo, disposeHandle } from './lib/xtermRegistry';
import './styles/theme.css';
import '@xterm/xterm/css/xterm.css';
import './index.css';

/** Guard: listener PTY hanya boleh didaftarkan sekali per proses.
 *  React StrictMode (dev) menjalankan effect dua kali — kalau listener
 *  terdaftar dua kali, setiap byte output terminal tampil dobel. */
let ptyListenersBound = false;

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

  // 3) Shortcut global: Ctrl+N/O/S, Ctrl+Shift+S, Ctrl+F, Ctrl+W, Ctrl+B.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();

      if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        s.newUntitled();
      } else if (k === 'o' && !e.shiftKey) {
        e.preventDefault();
        void s.openFileDialog();
      } else if (k === 'o' && e.shiftKey) {
        // Ctrl+Shift+O: buka folder (workspace)
        e.preventDefault();
        void s.openFolderDialog();
      } else if (k === 's') {
        e.preventDefault();
        if (!s.activeTabId) return;
        flushTab(s.activeTabId); // ambil isi terbaru dari CodeMirror
        void (e.shiftKey ? s.saveTabAs(s.activeTabId) : s.saveTab(s.activeTabId));
      } else if (k === 'f' && !e.shiftKey) {
        e.preventDefault();
        s.setFindOpen(true);
      } else if (k === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (s.activeTabId) s.requestCloseTab(s.activeTabId);
      } else if (k === 'b') {
        e.preventDefault();
        s.toggleSidebar();
      } else if (k === 'f' && e.shiftKey) {
        // Ctrl+Shift+F: cari di workspace (fase 04)
        e.preventDefault();
        s.setActivity('search');
        if (!s.sidebarVisible) s.toggleSidebar();
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('.search-input')?.focus();
        }, 60);
      } else if (e.key === '`') {
        // Ctrl+` : toggle panel; Ctrl+Shift+` : pane shell baru; Ctrl+Alt+` : perbesar/restore
        e.preventDefault();
        const t = useTerminal.getState();
        if (e.altKey) {
          if (!t.visible) t.setVisible(true);
          t.toggleMaximized();
        } else if (e.shiftKey) void t.addPane('shell');
        else if (t.allPanes().length === 0) void t.addPane('shell');
        else t.toggleVisible();
      }
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
    </div>
  );
}
