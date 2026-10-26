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
  | 'rules'
  | 'models'
  | 'appearance'
  | 'session'
  | 'advanced';

/*
 * Chat Settings: WHICH WINDOW, not whether an overlay is open.
 *
 * The page used to have two homes - a floating overlay over the chat and a real
 * editor tab - and this store owned both flags. It has three now (overlay, tab,
 * and its own OS window), and the overlay is gone: it was the one that could be
 * maximized while keeping a leftover drag offset, which painted the left rail
 * over the content.
 *
 * The actions are kept, and they OPEN THE WINDOW. Every door in the app calls
 * `bukaDi`/`setBuka` (the chat's key banner, the model picker, the sub-agent
 * panel, the CLI's `/config`), and changing a dozen call sites to a new name is
 * how one of them gets missed and silently opens nothing. `buka` stays in the
 * shape only so those call sites keep compiling; it no longer means "overlay is
 * on screen".
 *
 * `seksi` is still tracked, because `ChatSettingsPage` reads it when it is
 * hosted in the editor tab. For the window it travels in the URL instead - the
 * window is a separate WebView and cannot see this store.
 */
interface ChatSettingsState {
  /** Always false: there is no overlay to open. Kept for older callers. */
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
  /** Open the Chat Settings WINDOW. */
  setBuka: (v: boolean) => void;
  /** Open the Chat Settings window straight on one section. */
  bukaDi: (seksi: ChatSeksi) => void;
  /**
   * How many rows differ from their defaults, and the action that acknowledges
   * them. Published by `ChatSettingsPage` so the WINDOW's title bar can draw the
   * Save button.
   *
   * WHY A STORE and not a prop: the page is rendered deep inside `PanelWindow`,
   * and the title bar is its sibling ABOVE it. Passing a button up through the
   * tree would mean either duplicating the row-diff calculation (two counts that
   * can disagree) or threading a ref through four components. The page is the
   * only thing that knows what "changed" means, so it publishes the answer and
   * the bar renders it.
   */
  kotor: number;
  setKotor: (n: number) => void;
  simpan: (() => void) | null;
  setSimpan: (fn: (() => void) | null) => void;
  /** The page has consumed `seksi`, so a later open starts at the default. */
  seksiTerpakai: () => void;
  /** Move the open page into a real editor tab. */
  keEditor: () => void;
  tutup: () => void;
}

export const useAiChatSettings = create<ChatSettingsState>((set) => ({
  buka: false,
  seksi: null,
  kotor: 0,
  setKotor: (n) => set({ kotor: n }),
  simpan: null,
  setSimpan: (fn) => set({ simpan: fn }),
  setBuka: (v) => {
    set({ buka: false, seksi: null });
    if (v) void import('./bukaPanel').then((m) => m.bukaPanel('chat-settings'));
  },
  bukaDi: (seksi) => {
    set({ buka: false, seksi });
    void import('./bukaPanel').then((m) => m.bukaPanel('chat-settings', seksi));
  },
  seksiTerpakai: () => set({ seksi: null }),
  keEditor: () => {
    /* The TAB home is a real `Tab` in the editor store (`view:
       'chat-settings'`), so this is the one action that still belongs here: it
       opens that tab and leaves the store alone. `seksi` survives on purpose -
       the tab is the same page and should open on the section that was asked
       for. */
    set({ buka: false });
    useStore.getState().bukaViewAi('chat-settings');
  },
  tutup: () => set({ buka: false, seksi: null }),
}));
