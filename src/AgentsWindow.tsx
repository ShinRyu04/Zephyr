import { lazy, Suspense, useEffect } from 'react';
import LiveRegion from './components/a11y/LiveRegion';
import Toast from './components/notifications/Toast';
import { useAiChunkListener } from './lib/useAiChunkListener';
import { useAi } from './lib/aiStore';
import { useStore } from './lib/store';
import { useGit } from './lib/gitStore';
import { useWs } from './lib/workspaceStore';
import { onFsChanged } from './lib/events';

const AgentsLayout = lazy(() => import('./components/agents/AgentsLayout'));
const AgentCustomModal = lazy(() => import('./components/settings/AgentCustomModal'));
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));

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

export default function AgentsWindow() {
  useAiChunkListener();

  /* Chat, keys and models — same as the chat window. */
  useEffect(() => saatSetelanSiap(() => void useAi.getState().init()), []);

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
      /* Only when this window's store does not already know the root — an
         unconditional call would clear the explorer cache every mount. */
      if (akar && !useStore.getState().workspace) {
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
        <AgentCustomModal />
      </Suspense>
      <Suspense fallback={null}>
        <ToolGatePanel />
      </Suspense>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <LiveRegion />
    </div>
  );
}
