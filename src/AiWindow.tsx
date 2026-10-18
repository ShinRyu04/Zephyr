import { lazy, Suspense, useEffect } from 'react';
import LiveRegion from './components/a11y/LiveRegion';
import Toast from './components/notifications/Toast';
import { useAiChunkListener } from './lib/useAiChunkListener';import { useAi } from './lib/aiStore';
import { useStore } from './lib/store';

const AiPanel = lazy(() => import('./components/ai/AiHost'));
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));
/* Separate WebView, separate stores: the main window's centre cannot draw here.
   See the same note in AgentsWindow.tsx. */
const NotificationCenter = lazy(() => import('./components/notifications/NotificationCenter'));

/**
 * The pop-out AI window (Copilot "Move Chat into New Window").
 *
 * A second Zephyr window whose only job is the chat. It is deliberately
 * minimal — no activity bar, no editor, no terminal — so the chat gets the
 * whole surface, exactly like VSCode's floating Copilot window. The main
 * window stops rendering its own `<AiPanel/>` while in 'window' mode, so there
 * is still only ONE `ai-chunk` listener and tokens never double.
 *
 * Bootstrap runs HERE, not only in App: the pop-out is a separate WebView
 * process with its own store instances. Without this the provider, model and
 * API keys are never loaded, and the model chip reads as empty — which is
 * exactly the bug that made the window unusable.
 */
export default function AiWindow() {
  useAiChunkListener();

  useEffect(() => {
    void useStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (useStore.getState().settingsLoaded) {
      void useAi.getState().init();
      return;
    }
    const unsub = useStore.subscribe((s, prev) => {
      if (!prev.settingsLoaded && s.settingsLoaded) {
        void useAi.getState().init();
      }
    });
    return unsub;
  }, []);

  return (
    <div className="ai-window-root" data-testid="ai-window-root">
      <Suspense fallback={null}>
        <AiPanel />
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
      <LiveRegion />
    </div>
  );
}
