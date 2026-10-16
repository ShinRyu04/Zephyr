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
    /*
     * Route each chunk to the store that is actually RENDERING this window.
     *
     * `useAi` is imported here, but a module can be evaluated twice (an HMR
     * boundary, or a window that ends up with two copies), and each `create()`
     * is a separate store. Closing over this import then binds the listener to
     * an instance the UI does not read: chunks arrive - the Tauri listener
     * demonstrably fires - and disappear into a store nobody displays, so the
     * bubble stays empty and `agentBusy` is never cleared. That is the reported
     * "the agents chat always thinks, there is no reply".
     *
     * `__ZEPHYR_AI_STORE__` is set by whichever copy mounted first, which is
     * the one React renders; reading it per chunk costs one property lookup and
     * removes the whole class of bug.
     */
    void onAiChunk((c) => (window.__ZEPHYR_AI_STORE__ ?? useAi).getState().onChunk(c)).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
}
