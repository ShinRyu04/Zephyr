import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import * as cmd from '../../lib/commands';

/**
 * A browser view for the Agents window's right column.
 *
 * This is NOT `BrowserPane` (components/terminal/BrowserPane.tsx). That one is
 * a TERMINAL PANE: it takes a `PaneMeta`, writes the URL back through
 * `useTerminal.setPaneUrl`, and lives inside the terminal grid's layout and
 * lifecycle. Mounting it here would either crash on a pane that does not exist
 * or hijack a real terminal pane's state.
 *
 * So this drives the SAME Rust side (`browser_pane_open` and friends, which are
 * keyed by a pane id of the caller's choosing) with its own id and its own
 * bounds, which is exactly what the Rust API was shaped for.
 *
 * The child webview is a NATIVE overlay positioned by rectangle, not an
 * iframe: `ResizeObserver` keeps its bounds in step with the container, since
 * nothing repositions it on its own when the column is resized.
 */
const PANE_ID = 'agents-browser';

export default function AgentsBrowser() {
  const tr = useT();
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [galat, setGalat] = useState('');
  const [siap, setSiap] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const adaRef = useRef(false);

  /* Create the webview once, on the first non-zero measurement. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let hidup = true;

    const sync = async (buat: boolean) => {
      const r = el.getBoundingClientRect();
      /* A zero rect is not a position. Sending it pins the webview to the
         window's top-left corner, over the whole UI, with no way to move it —
         the container has not been laid out yet on the first frames. */
      if (r.width < 2 || r.height < 2) return;
      if (!hidup) return;

      try {
        if (buat && !adaRef.current) {
          await cmd.browserPaneOpen({
            paneId: PANE_ID,
            url: url || 'about:blank',
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          });
          adaRef.current = true;
          if (hidup) setSiap(true);
        } else if (adaRef.current) {
          await cmd.browserPaneBounds({
            paneId: PANE_ID,
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          });
        }
      } catch (e) {
        if (hidup) setGalat(String(e));
      }
    };

    void sync(true);
    const ro = new ResizeObserver(() => void sync(false));
    ro.observe(el);

    return () => {
      hidup = false;
      ro.disconnect();
      /* Closing the column (or switching tab) takes the webview with it; a
         native overlay left behind would float over whatever came next. */
      if (adaRef.current) {
        adaRef.current = false;
        void cmd.browserPaneClose(PANE_ID).catch(() => {});
      }
    };
    /* `url` is read inside but must NOT retrigger: the effect owns the
       webview's LIFETIME, and re-running it would tear the pane down and
       rebuild it on every keystroke in the address bar. Navigating is a
       separate effect below. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Navigate when the reader commits an address. */
  useEffect(() => {
    if (!siap || !url) return;
    void cmd
      .browserPaneOpen({
        paneId: PANE_ID,
        url,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      })
      .catch(() => {
        /* A rejected URL is reported by Rust and surfaced on the next read;
           navigating is not the place to raise it. */
      });
  }, [url, siap]);

  const buka = () => {
    const t = draft.trim();
    if (!t) return;
    const denganSkema = /^https?:\/\//i.test(t)
      ? t
      : /^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)
        ? `http://${t}`
        : `https://${t}`;
    setGalat('');
    setUrl(denganSkema);
  };

  return (
    <div className="ag-browser" data-testid="ag-browser">
      <div className="ag-browser-bar">
        <input
          className="ag-browser-url"
          data-testid="ag-browser-url"
          placeholder={tr('Enter a URL…')}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              buka();
            }
          }}
        />
        <button
          className="ag-browser-go"
          data-testid="ag-browser-go"
          title={tr('Go')}
          aria-label={tr('Go')}
          onClick={buka}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.4 8h9.2M9 4.4L12.6 8L9 11.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {galat && (
        <p className="ag-browser-galat" role="alert">
          {galat}
        </p>
      )}

      {/* The stage is empty in the DOM on purpose: it is only a RECTANGLE the
          native webview is positioned over, so it must stay a plain block with
          no children of its own. */}
      <div className="ag-browser-stage" ref={stageRef} data-testid="ag-browser-stage" />
    </div>
  );
}
