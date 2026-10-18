import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useT } from '../../lib/i18n';

/*
 * The resize directions the window API accepts. Declared here because the
 * package types them locally and does not export the union: importing it fails
 * at compile time, and hand-writing the eight strings at each call site would
 * let a typo through (an unknown direction is rejected at runtime, silently
 * leaving the edge undraggable).
 */
type ArahResize =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

/*
 * The title bar of a panel window.
 *
 * WHY THIS EXISTS AT ALL: the panel windows are frameless (`decorations: false`
 * in `panelWindow.ts`). Windows' own title bar is a pale grey strip that belongs
 * to the OS rather than to the app, so on a dark theme the window sat under a
 * bar that did not match anything inside it, and it stamped the Zephyr logo and
 * "Zephyr — " in front of every title. Drawing the bar ourselves is what makes
 * bar and page one colour, and it is what lets the title be just "Settings".
 *
 * WHAT IT OWES THE READER, since the OS is no longer providing it:
 *
 *   drag      the whole empty bar is a drag region
 *   resize    eight invisible edge/corner handles, because a frameless window
 *             otherwise cannot be resized by dragging at all
 *   controls  minimize / maximize-restore / close, in the platform's order and
 *             with the platform's own glyphs (— □ ✕ on the same 10px grid the
 *             main window's controls use, so the two windows read alike)
 *   double-click on the bar maximizes, like every other Windows window
 *
 * NO LOGO, NO PRODUCT NAME. Both were in the OS title and both were noise: the
 * window already appears under Zephyr's icon in the taskbar, and there is
 * exactly one of each panel, so "Zephyr — Settings" spent the first two words of
 * a narrow bar saying what the reader already knew.
 *
 * THE COLOURS COME FROM THE THEME TOKENS, not from literals: `--titlebar-bg`
 * falls back to `--surface`, the same pair the main window's bar uses, so a
 * theme switch repaints this bar with no code here knowing which theme is on.
 */

const TINGGI = 34;

/* The eight edges. Each is a thin strip pinned to one side of the bar/window;
   `North`/`South` are handled by the bar itself plus a bottom strip. */
const TEPI: { dir: ArahResize; style: React.CSSProperties }[] = [
  { dir: 'North', style: { top: 0, left: 0, right: 0, height: 4, cursor: 'ns-resize' } },
  { dir: 'South', style: { bottom: 0, left: 0, right: 0, height: 4, cursor: 'ns-resize' } },
  { dir: 'West', style: { top: 0, bottom: 0, left: 0, width: 4, cursor: 'ew-resize' } },
  { dir: 'East', style: { top: 0, bottom: 0, right: 0, width: 4, cursor: 'ew-resize' } },
  { dir: 'NorthWest', style: { top: 0, left: 0, width: 10, height: 10, cursor: 'nwse-resize' } },
  { dir: 'NorthEast', style: { top: 0, right: 0, width: 10, height: 10, cursor: 'nesw-resize' } },
  { dir: 'SouthWest', style: { bottom: 0, left: 0, width: 10, height: 10, cursor: 'nesw-resize' } },
  { dir: 'SouthEast', style: { bottom: 0, right: 0, width: 10, height: 10, cursor: 'nwse-resize' } },
];

function IkonMinimize() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IkonMaximize({ restore }: { restore: boolean }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      {restore ? (
        <>
          <rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M3 2.5V1h6v6H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </>
      ) : (
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
      )}
    </svg>
  );
}

function IkonClose() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Every window call is best-effort: outside Tauri (a browser harness) there is
    no window object, and throwing there would take the whole page down. */
function jendela() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export default function PanelTitleBar({
  title,
  actions,
}: {
  title: string;
  /*
   * Page-specific controls, placed BEFORE the window controls.
   *
   * This exists so a page can stop drawing its own header bar. Chat Settings
   * used to render a second bar with the same title and its own Save button
   * directly under this one - the reader saw "Chat Settings" twice and two rows
   * of chrome for one window. Handing the page's controls to the frame is what
   * makes one bar serve both.
   */
  actions?: React.ReactNode;
}) {
  const tr = useT();
  const [maks, setMaks] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  /* Track the maximized state so the glyph and its label say the truth. The
     listener is bound once and released on unmount; StrictMode's double mount
     is harmless here because the unlisten is stored on the same closure. */
  useEffect(() => {
    const w = jendela();
    if (!w) return;
    let hidup = true;
    void w.isMaximized().then((v) => hidup && setMaks(v)).catch(() => {});
    const un = w.onResized(() => {
      void w.isMaximized().then((v) => hidup && setMaks(v)).catch(() => {});
    });
    return () => {
      hidup = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, []);

  const aksi = (fn: (w: NonNullable<ReturnType<typeof jendela>>) => Promise<unknown>) => {
    const w = jendela();
    if (!w) return;
    void fn(w).catch(() => {});
  };

  return (
    <>
      {/* Edge handles: sibling of the bar, not inside it, so a drag that starts
          on an edge never also starts a window move. */}
      {TEPI.map((t) => (
        <div
          key={t.dir}
          className="ptb-resize"
          style={{ position: 'fixed', zIndex: 2147483000, ...t.style }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            aksi((w) => w.startResizeDragging(t.dir));
          }}
          aria-hidden="true"
        />
      ))}

      <div
        className="ptb"
        ref={ref}
        data-testid="panel-titlebar"
        data-tauri-drag-region
        style={{ height: TINGGI }}
        onDoubleClick={() => aksi((w) => w.toggleMaximize())}
      >
        {/* The title is the ONLY thing on the left. No logo: see the header. */}
        <span className="ptb-title" data-tauri-drag-region data-testid="panel-titlebar-title">
          {title}
        </span>

        <span className="ptb-actions">
          {actions}
          <button
            className="ptb-btn"
            data-testid="panel-win-min"
            title={tr('win.minimize')}
            aria-label={tr('win.minimize')}
            onClick={() => aksi((w) => w.minimize())}
          >
            <IkonMinimize />
          </button>
          <button
            className="ptb-btn"
            data-testid="panel-win-max"
            title={maks ? tr('win.restore') : tr('win.maximize')}
            aria-label={maks ? tr('win.restore') : tr('win.maximize')}
            aria-pressed={maks}
            onClick={() => aksi((w) => w.toggleMaximize())}
          >
            <IkonMaximize restore={maks} />
          </button>
          <button
            className="ptb-btn is-close"
            data-testid="panel-win-close"
            title={tr('win.close')}
            aria-label={tr('win.close')}
            onClick={() => aksi((w) => w.close())}
          >
            <IkonClose />
          </button>
        </span>
      </div>
    </>
  );
}
