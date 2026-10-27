import { useStore } from './store';
import { bukaPanelWindow, type PanelId } from './panelWindow';

/*
 * One door for every panel, used by every caller.
 *
 * The panels used to be popups, and every one of them had a "open in a new
 * window" button inside it - which meant the reader had to open a popup to
 * discover they could have a window instead. This removes that step: asking for
 * a panel opens the window, and there is no popup left to open.
 *
 * WHY THE POPUP FLAGS ARE CLEARED, NOT SET: `settingsOpen`, `extensionsOpen` and
 * `toolsOpen` still exist in the store because saved state and a dozen older
 * call sites reference them, but nothing renders them any more. Leaving one true
 * would be a flag that lies about the screen - and if a future change ever did
 * render it again, the reader would get the popup AND the window, which is
 * exactly the "there are two of these" report.
 */

/** Which store flag belongs to each panel, if any. */
const FLAG: Partial<Record<PanelId, (v: boolean) => void>> = {
  settings: (v) => useStore.getState().setSettingsOpen(v),
  extensions: (v) => useStore.getState().setExtensionsOpen(v),
  tools: (v) => useStore.getState().setToolsOpen(v),
};

/**
 * Open a panel in its own window, closing any stale popup flag for it.
 *
 * `seksi` names the section to land on. It travels in the URL hash rather than
 * through a store, because the target is a DIFFERENT WebView with its own store
 * instances: a flag set here would be invisible there. `PanelWindow` reads it
 * and hands it to the page as its initial section.
 */
export function bukaPanel(id: PanelId, seksi?: string, opsi?: { baru?: boolean }): void {
  FLAG[id]?.(false);
  void bukaPanelWindow(id, seksi, opsi);
}
