import { create } from 'zustand';
import { useStore } from './store';

/**
 * The sections of the Chat Settings page, by id.
 *
 * Declared here rather than derived from the page's own `SECTIONS` table so the
 * callers that only want to NAME a destination — the chat's key banner, the
 * model picker, the sub-agent panel — do not have to import a 1,600-line React
 * component to say "Models". The page keeps its own table; a section added there
 * and forgotten here fails to compile at the call sites that asked for it.
 */
export type ChatSeksi =
  | 'mode'
  | 'agent'
  | 'context'
  | 'subagent'
  | 'tools'
  /* Konten web: izin isi web + allowlist host, pagar semua tool web. */
  | 'web'
  | 'rules'
  | 'models'
  | 'appearance'
  | 'session'
  | 'advanced';

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
  /**
   * The section the page should open on, when a caller asked for one.
   *
   * `null` means "the page's own default". It exists because every door INTO
   * this page now names where it is sending the reader: the API-key banner in
   * the chat, the model picker's "edit" row and the sub-agent panel all used to
   * open the editor-area Settings page at a section — which is the page they no
   * longer belong to. A door that lands on the top of the page and leaves the
   * reader to find the row is a door that lost the argument for opening at all.
   */
  seksi: ChatSeksi | null;
  /** Open as the floating overlay (the "…" menu's behaviour). */
  setBuka: (v: boolean) => void;
  /** Open the floating overlay straight on one section. */
  bukaDi: (seksi: ChatSeksi) => void;
  /** The page has consumed `seksi`, so a later open starts at the default. */
  seksiTerpakai: () => void;
  /** Move the open page into a real editor tab. */
  keEditor: () => void;
  tutup: () => void;
}

export const useAiChatSettings = create<ChatSettingsState>((set) => ({
  buka: false,
  seksi: null,
  /*
   * Opening from the "…" menu clears any target: that row says "Chat Settings"
   * and names no section, so landing on whatever the last caller asked for would
   * make the plain door the least predictable one. (Providers, keys and the model
   * list are not sections of this page at all - they open the AI Models pop-up,
   * which is a door of its own and goes through `useAiModels`, not this store.)
   */
  setBuka: (v) => set({ buka: v, seksi: null }),
  bukaDi: (seksi) => set({ buka: true, seksi }),
  seksiTerpakai: () => set({ seksi: null }),
  keEditor: () => {
    /* Close the overlay first, then open the tab. The other order leaves the
       overlay hanging over the editor for a frame, and the reader sees the same
       page twice. `seksi` survives on purpose: the tab is the same page, and it
       should open on the section the overlay was asked for. */
    set({ buka: false });
    useStore.getState().bukaViewAi('chat-settings');
  },
  tutup: () => set({ buka: false, seksi: null }),
}));
