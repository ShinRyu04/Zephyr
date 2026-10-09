import { create } from 'zustand';

/*
 * Whether the Chat Settings page is open.
 *
 * A store rather than local state because the page is opened from one place
 * (the "…" menu in `ChatHeadActions`) and rendered in another: it takes over the
 * EDITOR AREA, the same way Settings does, so the surface that draws it is
 * `SplitEditor` and the surface that opens it is the chat header. Threading a
 * setter between those two subtrees would thread it through the whole app.
 *
 * A PAGE rather than a popover, at the reader's request: VS Code's chat settings
 * are a full searchable page (its `@feature:chat` view), and a small popup has
 * no room for the hints that make a setting findable.
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
