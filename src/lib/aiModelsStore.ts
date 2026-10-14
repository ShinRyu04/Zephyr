import { create } from 'zustand';

/**
 * The "AI Models" pop-up, a modal of its own - deliberately NOT part of Settings.
 *
 * The same reasoning as Agent Customizations, which this modal is modelled on:
 * provider, API key, base URL, model list and answer language/style are about
 * what the assistant IS, and the reader needs them exactly when something is
 * wrong in the chat in front of them (a 401 notice, an empty model dropdown).
 * Sending them to a Settings page - first the editor-area one, then Chat
 * Settings -> Models - meant crossing the window to fix a thing that is broken
 * here.
 *
 * Only "is it open" lives here. Which provider is active, which keys exist and
 * what the model list holds all stay in the stores that already own them, so
 * this pop-up is a place to stand, not a second copy of any state.
 */
interface AiModelsState {
  open: boolean;
  buka: () => void;
  tutup: () => void;
}

export const useAiModels = create<AiModelsState>((set) => ({
  open: false,
  buka: () => set({ open: true }),
  tutup: () => set({ open: false }),
}));
