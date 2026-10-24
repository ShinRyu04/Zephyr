import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';

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

/**
 * The label of the window that opened this panel (`#panel=tools&from=main`).
 *
 * `null` when the panel was loaded directly - then there is no opener to ask,
 * and callers must treat the store bridge as unavailable rather than guessing.
 */
export function pembukaDariHash(hash: string): string | null {
  const bersih = hash.replace(/^#/, '');
  const i = bersih.indexOf('&from=');
  if (i < 0) return null;
  const s = decodeURIComponent(bersih.slice(i + 6));
  return s || null;
}

/*
 * ONE STORE, REACHABLE FROM EVERY PANEL.
 *
 * `#panel=extensions` hosts only the extensions page: it has no tabs, no
 * activity bar and no sidebar. So "close the page that opened me", "put the
 * rail back on explorer" and "undo the settings this run touched" are not things
 * that window can do for itself - those actions belong to the OPENER's store,
 * and a separate WebView has a separate zustand instance.
 *
 * THE DOOR is the Tauri event bus, which both windows already share:
 *   panel  -> emitTo('zephyr-store', { aksi, arg })   // caller's window is named in `sumber`
 *   opener -> runs the action on its own useStore, then emitTo(sumber, 'zephyr-store-hasil', ...)
 *
 * `emitTo` needs a target label, and a panel does not know which window opened
 * it - so the caller names itself in the payload and the result comes back to
 * that label. Handlers are registered ONCE per module (the StrictMode double
 * mount would otherwise run every action twice, the same trap the `pty-output`
 * and `ai-chunk` listeners hit).
 */
const AKSI_STORE = 'zephyr-store';
const HASIL_STORE = 'zephyr-store-hasil';

/**
 * Handle a store request from a panel window.
 *
 * `get` returns `{ ok, value }`, `set` accepts a patch object, `reset` closes
 * every tab and returns the rail to the explorer. Anything else is answered
 * with `ok:false` rather than silently doing nothing - a panel that asks for an
 * action that was renamed must be told, not left guessing.
 */
export function pasangJembatanStore(): void {
  if (jembatanStoreTerpasang) return;
  jembatanStoreTerpasang = true;
  void listen<{ aksi?: string; patch?: unknown; sumber?: string }>(AKSI_STORE, (ev) => {
    const p = ev.payload ?? {};
    const sumber = typeof p.sumber === 'string' ? p.sumber : '';
    if (!sumber) return;
    void jawabPermintaanStore(p, sumber);
  });
}

/**
 * Run one store request on THIS window and send the answer back to its asker.
 *
 * Split out of the listener so the failure path is visible: an action that
 * throws still answers `ok:false`, because a panel that gets no reply at all
 * cannot tell "the opener refused" from "the window is gone".
 */
async function jawabPermintaanStore(
  p: { aksi?: string; patch?: unknown },
  sumber: string,
): Promise<void> {
  let value: unknown = null;
  let ok = true;
  try {
    const { useStore } = await import('./store');
    if (p.aksi === 'get') value = useStore.getState();
    else if (p.aksi === 'set') useStore.setState(p.patch as object, false);
    else if (p.aksi === 'reset') {
      const st = useStore.getState();
      st.tabs.slice().forEach((t) => st.forceCloseTab(t.id));
      st.setSettingsOpen(false);
      st.setActivity('explorer');
      st.setFindOpen(false);
    } else ok = false;
  } catch (e) {
    ok = false;
    value = String(e);
  }
  await emitTo(sumber, HASIL_STORE, { ok, value }).catch(() => {});
}

let jembatanStoreTerpasang = false;

/**
 * Ask the window that opened this panel to act on ITS store.
 *
 * Used from a panel window, where `useStore` is a different instance with no
 * tabs and no rail. Resolves to `null` when no opener answers - a panel opened
 * directly (or in a plain browser) must not hang on a door that has nobody
 * behind it, so the caller gets "no answer" instead of a rejected promise it
 * would have to catch everywhere.
 */
export async function mintaStoreUtama<T = unknown>(
  aksi: 'get' | 'reset' | 'set',
  patch?: unknown,
  timeoutMs = 3000,
): Promise<T | null> {
  try {
    const sumber = getCurrentWebviewWindow().label;
    const tujuan = pembukaDariHash(window.location.hash);
    /* Loaded without an opener (a plain browser tab): nobody to ask. */
    if (!tujuan || tujuan === sumber) return null;
    /*
     * THE LISTENER MUST BE LIVE BEFORE THE QUESTION GOES OUT.
     *
     * `listen` resolves asynchronously, and the opener answers in a few
     * milliseconds. Firing the request first and only then awaiting the
     * registration lost every reply: the panel sat on "no answer" for the whole
     * timeout while the opener had already answered into an empty bus. Await the
     * registration, then ask.
     */
    let selesai = false;
    let unlisten: (() => void) | null = null;
    const jawab = new Promise<T | null>((resolve) => {
      const jaring = setTimeout(() => resolve(null), timeoutMs);
      void listen<{ ok: boolean; value: unknown }>(HASIL_STORE, (ev) => {
        if (selesai) return;
        selesai = true;
        clearTimeout(jaring);
        resolve(ev.payload?.ok ? ((ev.payload.value as T) ?? null) : null);
      }).then((u) => {
        /* A reply that arrived while registering was dropped by the bus; ask
           again now that the door is open instead of timing out. */
        unlisten = u as () => void;
        if (selesai) (unlisten as () => void)();
        else void emitTo(tujuan, AKSI_STORE, { aksi, patch, sumber });
      });
    });
    const hasil = await jawab;
    selesai = true;
    if (unlisten) (unlisten as () => void)();
    return hasil;
  } catch {
    return null;
  }
}

/** Open (or focus) a panel in its own window. */
export async function bukaPanelWindow(id: PanelId, seksi?: string): Promise<void> {
  const label = labelPanelWindow(id);
  /*
   * THE OPENER'S LABEL RIDES IN THE URL.
   *
   * A panel answers its opener over the shared event bus, and `emitTo` needs a
   * target label. A fresh WebView has no idea which window asked for it, and
   * there is no Tauri API that reports "my opener" - so the opener writes its
   * own name into the hash when it opens the window. Without this the reply was
   * emitted with the PANEL's own label as the target, which reached nobody and
   * made every cross-window request time out.
   */
  const dari = getCurrentWebviewWindow().label;
  const url =
    `index.html#panel=${id}${seksi ? `&s=${encodeURIComponent(seksi)}` : ''}` +
    `&from=${encodeURIComponent(dari)}`;
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
