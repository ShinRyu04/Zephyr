import { lazy, Suspense } from 'react';
import LiveRegion from './components/a11y/LiveRegion';
import Toast from './components/notifications/Toast';
import { useAiChunkListener } from './lib/useAiChunkListener';

const AiPanel = lazy(() => import('./components/ai/AiHost'));
const AgentCustomModal = lazy(() => import('./components/settings/AgentCustomModal'));
const ToolGatePanel = lazy(() => import('./components/ai/ToolGatePanel'));

/**
 * The pop-out AI window (Copilot "Move Chat into New Window").
 *
 * A second Zephyr window whose only job is the chat. It is deliberately
 * minimal — no activity bar, no editor, no terminal — so the chat gets the
 * whole surface, exactly like VSCode's floating Copilot window. The main
 * window stops rendering its own `<AiPanel/>` while in 'window' mode, so there
 * is still only ONE `ai-chunk` listener and tokens never double.
 */
export default function AiWindow() {
  useAiChunkListener();
  return (
    <div className="ai-window-root" data-testid="ai-window-root">
      <Suspense fallback={null}>
        <AiPanel />
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
