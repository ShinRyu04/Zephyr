import { create } from 'zustand';

/*
 * Chat Settings: whether it is open, and where.
 *
 * TWO HOMES, one page. VSCode opens its chat settings as a small overlay for a
 * quick change, and offers a button to keep it as a real editor tab when the
 * reader wants to stay. This store carries that choice so the two surfaces
 * cannot both think they own the page.
 *
 *   'popup'  — floats over the chat. Opens from the "…" menu.
 *   'editor' — takes the editor area, like Settings. Reached from the popup's
 *              "Open in Editor" button.
 *
 * A store rather than local state because the triggers and the surfaces live in
 * different subtrees: the "…" menu is in the chat header, the popup floats in
 * the chat panel, and the page is drawn by `SplitEditor`.
 */
export type ChatSettingsMode = 'popup' | 'editor';

interface ChatSettingsState {
  buka: boolean;
  mode: ChatSettingsMode;
  /** Open as the floating overlay (the "…" menu's behaviour). */
  setBuka: (v: boolean) => void;
  /** Move the open page into the editor area. */
  keEditor: () => void;
  tutup: () => void;
}

export const useAiChatSettings = create<ChatSettingsState>((set) => ({
  buka: false,
  mode: 'popup',
  /* Always opens as the popup: the editor home is something the reader asks for
     from inside it, not the default, so the same menu item gives the same
     result every time. */
  setBuka: (v) => set({ buka: v, mode: v ? 'popup' : 'popup' }),  keEditor: () => set({ buka: true, mode: 'editor' }),
  tutup: () => set({ buka: false, mode: 'popup' }),
}));
