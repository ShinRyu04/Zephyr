// App.tsx — shell Zephyr: ActivityBar | Sidebar | EditorArea + TerminalArea,
// StatusBar, dialog konfirmasi. Wiring: bootstrap, shortcut global,
// drag-drop file dari Explorer, dan onCloseRequested.

import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ActivityBar from './components/shell/ActivityBar';
import Sidebar from './components/shell/Sidebar';
import EditorArea from './components/shell/EditorArea';
import Panel from './components/shell/Panel';
import StatusBar from './components/shell/StatusBar';
import ConfirmDialog from './components/shell/ConfirmDialog';
import SaveIssueDialog from './components/shell/SaveIssueDialog';
import Toast from './components/notifications/Toast';
import NotificationCenter from './components/notifications/NotificationCenter';
import DeleteConfirmDialog from './components/explorer/DeleteConfirmDialog';
import TrustDialog from './components/workspace/TrustDialog';
import MenuBar from './components/shell/MenuBar';
import KeybindingsEditor from './components/shell/KeybindingsEditor';
import LspOverlay from './components/editor/LspOverlay';
import ScmConfirmDialog from './components/scm/ScmConfirmDialog';
import CommandPalette from './components/shell/CommandPalette';
import McpToast from './components/shell/McpToast';
import CrashDialog from './components/shell/CrashDialog';
import { useStore } from './lib/store';
import { useExplorer } from './lib/explorerStore';
import { useTerminal } from './lib/terminalStore';
import { useAi } from './lib/aiStore';
import { useGit } from './lib/gitStore';
import { useMcp } from './lib/mcpStore';
import { usePalette } from './lib/paletteStore';
import { useExtensions } from './lib/extensionStore';
import { useSettingsUi } from './lib/settingsStore';
import { applyTheme, watchSystemTheme } from './lib/themes';
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
import { flushTab } from './lib/editorRegistry';
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
import './styles/history.css';
import './styles/debug.css';
import './styles/workspace.css';
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

/** Guard yang sama untuk listener `lsp-event` (fase 21). Tanpa ini setiap
 *  publishDiagnostics diproses dua kali di dev dan Problems berkedip. */
let lspListenerBound = false;

/** Guard yang sama untuk handler error global (fase 14.6). Tanpa ini satu
 *  rejection dikirim dua kali ke file log di mode dev. */
let errorHandlersBound = false;

/** fase 15.6: true = sidebar dilipat OLEH kode karena jendela sempit (<1000px),
 *  bukan oleh user. Hanya yang dilipat otomatis yang dibuka lagi saat jendela
 *  dilebarkan — kalau tidak, sidebar yang sengaja ditutup user muncul sendiri. */
let autoCollapsed = false;

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
  //
  //    FASE 18: handler ini tetap ada untuk action lama (settings.shortcuts),
  //    TAPI resolver chord baru (3d, di bawah) berjalan di fase CAPTURE lebih
  //    dulu. Kalau resolver sudah menangani sebuah chord, ia memanggil
  //    stopPropagation sehingga handler ini tidak ikut jalan — tidak ada
  //    double-fire (syarat V6).
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

      // FASE 18/20: registry keybinding sekarang pemilik tunggal chord.
      // Handler ini terdaftar LEBIH DULU dari resolver (efek 3d), dan untuk
      // event yang di-dispatch langsung ke `window` listener berjalan sesuai
      // urutan registrasi — jadi stopImmediatePropagation di resolver tidak
      // bisa mencegah handler ini. Kalau tidak bail out di sini, satu chord
      // dijalankan DUA KALI (Ctrl+J toggle dua kali = tidak terjadi apa-apa).
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
        // fase 25: Ctrl+Shift+H = sama seperti Ctrl+Shift+F tapi panel replace
        // langsung terbuka — itu satu-satunya bedanya di VS Code juga.
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
        // ── Tasks (fase 23) ──
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

  // 3d) FASE 18.2 — RESOLVER CHORD GLOBAL.
  //
  // Berjalan di fase CAPTURE supaya bisa memutuskan lebih dulu apakah sebuah
  // chord miliknya, milik CodeMirror, atau milik xterm. Aturan yang dipegang:
  //
  //   * layer 'editor'/'terminal' → JANGAN dicegat saat fokus memang di sana.
  //     CodeMirror & xterm punya keymap sendiri; meniru logikanya di sini
  //     pasti berbeda perilaku (syarat 18.2 & V9).
  //   * layer 'stub' → chord DIKONSUMSI (preventDefault) tapi tidak melakukan
  //     apa pun selain memberi tahu user. Tanpa ini F5 akan me-reload WebView
  //     dan Zephyr terlihat "restart sendiri".
  //   * sequence: chord pertama yang merupakan PREFIX tidak memicu apa pun,
  //     hanya menyetel `pending`. Chord kedua menyelesaikannya; Esc atau 1,5s
  //     membatalkan.
  //   * input/textarea native TIDAK diganggu untuk chord biasa (Ctrl+A dsb.)
  //     — hanya chord bermodifier yang benar-benar terdaftar yang dicegat.
  useEffect(() => {
    void useKb.getState().load();

    const onKey = (e: KeyboardEvent) => {
      // Perekam chord di editor Keyboard Shortcuts / Settings memegang keyboard.
      if (useSettingsUi.getState().capturing) return;
      if (useKb.getState().editorOpen && document.querySelector('[data-testid="kb-recording"]')) {
        return;
      }

      const chord = eventToBinding(e);
      if (!chord) return;

      const kb = useKb.getState();
      const pending = kb.pending;
      const seq = pending ? `${pending} ${chord}` : chord;

      // Esc membatalkan pending (syarat V4).
      if (pending && e.key === 'Escape') {
        e.preventDefault();
        kb.setPending('');
        useStore.getState().setStatus('');
        return;
      }

      // Chord pertama sebuah sequence: tahan, jangan fire apa pun.
      if (!pending && kb.isPrefix(chord)) {
        e.preventDefault();
        // stopImmediatePropagation, BUKAN stopPropagation: handler shortcut
        // lama (fase 08) juga terdaftar di `window`, dan stopPropagation tidak
        // memblokir listener pada node yang SAMA. Tanpa ini satu chord
        // dieksekusi dua kali — Ctrl+J toggle dua kali = tidak terjadi apa-apa.
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

      // Serahkan ke pemilik layer yang benar.
      const el = document.activeElement;
      const diEditor = !!el?.closest('.zephyr-cm-host');
      const diTerminal = !!el?.closest('.xterm');
      if (hit.layer === 'editor' && diEditor) return;
      if (hit.layer === 'terminal' && diTerminal) return;
      // Chord tanpa modifier di dalam input/textarea milik input itu.
      const diInput =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (diInput && !e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      kb.setLastRun(hit.command);

      if (hit.layer === 'stub') {
        // Fiturnya belum ada — beri tahu sekali, jangan diam dan jangan error.
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

  // 3e) Context key untuk resolver: fokus editor vs terminal (18.2).
  //     Diambil dari event fokus NYATA, bukan ditebak dari state — inilah yang
  //     membuat Ctrl+Up berarti scroll editor vs scroll buffer terminal (V5).
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

  // 3f) FASE 21: listener event language server + reaper idle.
  //     Guard modul, sama seperti pty-output / ai-chunk / mcp-action —
  //     StrictMode dev memasang effect dua kali dan setiap diagnostik akan
  //     diproses dobel.
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

    // Reaper: kebijakan idle-shutdown ada di UI karena UI yang tahu file mana
    // masih dibuka. 30 detik cukup responsif tanpa membebani.
    const timer = window.setInterval(() => {
      void useLsp.getState().reap();
    }, 30_000);

    return () => {
      un?.();
      window.clearInterval(timer);
      lspListenerBound = false;
    };
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
    void onPtyExit((id, code) => {
      useTerminal.getState().markExited(id, code);
      const p = useTerminal.getState().findPane(id);
      // fase 15.2: tulis penanda ke layar pane supaya user tahu prosesnya
      // sudah berakhir (dan dengan code apa) — bukan pane yang diam menipu.
      // Pane private dibuang scrollback-nya, jadi tidak perlu penanda.
      if (p && p.kind !== 'private') {
        const label = code === null || code === undefined ? 'exited' : `exited code ${code}`;
        writeTo(id, `\r\n\x1b[90m[process ${label}]\x1b[0m\r\n`);
      }
      // Pane private: buang scrollback begitu prosesnya berakhir.
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

  // 8b) Tasks (fase 23): listener event Rust + muat tasks.json.
  //     `bindTaskListeners` punya guard modul sendiri — StrictMode dev memasang
  //     effect dua kali dan setiap baris output task akan tampil dobel.
  useEffect(() => {
    bindTaskListeners();
    // fase 25: listener `search-hit` juga punya guard modul sendiri.
    bindSearchListeners();
    // fase 22: listener `dap-event`/`dap-output` + sinkronisasi context key
    // `debugActive` (yang membuat F11 = step-into saat debug, fullscreen di luar).
    bindDebugListeners();
    // fase 28: event `cli-args` (instance kedua) + tarik argumen instance
    // pertama. Dipanggil SETELAH listener lain supaya `zephyr file.ts:10:5`
    // membuka tab di app yang sudah siap, bukan setengah jalan.
    void bindCliListeners();
    // fase 29: daftar root + status trust. Dipanggil TERAKHIR karena
    // `workspace_info` membaca workspace yang baru dipasang bootstrap.
    void bindWorkspaceListeners();
    // tasks.json hanya ada kalau sudah ada workspace. Dibaca lewat subscribe,
    // bukan selector: `workspace` bisa berubah setelah bootstrap selesai dan
    // effect dengan array dependensi kosong tidak akan melihatnya.
    const T = () => useTasks.getState();
    if (useStore.getState().workspace) void T().muat();
    return useStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace && s.workspace) void T().muat();
    });
  }, []);

  // 9) Source Control (fase 10): status awal + listener `gh-login`.
  //    akan menimpa pesan status berulang.
  useEffect(() => {
    void useGit.getState().init();
    if (ghListenerBound) return;
    ghListenerBound = true;
    void onGhLogin((e) => useGit.getState().onGhLogin(e));
    // fase 14.4: progres operasi git dari Rust (payload kecil, idempoten).
    void onGitProgress((p) => useGit.getState().setProgress(p));
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

  // 9d) Ekstensi + tema (fase 13).
  //     - daftar ekstensi dimuat sekali supaya command manifest siap di palette
  //     - `commandPalette.open` dari MCP sampai ke sini lewat event window
  //       (mcpStore tidak boleh import paletteStore — lingkaran import)
  //     - tema Windows dipantau: hanya berlaku saat mode = 'system'
  useEffect(() => {
    void useExtensions.getState().refresh();
    // fase 19: muat kontribusi ekstensi NATIVE (tema/keymap/snippet/bahasa/
    // command/icon theme) lalu terapkan tema lagi — kalau tema aktif milik
    // ekstensi, `applyTheme` pertama (di bootstrap) belum mengenalnya.
    void muatSemuaEkstensi().then(() => {
      const s = useStore.getState();
      useStore.setState({ activeTheme: applyTheme(s.settings.general, s.settings.theme) });
    });

    // `detail.query` (fase 23): "Run Task" membuka palette yang sudah terisi
    // "Task: " supaya daftar task langsung tersaring. openPalette() selalu
    // mengosongkan query, jadi setQuery HARUS dipanggil setelahnya.
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
    // fase 18: command `view.quickOpen` dari menu bar / chord juga lewat event
    // supaya commandRegistry tidak perlu import paletteStore (lingkaran).
    const openQuick = () => void usePalette.getState().openPalette('file');
    window.addEventListener('zephyr-quickopen', openQuick);

    // fase 26: snapshot Local History. store.ts memancarkan event ini SEBELUM
    // menulis file; ia tidak boleh mengimpor historyStore karena historyStore
    // sudah mengimpor store.ts (lingkaran impor).
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
      // applyTheme membaca ulang preferensi OS; cukup panggil lagi.
      useStore.setState({ activeTheme: applyTheme(s.settings.general, s.settings.theme) });
      retheme();
    });

    return () => {
      window.removeEventListener('zephyr-palette-open', openPalette);
      window.removeEventListener('zephyr-quickopen', openQuick);
      window.removeEventListener('zephyr-history-snapshot', onSnapshot);
      stopWatch();
    };
  }, []);

  // 9f) fase 15.6: layout sempit. Di bawah 1000px lebar jendela, sidebar
  //     otomatis dilipat (dan panel bawah dipersempit lewat CSS) supaya
  //     editor tetap punya ruang baca di jendela minimum 800x520. Kalau
  //     jendela dilebarkan lagi, sidebar yang DILIPAT OTOMATIS dibuka
  //     kembali — sidebar yang ditutup manual oleh user tidak diganggu.
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


  // 9e) Error global (fase 14.6): `window.onerror` + `unhandledrejection`
  //     dikirim ke file log Rust dan ditampilkan sebagai pesan status.
  //     Tanpa ini kesalahan di WebView hilang begitu app ditutup.
  useEffect(() => {
    if (errorHandlersBound) return;
    errorHandlersBound = true;

    const lapor = (level: 'error' | 'warn', text: string) => {
      void logFrontend(level, text).catch(() => {
        /* Rust tidak tersedia (mode browser) — biarkan */
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
    // Tandai UI siap supaya Diagnostics punya angka startup end-to-end.
    void perfMark('ui-ready', Math.round(performance.now())).catch(() => {
      /* non-Tauri */
    });
  }, []);

  return (
    <div className="app-root">
      <MenuBar />
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
          <Panel />
        </main>
      </div>

      <StatusBar />
      <ConfirmDialog />
      <SaveIssueDialog />
      <ScmConfirmDialog />
      <CommandPalette />
      <McpToast />
      <CrashDialog />
      <Toast />
      <NotificationCenter />
      <DeleteConfirmDialog />
      <TrustDialog />
      <KeybindingsEditor />
      <LspOverlay />
    </div>
  );
}
