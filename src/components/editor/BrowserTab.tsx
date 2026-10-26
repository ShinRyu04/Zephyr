import { useCallback, useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as cmd from '../../lib/commands';
import { tx, useT } from '../../lib/i18n';
import { paneHarusTampil } from '../../lib/nativeOverlay';
import { useStore } from '../../lib/store';

/**
 * The pane id the browser child webview is registered under.
 *
 * A fixed string, NOT a random id: there is exactly one Browser tab, and the
 * id has to survive a remount (switching to another tab and back) so the
 * webview is reused instead of being torn down and recreated - a recreate
 * loses the page's scroll position and DOM state the agent may be reading.
 * Precedent: `AgentsPanelKananBrowser.tab` uses the same trick.
 */
export const PANE_BROWSER_TAB = 'tab-browser';

export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) {
    return `http://${s}`;
  }
  return `https://${s}`;
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${p}`.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

/*
 * The tab's home page.
 *
 * The dev server is the useful page while developing and nothing is listening
 * on it in an installed build, so pick per environment rather than hardcoding
 * localhost:5173 everywhere - that is how the old pane opened to a dead page.
 */
export const HOME = import.meta.env.DEV ? 'http://localhost:5173' : 'https://duckduckgo.com';

function Icon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The Browser, as an editor TAB rather than a terminal pane.
 *
 * It keeps the child-webview approach (not an iframe): the webview is owned by
 * this process, so the agent can read and drive its DOM, and sites that send
 * X-Frame-Options still load. The layout consequence is unchanged - the child
 * webview floats above the window at native coordinates, so it is positioned
 * and hidden continuously from the stage element's rect.
 *
 * WHY the address lives in the TAB and not in local state: `browser_open` has
 * to be able to retarget the one Browser tab from outside React. The store's
 * `bukaViewAi('browser', { url })` writes `tab.url`, this component follows it.
 */
export default function BrowserTab({ url }: { url?: string }) {
  const tr = useT();
  const setTabUrl = useStore((s) => s.setTabUrl);
  const [draft, setDraft] = useState(url ?? '');
  const [live, setLive] = useState({ url: url ?? '', title: '' });
  const [galat, setGalat] = useState('');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef(url ?? '');
  const siapRef = useRef(false);
  const urlSiapRef = useRef('');

  useEffect(() => {
    setDraft(url ?? '');
  }, [url]);

  useEffect(() => {
    urlRef.current = url ?? '';
  }, [url]);

  /**
   * Create the webview at the stage's rect, once the stage HAS a rect.
   *
   * The panel used to fall back to a hardcoded 0,0,800,600 when the container
   * measured 0x0, which pinned the webview to the window's top-left corner
   * forever. A zero-size stage is not a position, so it is never sent; the
   * ResizeObserver below calls again the moment the tab is actually laid out.
   */
  useEffect(() => {
    const kosong = !url || url === 'about:blank';
    if (kosong) {
      siapRef.current = false;
      urlSiapRef.current = '';
      void cmd.browserPaneClose(PANE_BROWSER_TAB).catch(() => {});
      return;
    }
    setGalat('');
    let batal = false;

    /*
     * Navigate when the url changes on an ALREADY open webview.
     *
     * WHY: `siapRef` says "a child webview exists", not "it already shows this
     * url". Guarding on it alone made the address bar work exactly once: after
     * the first navigation the webview was ready, so every later url was
     * dropped here and the pane kept rendering the old page — while the store
     * said otherwise, because the 900ms follow-the-page poll wrote the old url
     * straight back. Comparing against the url this webview actually loaded is
     * the only guard that distinguishes "nothing to do" from "second address".
     */
    if (siapRef.current && urlSiapRef.current === url) return;

    const buka = () => {
      if (batal || (siapRef.current && urlSiapRef.current === url)) return;
      const el = stageRef.current;
      const r = el?.getBoundingClientRect();
      if (!r || r.width < 4 || r.height < 4) return;
      void cmd
        .browserPaneOpen({
          paneId: PANE_BROWSER_TAB,
          url,
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height,
        })
        .then(() => {
          const basi = batal || !stageRef.current || urlRef.current !== url;
          if (basi) {
            siapRef.current = false;
            urlSiapRef.current = '';
            void cmd.browserPaneClose(PANE_BROWSER_TAB).catch(() => {});
            return;
          }
          siapRef.current = true;
          urlSiapRef.current = url;
        })
        .catch((e: unknown) => {
          siapRef.current = false;
          urlSiapRef.current = '';
          setGalat(String((e as Error)?.message ?? e));
        });
    };

    requestAnimationFrame(buka);
    const ro = new ResizeObserver(buka);
    if (stageRef.current) ro.observe(stageRef.current);
    const net = window.setInterval(buka, 500);
    return () => {
      batal = true;
      ro.disconnect();
      window.clearInterval(net);
    };
  }, [url]);

  /**
   * Close the webview when the tab goes away.
   *
   * A child webview lives in the Rust process, so nothing about unmounting a
   * React component removes it: without this it keeps painting over the app
   * with no way to close it.
   */
  useEffect(() => {
    return () => {
      siapRef.current = false;
      urlSiapRef.current = '';
      void cmd.browserPaneClose(PANE_BROWSER_TAB).catch(() => {});
    };
  }, []);

  /**
   * Keep the child webview glued to the stage.
   *
   * Event driven, not a 60Hz loop: the first version scanned the DOM 60 times a
   * second, forever, for a tab that may not even be visible. ResizeObserver
   * covers size changes, scroll/resize cover movement, MutationObserver on body
   * covers a modal opening or closing. The 500ms interval is only a safety net
   * for a parent re-layout that fires none of those.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !url) return;
    let kunciLalu = '';
    let terlihatLalu: boolean | null = null;
    let raf = 0;

    const tik = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const terlihat = paneHarusTampil(el);

      if (terlihat !== terlihatLalu) {
        terlihatLalu = terlihat;
        void cmd.browserPaneVisible(PANE_BROWSER_TAB, terlihat).catch(() => {});
      }
      if (terlihat) {
        const kunci = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (kunci !== kunciLalu) {
          kunciLalu = kunci;
          void cmd
            .browserPaneBounds({
              paneId: PANE_BROWSER_TAB,
              x: r.left,
              y: r.top,
              width: r.width,
              height: r.height,
            })
            .catch(() => {});
        }
      }
    };

    /** Coalesce every trigger into at most one measurement per frame. */
    const jadwalkan = () => {
      if (!raf) raf = requestAnimationFrame(tik);
    };

    const ro = new ResizeObserver(jadwalkan);
    ro.observe(el);
    window.addEventListener('resize', jadwalkan);
    window.addEventListener('scroll', jadwalkan, true);

    // Added or removed nodes only: watching attributes would fire on every
    // class change in the app.
    const mo = new MutationObserver(jadwalkan);
    mo.observe(document.body, { childList: true, subtree: true });

    const net = window.setInterval(jadwalkan, 500);
    jadwalkan();

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', jadwalkan);
      window.removeEventListener('scroll', jadwalkan, true);
      window.clearInterval(net);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [url]);

  /**
   * Follow the page: keep the address bar in sync when navigation happens
   * inside the webview (a link click, a redirect).
   *
   * Each poll is a cross-process round trip into WebView2, so it is skipped
   * entirely while the document is hidden and slowed in the background.
   */
  useEffect(() => {
    if (!url) return;
    let t = 0;
    const jeda = () => (document.hidden ? 3000 : 900);

    const tik = () => {
      if (siapRef.current && !document.hidden) {
        void cmd
          .browserPaneInfo(PANE_BROWSER_TAB)
          .then((i) => {
            setLive({ url: i.url, title: i.title });
            if (i.url && i.url !== urlRef.current) setTabUrl(PANE_BROWSER_TAB, i.url);
          })
          .catch(() => {});
      }
      t = window.setTimeout(tik, jeda());
    };
    t = window.setTimeout(tik, jeda());
    return () => window.clearTimeout(t);
  }, [url, setTabUrl]);

  const go = useCallback(
    (raw: string) => {
      const next = normalizeUrl(raw);
      if (!next) return;
      setGalat('');
      setTabUrl(PANE_BROWSER_TAB, next);
      setDraft(next);
    },
    [setTabUrl],
  );

  const nav = useCallback((aksi: string) => {
    void cmd.browserPaneNav(PANE_BROWSER_TAB, aksi).catch(() => {});
  }, []);

  const secure = live.url.startsWith('https://');

  return (
    <div className="browser-pane bp-tab-pane" data-pane-body={PANE_BROWSER_TAB} data-bp-blocked="0">
      <form
        className="bp-bar"
        onSubmit={(e) => {
          e.preventDefault();
          go(draft);
        }}
      >
        <button
          type="button"
          className="bp-btn"
          title={tx('Back')}
          aria-label={tx('Back')}
          data-testid="bp-back"
          onClick={() => nav('back')}
        >
          <Icon d="M9.8 3.5L5.3 8l4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title={tx('Forward')}
          aria-label={tx('Forward')}
          data-testid="bp-fwd"
          onClick={() => nav('forward')}
        >
          <Icon d="M6.2 3.5L10.7 8l-4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title={tx('Reload')}
          aria-label={tx('Reload')}
          data-testid="bp-reload"
          onClick={() => nav('reload')}
        >
          <Icon d="M13 8a5 5 0 11-1.7-3.8M13 2.6V5h-2.4" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title={`Home (${HOME})`}
          aria-label="Home"
          data-testid="bp-home"
          onClick={() => go(HOME)}
        >
          <Icon d="M3 7.4L8 3l5 4.4M4.4 6.9V13h7.2V6.9" />
        </button>

        <span
          className={`bp-lock is-${secure ? 'https' : 'http'}`}
          title={secure ? tr('HTTPS connection') : tr('Plain HTTP (no encryption)')}
          data-testid="bp-lock"
        >
          {secure ? (
            <Icon d="M4.8 7.2V5.6a3.2 3.2 0 016.4 0v1.6M4 7.2h8V13H4z" size={12} />
          ) : (
            <Icon d="M4 7.2h8V13H4zM6 7.2V5.6a2 2 0 013.6-1.2" size={12} />
          )}
        </span>

        <input
          className="bp-url"
          value={draft}
          spellCheck={false}
          aria-label={tx('URL address')}
          data-testid="bp-url"
          placeholder={HOME}
          onChange={(e) => setDraft(e.target.value)}
        />

        <button
          type="button"
          className="bp-btn"
          title={tx('Open in the system browser')}
          aria-label={tx('Open in the system browser')}
          data-testid="bp-external"
          onClick={() => void openUrl(live.url || normalizeUrl(draft)).catch(() => {})}
        >
          <Icon d="M9.5 3h3.5v3.5M12.6 3.4L7.8 8.2M12 9.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.4" />
        </button>
      </form>

      {url ? (
        <div className="bp-stage" ref={stageRef} data-testid="bp-stage">
          {galat && (
            <div className="bp-blocked" data-testid="bp-error" role="alert">
              <p className="bp-blocked-title">{tr('Page could not be loaded')}</p>
              <p className="bp-blocked-body">
                <code>{shortUrl(url)}</code> - {galat}
              </p>
              <div className="bp-blocked-actions">
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="bp-open-external"
                  onClick={() => void openUrl(url).catch(() => {})}
                >
                  {tr('Open in an external browser')}
                </button>
                {/*
                 * The label is built from HOME rather than written by hand: a
                 * hardcoded "localhost:5173" told the reader one thing while
                 * the handler did another in a release build.
                 */}
                <button className="btn btn-sm" data-testid="bp-goto-local" onClick={() => go(HOME)}>
                  {tr('Go to')} {HOME.replace(/^https?:\/\//, '')}
                </button>
              </div>
            </div>
          )}
          {live.title && (
            <div className="bp-title" data-testid="bp-title">
              {live.title}
            </div>
          )}
        </div>
      ) : (
        <div className="bp-blank" data-testid="bp-blank">
          <p>Enter a URL then press Enter.</p>
          <button className="btn btn-sm" data-testid="bp-blank-home" onClick={() => go(HOME)}>
            Open {HOME}
          </button>
        </div>
      )}
    </div>
  );
}
