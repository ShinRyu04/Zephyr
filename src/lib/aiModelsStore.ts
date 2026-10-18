import { create } from 'zustand';

/**
 * The "AI Models" panel - deliberately NOT part of Settings.
 *
 * The same reasoning as Agent Customizations, which this panel is modelled on:
 * provider, API key, base URL, model list and answer language/style are about
 * what the assistant IS, and the reader needs them exactly when something is
 * wrong in the chat in front of them (a 401 notice, an empty model dropdown).
 * Sending them to a Settings page - first the editor-area one, then Chat
 * Settings -> Models - meant crossing the window to fix a thing that is broken
 * here.
 *
 * IT IS A WINDOW NOW. It used to be a floating card (`AiModelsModal`), which
 * meant this store owned its visibility. It does not any more: the window either
 * exists or it does not, and the platform is the authority on that. `buka` still
 * exists and still opens the panel, because a dozen call sites ask for it by
 * this name and renaming them is how one gets missed and silently opens nothing.
 *
 * `open` is therefore ALWAYS false, and is kept only so older callers that read
 * it keep compiling. Nothing renders it.
 */
interface AiModelsState {
  /** Always false: there is no in-app card to show. Kept for older callers. */
  open: boolean;
  buka: () => void;
  tutup: () => void;
}

export const useAiModels = create<AiModelsState>((set) => ({
  open: false,
  buka: () => {
    set({ open: false });
    void import('./bukaPanel').then((m) => m.bukaPanel('models'));
  },
  /* Closing a window from another window is the platform's job (the title bar's
     ✕); this stays a no-op so the shape of the store does not change under the
     callers that still call it. */
  tutup: () => set({ open: false }),
}));
