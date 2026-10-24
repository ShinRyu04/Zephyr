import { lazy, Suspense, useEffect } from 'react';
import LiveRegion from './components/a11y/LiveRegion';
import Toast from './components/notifications/Toast';
import ConfirmDialog from './components/shell/ConfirmDialog';
import TanyaDialog from './components/shell/TanyaDialog';
import { useAiChunkListener } from './lib/useAiChunkListener';
import { useAi } from './lib/aiStore';
import { pasangSinkronSetelan, useStore } from './lib/store';
import { useGit } from './lib/gitStore';
import { useWs } from './lib/workspaceStore';
import { onFsChanged, onPtyExit, onPtyOutput } from './lib/events';
import { bacaIntegrasiShell } from './lib/shellIntegration';
import { useTerminal } from './lib/terminalStore';
import { writeTo } from './lib/xtermRegistry';
import { muatSemuaEkstensi } from './lib/extLoader';
import { fokusEditorWindow } from './lib/agentsWindow';

const AgentsLayout = lazy(() => import('./components/agents/AgentsApp'));
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));
/*
 * The notification centre is a SEPARATE mount per window, not a global.
 *
 * Each pop-out is its own WebView with its own zustand instances, so the main
 * window's `<NotificationCenter/>` cannot draw here. Without this mount a run
 * that finished while the reader was away did notify - `aiStore` pushes the
 * notification when the window is unfocused - and the notification went into
 * this window's store where nothing rendered it. The toast that did appear
 * disappears after a few seconds, so the history was effectively lost.
 *
 * Lazy like the rest: the panel is only mounted on screen when the bell is
 * clicked, and the module is small.
 */
const NotificationCenter = lazy(() => import('./components/notifications/NotificationCenter'));

/**
 * The "Open in Agents" window — Zephyr's 3-column agents workspace.
 *
 * NOT the same as `AiWindow` (the floating chat). That one is a single column
 * with nothing but the conversation. This one is a whole workspace: sessions on
 * the left, the chat in the middle, Changes/Files on the right.
 *
 * Every pop-out is a SEPARATE WebView process with its OWN zustand instances,
 * so nothing the main window loaded is available here. `AiWindow` bootstraps
 * `useStore` + `useAi`; this one needs more, because two of its three columns
 * read state the chat window never touches:
 *
 *   - `useGit`      -> the Changes column (uncommitted files + count badge)
 *   - workspace     -> the Files column. `ExplorerPanel` renders
 *                      `<EmptyWorkspace/>` on a null workspace, so without this
 *                      the tree would be permanently empty.
 *
 * The missing workspace binding is what makes this window different from
 * `AiWindow` rather than a copy of it: the Rust side already knows the active
 * root (it is per-process state on the backend, shared by every window), so
 * `useWs.muat()` reads it and `syncWorkspaceLokal` pushes it into the local
 * store — which is what `ExplorerPanel` and the tree actually read.
 */
/*
 * Bootstrap at MODULE load, not in an effect.
 *
 * In an effect this was unreliable: the window would render its whole UI —
 * sessions, chat, both side columns — while `settingsLoaded` stayed false and
 * `workspace` stayed null, so Changes and Files came up empty. Calling
 * `bootstrap()` by hand from the devtools console then worked, which proved the
 * call itself was fine and only its TIMING was wrong.
 *
 * An effect is too late and too fragile here. This module is loaded the moment
 * the entry point picks the `#agents` root, before React renders anything, and
 * `bootstrap()` is idempotent (it guards on a module-level flag), so running it
 * once at load is both earliest and safe.
 */
void useStore.getState().bootstrap();

/*
 * Cross-window settings sync, installed at load.
 *
 * The main window (App.tsx) and the panel window (PanelWindow.tsx) both call
 * this; without it here the Agents window kept the `settings` snapshot from its
 * own `bootstrap()` forever. Two visible consequences:
 *  - changing the UI language only re-rendered the main window, so the Agents
 *    window stayed in the old language (i18n reads `settings.general.uiLang`);
 *  - a gateway/model/key saved elsewhere never reached this window's model
 *    picker until it was closed and reopened.
 * Called before React renders, matching `bootstrap()` above.
 */
pasangSinkronSetelan();

/** Run `fn` as soon as settings have loaded — immediately if they already have. */
function saatSetelanSiap(fn: () => void): () => void {
  if (useStore.getState().settingsLoaded) {
    fn();
    return () => {};
  }
  return useStore.subscribe((s, prev) => {
    if (!prev.settingsLoaded && s.settingsLoaded) fn();
  });
}

/*
 * Output PTY untuk terminal panel kanan.
 *
 * `pty-output` hanya dipasang di jendela utama (App.tsx). Jendela ini WebView
 * sendiri, jadi tanpa listener di sini shell hidup tapi outputnya tidak pernah
 * sampai ke xterm: tab Terminal tampak kosong. Guard modul mencegah pemasangan
 * ganda (StrictMode memanggil effect dua kali).
 */
let ptyListenerBound = false;

function useTerminalOutputListener() {
  useEffect(() => {
    if (ptyListenerBound) return;
    ptyListenerBound = true;
    const unlisten = Promise.all([
      onPtyOutput((id, data) => {
        writeTo(id, data);
        /* Sama seperti jendela utama: OSC 633 memberi cwd dan kode keluar. */
        const info = bacaIntegrasiShell(id, data);
        if (info) useTerminal.getState().terapkanIntegrasi(id, info);
      }),
      onPtyExit((id, code) => {
        useTerminal.getState().markExited(id, code);
        const p = useTerminal.getState().findPane(id);
        if (p && p.kind !== 'private') {
          const label = code === null || code === undefined ? 'exited' : `exited code ${code}`;
          writeTo(id, `\r\n\x1b[90m[process ${label}]\x1b[0m\r\n`);
        }
      }),
    ]).catch((): (() => void)[] => {
      ptyListenerBound = false;
      return [];
    });
    return () => {
      void unlisten.then((fns) => fns.forEach((f) => f()));
      ptyListenerBound = false;
    };
  }, []);
}

export default function AgentsWindow() {
  useAiChunkListener();
  useTerminalOutputListener();

  /* Chat, keys and models — same as the chat window. */
  useEffect(() => saatSetelanSiap(() => void useAi.getState().init()), []);

  /*
   * Daftar API key ikut jendela lain.
   *
   * Key yang disimpan di jendela utama dulu tidak pernah sampai ke sini: jendela
   * ini memuat daftarnya sekali saat `init`, lalu terus memakai salinan itu.
   * Akibatnya composer menampilkan "provider ini belum punya API key" walau
   * key-nya sudah ada di disk. `pasangSinkronKunci` mendengarkan
   * `secrets-changed` dari Rust dan menyegarkan salinan ini.
   */
  useEffect(() => {
    void import('./lib/secretsSync').then((m) => m.pasangSinkronKunci());
  }, []);

  /*
   * Extensions, for the editor.
   *
   * `muatSemuaEkstensi` is what installs language modes, themes, snippets and
   * extension keymaps — without it the Editor tab would show every file as
   * plain uncoloured text, and every `.cm-` colour rule read as missing rather
   * than as "the extension set was never loaded". The main window does the same
   * load at startup; this window is a separate WebView, so it needs its own.
   */
  useEffect(() => {
    void muatSemuaEkstensi().catch(() => {
      /* non-Tauri origin */
    });
  }, []);

  /*
   * The workspace, for the Files column.
   *
   * Waits for settings to land first: `syncWorkspaceLokal` writes into the same
   * store `bootstrap()` populates, and racing the two would leave `workspace`
   * pointing at whatever finished last.
   */
  useEffect(() => {
    let hidup = true;

    const siapkan = async () => {
      await useWs.getState().muat();
      if (!hidup) return;
      const akar = useWs.getState().activeRoot;
      /*
       * Adopt the root the backend actually has, ALWAYS.
       *
       * This used to be `if (akar && !useStore.getState().workspace)`, which
       * only synced when this window's store knew no root at all. The result:
       * a folder opened in the IDE while the Agents window was already running
       * never reached it - Files and Changes kept showing the previous folder
       * (or nothing), and the only cure was closing and reopening the window.
       * Measured live: the backend's `activeRoot` was D:\Zephyr while this
       * window's `workspace` was still null, so the tree rendered its empty
       * state.
       *
       * The old guard existed to avoid clearing the explorer cache on every
       * mount. Comparing the two values keeps that benefit and fixes the bug:
       * a sync happens only when they actually disagree.
       */
      if (akar && akar !== useStore.getState().workspace) {
        await useStore.getState().syncWorkspaceLokal(akar);
      }
      if (!hidup) return;
      void useGit.getState().init();
    };

    const unsub = saatSetelanSiap(() => void siapkan());
    return () => {
      hidup = false;
      unsub();
    };
  }, []);

  /*
   * Ctrl+Shift+A — the return trip to the editor.
   *
   * In the main window that chord opens this workspace (`agents.openWindow`,
   * keybindings.ts). Here it must mean the opposite, exactly as VS Code's
   * "toggle" chords do: the same key gets you back where you came from.
   *
   * This is bound LOCALLY rather than added to `DEFAULT_BINDINGS` on purpose.
   * That table is global and this window resolves nothing from it: a global
   * `Ctrl+Shift+A` row would resolve `agents.openWindow` HERE too, whose run()
   * calls `bukaAgentsWindow()` -> `getByLabel('agents')` -> this very window ->
   * `.setFocus()`. The chord would focus the window it was pressed in and look
   * dead. Focusing the editor directly is the only thing that can work, so the
   * binding lives where the intent does.
   *
   * `fokusEditorWindow` focuses the `main` window WITHOUT closing this one: the
   * agents window stays alive behind it, and the main window's own
   * Ctrl+Shift+A brings it straight back. A close-and-restore pair would lose
   * the three columns' scroll positions and the draft in the composer.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
      if (e.key.toLowerCase() !== 'a') return;
      e.preventDefault();
      void fokusEditorWindow().catch((error: unknown) => {
        console.error('gagal kembali ke jendela editor', error);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * Keep the Changes column honest while files are edited elsewhere.
   *
   * A listener PER WINDOW is correct here, not a leak: each window is its own
   * process with its own store, so the main window's listener cannot update
   * this one. The debounce matches App's (250ms) so a single save does not
   * fire a status call per touched file.
   */
  useEffect(() => {
    const timer = { id: undefined as number | undefined };
    const bump = () => {
      window.clearTimeout(timer.id);
      timer.id = window.setTimeout(() => void useGit.getState().refresh(), 250);
    };

    let unlisten: (() => void) | undefined;
    onFsChanged(bump)
      .then((un) => {
        unlisten = un;
      })
      .catch(() => {
        /* non-Tauri */
      });

    /* Switching the active root re-reads git: a different repository means a
       completely different set of changes. */
    const unsub = useStore.subscribe((s, prev) => {
      if (s.workspace !== prev.workspace) void useGit.getState().init();
    });

    return () => {
      window.clearTimeout(timer.id);
      unlisten?.();
      unsub();
    };
  }, []);

  return (
    <div className="agents-window-root" data-testid="agents-window-root">
      <Suspense fallback={null}>
        <AgentsLayout />
      </Suspense>
      <Suspense fallback={null}>
        <ToolGatePanel />
      </Suspense>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <Suspense fallback={null}>
        <NotificationCenter />
      </Suspense>
      {/*
        * Unsaved-close confirmation, for both ways a file is opened here:
        * double-clicking in Changes, and the tab strip's own ×. `openPath`
        * routes a dirty buffer into `confirm`, and without this mount the store
        * sets that flag and nothing ever asks — the click would silently
        * discard the edits.
        */}
      <Suspense fallback={null}>
        <ConfirmDialog />
      </Suspense>
      <Suspense fallback={null}>
        <TanyaDialog />
      </Suspense>
      <LiveRegion />
    </div>
  );
}
