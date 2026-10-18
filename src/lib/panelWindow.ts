import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';

/*
 * Open a panel as its OWN window.
 *
 * THE DECISION: these panels are windows, not dialogs.
 *
 * They used to be popups floating over the editor, and every one of them had
 * the same defect when maximized: the card filled the window while a drag
 * offset or a leftover centring translate stayed applied, so the left rail was
 * painted over the content pane and the bottom edge fell off screen. That is a
 * layout bug that can be patched, but the deeper problem is that a settings page
 * is not a dialog - it is a workspace surface the reader keeps open beside their
 * code, moves to a second monitor, or pushes behind the editor. Zed and VS Code
 * both treat their settings and extension pages as real windows for exactly
 * this reason.
 *
 * FRAMELESS, WITH OUR OWN BAR (`decorations: false`). The OS title bar on
 * Windows is a light grey strip that belongs to Explorer, not to the app: it
 * does not follow the theme, so a dark Zephyr window sat under a pale bar, and
 * it painted the Zephyr logo plus "Zephyr — " in front of every title. The app's
 * main window already draws its own bar for the same reason; these windows now
 * do too (`PanelTitleBar.tsx`), which is what makes the whole surface - bar and
 * page - one colour.
 *
 * A frameless window loses the platform's edge-drag, so `PanelTitleBar` carries
 * its own resize handles (`startResizeDragging`) on all eight edges. Without
 * them a frameless window can only be resized by the maximize button, which is
 * not a window a reader can live with.
 *
 * HOW IT WORKS WITHOUT A SECOND COPY OF THE PAGE: the window loads the same
 * bundle with `#panel=<id>`, and `main.tsx` routes that hash to `<PanelWindow/>`
 * instead of the full editor. `PanelWindow` renders the SAME page components
 * the app renders, so a setting can never exist in one home and not the other.
 *
 * SYNCHRONISATION: both windows read and write the same settings file through
 * the Rust side, which emits `settings-changed`; `store.ts` listens and reloads.
 * A theme changed in the Settings window therefore repaints the editor window
 * immediately, and the title bar here re-reads the same tokens.
 */

export type PanelId =
  | 'settings'
  | 'extensions'
  | 'tools'
  | 'models'
  | 'chat-settings'
  | 'agent-custom';

const AWALAN = 'panel-';

/*
 * Bare titles: `Settings`, not `Zephyr — Settings`.
 *
 * The window is already Zephyr - it is in the taskbar under the app's own icon
 * and there is exactly one of each. Prefixing every title with the product name
 * spent the first two words of a narrow bar repeating something the reader
 * already knew, and in the frameless bar it also left the logo glued to the
 * left of every panel. These strings are the whole title.
 */
export const JUDUL: Record<PanelId, string> = {
  settings: 'Settings',
  extensions: 'Extensions',
  tools: 'Tools',
  models: 'AI Models',
  'chat-settings': 'Chat Settings',
  'agent-custom': 'Agent Customizations',
};

/** Default size per panel: each page has a shape that reads best at some size. */
const UKURAN: Record<PanelId, { width: number; height: number; minWidth: number; minHeight: number }> = {
  settings: { width: 1180, height: 820, minWidth: 620, minHeight: 460 },
  extensions: { width: 1120, height: 800, minWidth: 560, minHeight: 420 },
  tools: { width: 1240, height: 840, minWidth: 620, minHeight: 460 },
  models: { width: 1040, height: 780, minWidth: 520, minHeight: 400 },
  'chat-settings': { width: 1120, height: 820, minWidth: 560, minHeight: 420 },
  'agent-custom': { width: 1200, height: 840, minWidth: 640, minHeight: 480 },
};

/** Stable window label for a panel, so it can be found again. */
export const labelPanelWindow = (id: PanelId): string => `${AWALAN}${id}`;

export const SEMUA_PANEL: PanelId[] = [
  'settings',
  'extensions',
  'tools',
  'models',
  'chat-settings',
  'agent-custom',
];

/**
 * Read the panel id out of the URL hash (`#panel=settings`, `#panel=chat-settings&s=context`).
 *
 * Compared by exact key and validated against the known ids: an unknown value
 * must not send the window to a blank page with no way to tell why.
 */
export function panelDariHash(hash: string): PanelId | null {
  const bersih = hash.replace(/^#/, '').split('&')[0] ?? '';
  if (!bersih.startsWith('panel=')) return null;
  const id = bersih.slice('panel='.length) as PanelId;
  return SEMUA_PANEL.includes(id) ? id : null;
}

/**
 * The section a panel window was asked to open on (`#panel=chat-settings&s=context`).
 *
 * It travels in the URL rather than through a store because the target is a
 * DIFFERENT WebView with its own zustand instances: a flag set in the opening
 * window would be invisible in the opened one.
 */
export function seksiDariHash(hash: string): string | null {
  const bersih = hash.replace(/^#/, '');
  const i = bersih.indexOf('&s=');
  if (i < 0) return null;
  const s = decodeURIComponent(bersih.slice(i + 3));
  return s || null;
}

/** Open (or focus) a panel in its own window. */
export async function bukaPanelWindow(id: PanelId, seksi?: string): Promise<void> {
  const label = labelPanelWindow(id);
  const url = `index.html#panel=${id}${seksi ? `&s=${encodeURIComponent(seksi)}` : ''}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    /* A window that is minimized or behind the editor must COME FORWARD, not
       merely take focus: `setFocus` on a minimized window leaves it minimized,
       so the second click on the gear looked like nothing happened. */
    await existing.unminimize().catch(() => {});
    await existing.setFocus().catch(() => {});
    /*
     * A different section was asked for, and focusing alone would leave the
     * window showing whatever it showed before. The section travels as a hash,
     * so it is set by EMITTING a Tauri event the panel window listens for -
     * `WebviewWindow` has no `eval` in this API version, and a hash assignment
     * from here would only change THIS window's URL.
     */
    if (seksi) {
      await emitTo(label, 'panel-section', { id, seksi }).catch(() => {});
    }
    return;
  }
  const u = UKURAN[id];
  const w = new WebviewWindow(label, {
    url,
    title: JUDUL[id],
    width: u.width,
    height: u.height,
    minWidth: u.minWidth,
    minHeight: u.minHeight,
    resizable: true,
    /* Frameless: `PanelTitleBar` is the frame. See the header comment. */
    decorations: false,
    center: true,
    /* The page paints its own background from the theme tokens; a native white
       flash before the first paint would read as a broken window on a dark
       theme. */
    backgroundColor: '#1e1e1e',
  });
  await new Promise<void>((resolve) => {
    void w.once('tauri://created', () => resolve());
    void w.once('tauri://error', () => resolve());
  });
}

/** Close a panel window if it exists. */
export async function tutupPanelWindow(id: PanelId): Promise<void> {
  const existing = await WebviewWindow.getByLabel(labelPanelWindow(id));
  if (existing) await existing.close();
}

/** Close every panel window. Used when the editor window closes. */
export async function tutupSemuaPanel(): Promise<void> {
  await Promise.all(SEMUA_PANEL.map((id) => tutupPanelWindow(id)));
}
