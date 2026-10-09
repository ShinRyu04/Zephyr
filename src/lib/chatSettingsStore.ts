import { create } from 'zustand';

/*
 * Whether the Chat Settings popup is open.
 *
 * A store rather than local state because the popup is opened from one place
 * (the "…" menu in `ChatHeadActions`) and rendered in another (`AiPanel`'s body,
 * where it can float over the conversation). Prop-drilling across those two
 * subtrees would thread a setter through the tab strip and the whole transcript.
 */
interface ChatSettingsState {
  buka: boolean;
  setBuka: (v: boolean) => void;
  tutup: () => void;
}

export const useAiChatSettings = create<ChatSettingsState>((set) => ({
  buka: false,
  setBuka: (v) => set({ buka: v }),
  tutup: () => set({ buka: false }),
}));
