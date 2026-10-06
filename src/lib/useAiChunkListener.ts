import { useEffect } from 'react';
import { onAiChunk } from './events';
import { useAi } from './aiStore';

/**
 * Bind the `ai-chunk` stream listener for the current window.
 *
 * Each Tauri window is its own JS context with its own `useAi` store, so a
 * window that shows the chat (the main editor OR the pop-out AI window) must
 * bind its own listener. `app.emit` on the Rust side broadcasts to every
 * window, but a window only acts on chunks for the sessions IT drives, so
 * there is no cross-window double-token: the risk is two listeners in the SAME
 * context, which the module guard in App.tsx already prevents.
 *
 * This hook is the minimal version for the pop-out window, which does not mount
 * the full App effect chain.
 */
export function useAiChunkListener(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void useAi.getState().init();
    void onAiChunk((c) => useAi.getState().onChunk(c)).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
}
