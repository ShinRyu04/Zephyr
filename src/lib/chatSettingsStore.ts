import { create } from 'zustand';
import { useStore } from './store';

/*
 * Chat Settings: whether the floating overlay is open.
 *
 * TWO HOMES, one page. VSCode opens its chat settings as a small overlay for a
 * quick change, and offers a button to keep it as a real editor tab when the
 * reader wants to stay.
 *
 *   overlay — floats over the chat. Opens from the "…" menu.
 *   tab     — a real editor tab, in the tab strip beside the files.
 *
 * The TAB home does not live here any more. It is a real `Tab` in the editor
 * store (`view: 'chat-settings'`), so this store has nothing to say about it:
 * `keEditor` opens that tab and then the overlay is done, and closing the tab
 * is what closes the page — the same way the X on a file tab closes a file.
 * Keeping a second flag here for "the page is open in the editor" is what made
 * the old version unable to say which of the two surfaces owned the screen, and
 * it is why `SplitEditor` had to grow a branch that hid the tab strip.
 */
interface ChatSettingsState {
  buka: boolean;
  /** Open as the floating overlay (the "…" menu's behaviour). */
  setBuka: (v: boolean) => void;
  /** Move the open page into a real editor tab. */
  keEditor: () => void;
  tutup: () => void;
}

export const useAiChatSettings = create<ChatSettingsState>((set) => ({
  buka: false,
  setBuka: (v) => set({ buka: v }),
  keEditor: () => {
    /* Close the overlay first, then open the tab. The other order leaves the
       overlay hanging over the editor for a frame, and the reader sees the same
       page twice. */
    set({ buka: false });
    useStore.getState().bukaViewAi('chat-settings');
  },
  tutup: () => set({ buka: false }),
}));
