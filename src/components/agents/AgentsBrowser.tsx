import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import * as cmd from '../../lib/commands';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { clipboardWrite } from '../../lib/clipboard';
import {
  ambilPermintaanAgents,
  catatPaneAgents,
  lupakanPaneAgents,
  saatRegistryAgentsBerubah,
} from '../../lib/agentsBrowserStore';
import { paneHarusTampil } from '../../lib/nativeOverlay';
import { usePorts } from '../../lib/portsStore';

/**
 * The browser view for the Agents window's right column.
 *
 * This is NOT `BrowserPane` (components/terminal/BrowserPane.tsx). That one is a
 * TERMINAL PANE: it takes a `PaneMeta`, writes the URL back through
 * `useTerminal.setPaneUrl`, and lives inside the terminal grid's lifecycle.
 * Mounting it here would either crash on a pane that does not exist or hijack a
 * real terminal pane's state. So this drives the SAME Rust side
 * (`browser_pane_*`, keyed by a pane id of the caller's choosing) with its own
 * id and its own bounds, which is exactly what that API was shaped for.
 *
 * WHY THERE IS NO `about:blank` HERE ANY MORE. The previous version created the
 * child webview on mount with `url || 'about:blank'`. Rust's gate
 * (`web::periksa_url_pane`) only admits http/https, so the very first call was
 * REJECTED, `siap` stayed false forever, and the navigation effect — which
 * begins with `if (!siap || !url) return` — then swallowed every address the
 * reader typed. The pane rendered a dark rectangle and the only feedback was
 * the error printed with `String(e)`, which for a Tauri error object is
 * `[object Object]`. So: the webview is created when there is a real URL to
 * load, nothing is created before that, and errors are unwrapped into text.
 *
 * The child webview is a NATIVE overlay positioned by rectangle, not an iframe:
 * `ResizeObserver` plus a slow interval keep its bounds in step with the
 * container, since nothing repositions it on its own when the column resizes.
 */
const PANE_ID = 'agents-browser';

/** Zoom steps, as the usual CSS scale. 1 = 100%. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_LANGKAH = 0.1;

/** A Tauri error is `{ code, message }`; a string is already text. */
function pesanGalat(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.code === 'string' && o.code) return o.code;
  }
  return e ? String(e) : '';
}

/** `example.com` -> `https://example.com`; localhost / IPs -> http. */
function denganSkema(t: string): string {
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)) {
    return `http://${t}`;
  }
  return `https://${t}`;
}

export default function AgentsBrowser() {
  const tr = useT();
  const applySettings = useStore((s) => s.applySettings);
  const allowlistWeb = useStore((s) => s.settings.allowlistWeb ?? []);
  /* Local dev servers, for "select a running service" in the empty state. */
  const ports = usePorts((s) => s.ports);
  /* The COMMITTED address. '' means "nothing loaded yet" — the state the pane
     opens in, and the one the placeholder below describes. */
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [galat, setGalat] = useState('');
  const [siap, setSiap] = useState(false);
  const [judul, setJudul] = useState('');
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState(false);
  const [menuInspeksi, setMenuInspeksi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  /**
   * Whether this page is published to the agent.
   *
   * It is a real switch, not a decoration: OFF unpublishes the pane, so
   * `browser_list`/`browser_open`/`browser_read` stop seeing it. That is the
   * only honest reading of "Sharing with Agent" — a badge that keeps sharing
   * while it says it is off would be worse than no badge.
   */
  const [dibagikan, setDibagikan] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const adaRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const siapRef = useRef(false);

  useEffect(() => {
    siapRef.current = siap;
  }, [siap]);

  /**
   * Create / move / close the child webview.
   *
   * The effect re-runs when `url` changes, which is what makes navigation work:
   * a pane that already exists gets `browser_pane_nav` (which leaves its bounds
   * alone), and one that does not is created at the new address. Clearing the
   * address closes the pane, so an empty view does not keep a webview alive
   * behind the placeholder.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let hidup = true;

    const sync = async (baru: boolean) => {
      const r = el.getBoundingClientRect();
      /* A zero rect is not a position: sending it pins the webview to the
         window's top-left corner, over the whole UI. The container has no size
         on the first frames. */
      if (r.width < 2 || r.height < 2 || !hidup) return;

      if (!url) {
        if (adaRef.current) {
          adaRef.current = false;
          if (hidup) setSiap(false);
          await cmd.browserPaneClose(PANE_ID).catch(() => {});
        }
        return;
      }

      try {
        if (!adaRef.current) {
          await cmd.browserPaneOpen({
            paneId: PANE_ID,
            url,
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          });
          adaRef.current = true;
          if (hidup) {
            setSiap(true);
            setGalat('');
          }
        } else {
          await cmd.browserPaneBounds({
            paneId: PANE_ID,
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          });
          if (baru) await cmd.browserPaneNav(PANE_ID, url);
        }
      } catch (e) {
        if (hidup) setGalat(pesanGalat(e));
      }
    };

    void sync(true);
    const ro = new ResizeObserver(() => void sync(false));
    ro.observe(el);
    /* Safety net for a parent re-layout that changes no size. 120x cheaper than
       a rAF loop and still instant to the eye. */
    const net = window.setInterval(() => void sync(false), 500);

    return () => {
      hidup = false;
      ro.disconnect();
      window.clearInterval(net);
    };
  }, [url]);

  /* The webview outlives address changes on purpose, so it is closed on UNMOUNT
     only. A native overlay left behind would float over whatever came next. */
  useEffect(
    () => () => {
      if (adaRef.current) {
        adaRef.current = false;
        void cmd.browserPaneClose(PANE_ID).catch(() => {});
      }
    },
    [],
  );

  /**
   * Hide the child webview while anything is drawn over it.
   *
   * WHY this pane needs its own loop: the browser surface is a native child
   * WebView2, an OS-level window that paints ABOVE the whole HTML document.
   * z-index cannot reach it. So when the reader opens the `…` menu, the inspect
   * menu, or the main window's command palette over the pane, the menu is drawn
   * in the DOM and the page is drawn on top of it — the menu appears to vanish.
   * The fix is to hide the webview for as long as an overlay is up and show it
   * again afterwards. `paneHarusTampil` (lib/nativeOverlay.ts) is the single
   * definition of "an overlay is up", shared with the terminal BrowserPane.
   *
   * Event driven, not a rAF loop: the same reasoning as BrowserPane — a 60Hz
   * scan of the DOM for a pane that may be closed is pure stutter. The 500ms
   * safety net covers a parent re-layout that fires no event.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let terlihatLalu: boolean | null = null;
    let raf = 0;

    const tik = () => {
      raf = 0;
      if (!adaRef.current) return;
      const terlihat = paneHarusTampil(el);
      if (terlihat !== terlihatLalu) {
        terlihatLalu = terlihat;
        void cmd.browserPaneVisible(PANE_ID, terlihat).catch(() => {});
      }
    };

    const jadwalkan = () => {
      if (!raf) raf = requestAnimationFrame(tik);
    };

    const ro = new ResizeObserver(jadwalkan);
    ro.observe(el);
    window.addEventListener('resize', jadwalkan);
    window.addEventListener('scroll', jadwalkan, true);
    /* Overlay open/close: childList only. Watching attributes would fire on
       every class change in the app. */
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
  }, []);

  /**
   * Follow the page: address bar and title track in-page navigation.
   *
   * Skips the round trip entirely while the document is hidden, and slows to 3s
   * in the background — the call is a cross-process hop into WebView2.
   */
  useEffect(() => {
    if (!url) return;
    let t = 0;
    const jeda = () => (document.hidden ? 3000 : 900);
    const tik = () => {
      if (siapRef.current && !document.hidden) {
        void cmd
          .browserPaneInfo(PANE_ID)
          .then((i) => {
            if (i.url && i.url !== url) {
              setUrl(i.url);
              setDraft(i.url);
            }
            setJudul(i.title);
          })
          .catch(() => {});
      }
      t = window.setTimeout(tik, jeda());
    };
    t = window.setTimeout(tik, jeda());
    return () => window.clearTimeout(t);
  }, [url]);

  /* Any click outside closes whichever menu is open. */
  useEffect(() => {
    if (!menu && !menuInspeksi) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setMenuInspeksi(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false);
        setMenuInspeksi(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, menuInspeksi]);

  /**
   * Publish this pane so the agent's browser tools can find it, and pick up the
   * addresses they ask for.
   *
   * WHY the agent needs a channel at all: it cannot create this pane — the pane
   * lives in the right column of THIS window and only this component knows the
   * rectangle the child webview must cover. So the tool writes the address it
   * wants and the request is consumed here, which is the same split the terminal
   * panes have (store owns the pane, pane component owns the webview).
   *
   * The entry is refreshed on every poll; the reader treats anything not
   * refreshed within `BATAS_SEGAR_MS` as gone, so closing this window cannot
   * leave a phantom pane behind.
   */
  useEffect(() => {
    const umumkan = () =>
      catatPaneAgents({ id: PANE_ID, url, title: judul, siap });
    if (dibagikan) umumkan();
    else lupakanPaneAgents(PANE_ID);
    const t = window.setInterval(() => {
      if (dibagikan) umumkan();
    }, 3000);
    /* The main window may have just written a request; react immediately rather
       than waiting out the interval. */
    const lepas = saatRegistryAgentsBerubah(() => {
      const minta = ambilPermintaanAgents(PANE_ID);
      if (minta !== null) {
        /* Empty request = the agent asked to close this pane. */
        setDraft(minta);
        setUrl(minta);
      }
    });
    return () => {
      window.clearInterval(t);
      lepas();
      lupakanPaneAgents(PANE_ID);
    };
  }, [url, judul, siap, dibagikan]);

  /* The request channel, polled: `storage` does not fire in the window that
     wrote the value, and the request is normally written by the OTHER window. */
  useEffect(() => {
    const t = window.setInterval(() => {
      const minta = ambilPermintaanAgents(PANE_ID);
      /* `null` = nothing pending; `''` = the agent asked to close the pane. */
      if (minta !== null && minta !== url) {
        setDraft(minta);
        setUrl(minta);
      }
    }, 700);
    return () => window.clearInterval(t);
  }, [url]);

  const buka = useCallback(
    (mentah: string) => {
      const t = mentah.trim();
      if (!t) return;
      const penuh = denganSkema(t);
      setGalat('');
      setDraft(penuh);
      if (penuh === url) {
        /* Same address: re-load instead of a no-op, which is what pressing
           Enter on an unchanged address should do. */
        if (siapRef.current) void cmd.browserPaneNav(PANE_ID, 'reload').catch(() => {});
        return;
      }
      setUrl(penuh);
    },
    [url],
  );

  const nav = useCallback((aksi: 'back' | 'forward' | 'reload') => {
    if (!siapRef.current) return;
    void cmd.browserPaneNav(PANE_ID, aksi).catch(() => {});
  }, []);

  const terapkanZoom = useCallback((f: number | ((z: number) => number)) => {
    setZoom((z0) => {
      const raw = typeof f === 'function' ? f(z0) : f;
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(raw * 100) / 100));
      if (siapRef.current) void cmd.browserPaneZoom(PANE_ID, z).catch(() => {});
      return z;
    });
  }, []);

  /* Shortcuts the toolbar advertises: Ctrl+Shift+C for the inspect menu and F12
     for DevTools. Bound while this view is mounted only — they belong to the
     pane, and the main window has its own meaning for both keys. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        if (siapRef.current) void cmd.browserPaneDevtools(PANE_ID).catch(() => {});
        return;
      }
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setMenuInspeksi((v) => !v);
        return;
      }
      /*
       * Zoom, the way a browser does it. Bound on the pane rather than in the
       * global keymap: zooming belongs to the page in front of the reader, and
       * a global binding would change the app's own UI scale from here.
       */
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          terapkanZoom(z => z + ZOOM_LANGKAH);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          terapkanZoom(z => z - ZOOM_LANGKAH);
        } else if (e.key === '0') {
          e.preventDefault();
          terapkanZoom(() => 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [terapkanZoom]);

  /** Put the current page into the chat composer as an `@url:` reference. */
  const shareKeAgen = useCallback(() => {
    if (!url) return;
    const cur = useAi.getState().drafts[''] ?? '';
    const teks = `@url:${url}`;
    useAi.getState().setDraft(cur.includes(teks) ? cur : cur ? `${cur} ${teks}` : teks);
  }, [url]);

  /** Copy the page text into the chat as a fenced block (like BrowserPane). */
  const kirimTeks = useCallback(async () => {
    if (!siapRef.current) return;
    setSibuk(true);
    try {
      const isi = await cmd.browserPaneEval(
        PANE_ID,
        "(document.body && document.body.innerText ? document.body.innerText : '').slice(0, 6000)",
      );
      const teks = String(isi ?? '').trim();
      const cur = useAi.getState().drafts[''] ?? '';
      const blok = `\`\`\`\n// ${judul || url}\n${teks}\n\`\`\``;
      useAi.getState().setDraft(cur ? `${cur}\n\n${blok}` : blok);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
      setMenuInspeksi(false);
    }
  }, [judul, url]);

  const kirimConsole = useCallback(async () => {
    if (!siapRef.current) return;
    setSibuk(true);
    try {
      /* Install a recorder once, then read it: the console of a page that has
         already run cannot be read after the fact. */
      await cmd
        .browserPaneEval(
          PANE_ID,
          `(() => {
             if (!window.__zephyrLog) {
               window.__zephyrLog = [];
               for (const lvl of ['log', 'warn', 'error', 'info']) {
                 const asli = console[lvl].bind(console);
                 console[lvl] = (...a) => {
                   try {
                     window.__zephyrLog.push(lvl + ': ' + a.map(x => {
                       try { return typeof x === 'string' ? x : JSON.stringify(x); }
                       catch { return String(x); }
                     }).join(' '));
                     if (window.__zephyrLog.length > 200) window.__zephyrLog.shift();
                   } catch {}
                   asli(...a);
                 };
               }
             }
             return true;
           })()`,
        )
        .catch(() => {});
      const isi = await cmd.browserPaneEval(
        PANE_ID,
        "(window.__zephyrLog && window.__zephyrLog.length ? window.__zephyrLog.join('\\n') : '(console is empty)')",
      );
      const teks = String(isi ?? '').trim();
      const cur = useAi.getState().drafts[''] ?? '';
      const blok = `\`\`\`\n// console — ${judul || url}\n${teks}\n\`\`\``;
      useAi.getState().setDraft(cur ? `${cur}\n\n${blok}` : blok);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
      setMenuInspeksi(false);
    }
  }, [judul, url]);

  /**
   * Sharing is only meaningful with a page loaded, so the toggle lives next to
   * the address bar and shows its state; an off switch that silently kept
   * publishing would be the "dead control" this view was already fixed for.
   */
  const bisaBagikan = url.length > 0;

  /**
   * "Add Screenshot to Chat" — implemented HONESTLY, because a real screenshot
   * of the child webview is not reachable from here.
   *
   * WHY not a picture: this pane is a native child WebView2 positioned over the
   * stage, not an iframe, so its pixels are not in this document — `drawImage`
   * and canvas capture cannot see them. Tauri 2.11 exposes no capture API for a
   * child webview (checked in the crate: `Webview` has `set_zoom`,
   * `open_devtools`, `clear_all_browsing_data`, and no `capture`). Claiming to
   * send a screenshot and sending text instead is exactly the kind of fake
   * success this view was already fixed for, so the menu item says what it
   * really does: it sends the page's STRUCTURE — title, address, visible text
   * and image sources — which is what a model can actually use.
   */
  const kirimCuplikan = useCallback(async () => {
    if (!siapRef.current) return;
    setSibuk(true);
    try {
      const isi = await cmd.browserPaneEval(
        PANE_ID,
        `(() => {
           const teks = (document.body && document.body.innerText ? document.body.innerText : '')
             .replace(/\\s+/g, ' ').trim().slice(0, 1200);
           const gambar = [...document.images].slice(0, 12)
             .map((i) => i.currentSrc || i.src).filter(Boolean);
           return JSON.stringify({ judul: document.title || '', url: location.href, teks, gambar });
         })()`,
      );
      let d: { judul?: string; url?: string; teks?: string; gambar?: string[] } = {};
      try {
        d = JSON.parse(String(isi ?? '{}')) as typeof d;
      } catch {
        d = { teks: String(isi ?? '') };
      }
      const baris = [
        `// page — ${d.judul || judul || url}`,
        `// url  — ${d.url || url}`,
        '',
        String(d.teks ?? '(no visible text)'),
      ];
      if (d.gambar?.length) {
        baris.push('', '// images', ...d.gambar.map((g) => `//   ${g}`));
      }
      const cur = useAi.getState().drafts[''] ?? '';
      const blok = `\`\`\`\n${baris.join('\n')}\n\`\`\``;
      useAi.getState().setDraft(cur ? `${cur}\n\n${blok}` : blok);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
      setMenuInspeksi(false);
    }
  }, [judul, url]);

  const bukaEksternal = useCallback(async () => {
    if (!url) return;
    setMenu(false);
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, [url]);

  const hapusData = useCallback(async () => {
    setMenu(false);
    if (!siapRef.current) return;
    try {
      await cmd.browserPaneClearData(PANE_ID);
      /* Reload so the page comes back clean — clearing storage while the old
         document keeps running would look like nothing happened. */
      await cmd.browserPaneClose(PANE_ID).catch(() => {});
      adaRef.current = false;
      setSiap(false);
      const t = url;
      setUrl('');
      window.setTimeout(() => setUrl(t), 60);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, [url]);

  const adaHalaman = url.length > 0;

  /**
   * Turn on the web gate for THIS page's host, from the pane itself.
   *
   * WHY this exists: every web tool (`browser_open`, `browser_read`,
   * `web_fetch`) passes the same gate, and the gate is fail-closed by design —
   * `izinIsiWeb` defaults to false and `allowlistWeb` to empty. So the FIRST
   * `browser_open` an agent ever attempts is refused, and the refusal used to
   * point at a settings page the reader then had to go find. The pane is where
   * the reader already is when that happens, so the fix belongs here: one click
   * turns the master switch on and adds the host the pane is showing.
   *
   * It only ever ADDS: the host list is merged, never replaced, so sites the
   * reader allowed earlier stay allowed. Nothing is allowed that the reader did
   * not name by loading the page and pressing the button.
   */
  const izinkanSitus = useCallback(() => {
    setMenu(false);
    if (!url) return;
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      setGalat(tr('Could not read the host from this address.'));
      return;
    }
    if (!host) return;
    const baru = allowlistWeb.includes(host) ? allowlistWeb : [...allowlistWeb, host];
    void applySettings({ izinIsiWeb: true, allowlistWeb: baru });
  }, [url, allowlistWeb, applySettings, tr]);

  const hostSudahDiizinkan = useMemo(() => {
    if (!url) return false;
    try {
      return allowlistWeb.includes(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  }, [url, allowlistWeb]);

  return (
    <div className="ag-browser" data-testid="ag-browser">
      <div className="ag-browser-bar" ref={menuRef}>
        <button
          type="button"
          className="ag-browser-ico"
          data-testid="ag-browser-back"
          title={tr('Go Back')}
          aria-label={tr('Go Back')}
          disabled={!siap}
          onClick={() => nav('back')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="ag-browser-ico"
          data-testid="ag-browser-forward"
          title={tr('Go Forward')}
          aria-label={tr('Go Forward')}
          disabled={!siap}
          onClick={() => nav('forward')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5L10.5 8L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="ag-browser-ico"
          data-testid="ag-browser-reload"
          title={tr('Reload')}
          aria-label={tr('Reload')}
          disabled={!siap}
          onClick={() => nav('reload')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.4V5h-2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <form
          className="ag-browser-form"
          onSubmit={(e) => {
            e.preventDefault();
            buka(draft);
          }}
        >
          {/*
            * "New Tab": clears the address and closes the page.
            *
            * Not a new TAB — this view has one page. It is the browser's own
            * wording for "start over at nothing", which is what clearing the
            * address does (`url` empty closes the child webview). Reusing the
            * label the reader already knows beats inventing "Clear".
            */}
          <button
            type="button"
            className="ag-browser-tab"
            data-testid="ag-browser-newtab"
            title={tr('New Tab')}
            onClick={() => {
              setDraft('');
              setUrl('');
              setJudul('');
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.4v9.2M3.4 8h9.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>{tr('New Tab')}</span>
          </button>
          <input
            className="ag-browser-url"
            data-testid="ag-browser-url"
            /*
             * The reference's placeholder is the whole instruction: type a URL
             * or pick one of the dev servers this machine is already running.
             * Written out rather than shortened, because the second half is the
             * part a reader would not guess.
             */
            placeholder={tr('Enter URL or select a running service')}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            className="ag-browser-go"
            data-testid="ag-browser-go"
            title={tr('Open')}
            aria-label={tr('Open')}
            disabled={!draft.trim()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.4 8h9.2M8.8 4.2 12.6 8l-3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>

        {/*
          * Share with the agent: drops the page into the chat composer.
          *
          * The glyph is a SPEECH BUBBLE, not the stacked squares the pill below
          * uses. The two controls sat side by side with an identical icon and
          * the reader reported it as a duplicate button: one puts an `@url:`
          * reference into the composer (an action), the other is the on/off
          * state of the bridge (a switch). Different jobs need different
          * pictures, or the toolbar reads as two copies of one button.
          */}
        <button
          type="button"
          className="ag-browser-ico"
          data-testid="ag-browser-share"
          title={tr('Share with Agent')}
          aria-label={tr('Share with Agent')}
          disabled={!adaHalaman}
          onClick={shareKeAgen}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.4 3.6h11.2v6.6H7.2L4 12.8v-2.6H2.4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/*
          * "Sharing with Agent" — the state of the bridge the tools read.
          *
          * WHY a labelled pill and not another icon: it answers a question the
          * reader cannot otherwise answer from this window ("can the agent see
          * this page right now?"), and it is the switch for it. Off really stops
          * sharing — the pane is unpublished from the registry — so the label
          * never lies.
          */}
        <button
          type="button"
          className={`ag-browser-share-pill${dibagikan ? ' is-on' : ''}`}
          data-testid="ag-browser-share-status"
          aria-pressed={dibagikan}
          title={tr(dibagikan ? 'Sharing this page with the agent' : 'Not sharing this page with the agent')}
          disabled={!bisaBagikan}
          onClick={() => setDibagikan((v) => !v)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.4" y="2.4" width="8.4" height="8.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5.6 13.6h6.8a1.2 1.2 0 0 0 1.2-1.2V5.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span>{tr(dibagikan ? 'Sharing with Agent' : 'Not sharing')}</span>
        </button>

        {/* Inspect: element / console / page text into the chat. */}
        <div className="ag-browser-menuwrap">
          <button
            type="button"
            className={`ag-browser-ico${menuInspeksi ? ' is-on' : ''}`}
            data-testid="ag-browser-inspect"
            title={tr('Inspect')}
            aria-label={tr('Inspect')}
            aria-expanded={menuInspeksi}
            onClick={() => {
              setMenuInspeksi((v) => !v);
              setMenu(false);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 2.6l10 4.2-4.1 1.5-1.5 4.1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </button>
          {menuInspeksi && (
            <div className="ag-menu ag-browser-menu" role="menu" data-testid="ag-menu-inspect">
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-inspect-element"
                onClick={() => {
                  if (siapRef.current) void cmd.browserPaneDevtools(PANE_ID).catch(() => {});
                  setMenuInspeksi(false);
                }}
              >
                <span>{tr('Add Element to Chat')}</span>
                <span className="ag-menu-kbd">Ctrl+Shift+C</span>
              </button>
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-inspect-console"
                disabled={sibuk}
                onClick={() => void kirimConsole()}
              >
                <span>{tr('Add Console Logs to Chat')}</span>
              </button>
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-inspect-shot"
                disabled={sibuk}
                onClick={() => void kirimCuplikan()}
              >
                {/* Labelled for what it sends: the page's structure, not its
                    pixels — see `kirimCuplikan` for why a picture is impossible
                    here. */}
                <span>{tr('Add Page Snapshot to Chat')}</span>
              </button>
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-inspect-text"
                disabled={sibuk}
                onClick={() => void kirimTeks()}
              >
                <span>{tr('Add Page Text to Chat')}</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="ag-browser-ico"
          data-testid="ag-browser-devtools"
          title={tr('Developer Tools')}
          aria-label={tr('Developer Tools')}
          disabled={!siap}
          onClick={() => {
            if (siapRef.current) void cmd.browserPaneDevtools(PANE_ID).catch(() => {});
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.4 5.6h11.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.6 8.4l2.6 1.8-2.6 1.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* `…` — page actions that are not per-keystroke. */}
        <div className="ag-browser-menuwrap">
          <button
            type="button"
            className={`ag-browser-ico${menu ? ' is-on' : ''}`}
            data-testid="ag-browser-more"
            title={tr('More Actions')}
            aria-label={tr('More Actions')}
            aria-expanded={menu}
            onClick={() => {
              setMenu((v) => !v);
              setMenuInspeksi(false);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3.4" cy="8" r="1.15" fill="currentColor" />
              <circle cx="8" cy="8" r="1.15" fill="currentColor" />
              <circle cx="12.6" cy="8" r="1.15" fill="currentColor" />
            </svg>
          </button>
          {menu && (
            <div className="ag-menu ag-browser-menu" role="menu" data-testid="ag-menu-browser">
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-external" disabled={!adaHalaman} onClick={() => void bukaEksternal()}>
                <span>{tr('Open in External Browser')}</span>
              </button>
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-copy" disabled={!adaHalaman} onClick={() => void clipboardWrite(url).then(() => setMenu(false))}>
                <span>{tr('Copy Link')}</span>
              </button>
              <span className="ag-menu-sep" />
              {/*
                * "Allow this site" — the way out of the web gate, at the point
                * where it bites. See `izinkanSitus` for why it lives in the
                * pane instead of only in Chat Settings. It reads as done when
                * the host is already on the list, so it never looks like an
                * action that did nothing.
                */}
              <button
                role="menuitem"
                className="ag-menu-item"
                data-testid="ag-browser-allow"
                disabled={!adaHalaman || hostSudahDiizinkan}
                onClick={izinkanSitus}
              >
                <span>{tr(hostSudahDiizinkan ? 'Site allowed for the agent' : 'Allow this site for the agent')}</span>
              </button>
              <span className="ag-menu-sep" />
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-zoom-in" disabled={!siap} onClick={() => terapkanZoom(zoom + ZOOM_LANGKAH)}>
                <span>{tr('Zoom In')}</span>
                <span className="ag-menu-kbd">Ctrl++</span>
              </button>
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-zoom-out" disabled={!siap} onClick={() => terapkanZoom(zoom - ZOOM_LANGKAH)}>
                <span>{tr('Zoom Out')}</span>
                <span className="ag-menu-kbd">Ctrl+-</span>
              </button>
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-zoom-reset" disabled={!siap} onClick={() => terapkanZoom(1)}>
                <span>{tr('Reset Zoom')}</span>
                <span className="ag-menu-kbd">{Math.round(zoom * 100)}%</span>
              </button>
              <span className="ag-menu-sep" />
              <button role="menuitem" className="ag-menu-item" data-testid="ag-browser-clear" disabled={!siap} onClick={() => void hapusData()}>
                <span>{tr('Clear Storage and Cache')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {galat && (
        <p className="ag-browser-galat" role="alert" data-testid="ag-browser-galat">
          {galat}
        </p>
      )}

      {/*
        * The stage is empty in the DOM on purpose: it is only a RECTANGLE the
        * native webview is positioned over, so it must stay a plain block with
        * no children of its own. The placeholder is a SIBLING shown while no
        * address is loaded — the same state VS Code's browser starts in.
        */}
      <div className="ag-browser-body">
        <div className="ag-browser-stage" ref={stageRef} data-testid="ag-browser-stage" />
        {!adaHalaman && (
          <div className="ag-browser-kosong" data-testid="ag-browser-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.2 9.4h17.6M3.2 14.6h17.6M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            {/*
              * The reference's empty state, verbatim in meaning: "No preview
              * yet", the reason, and the way out. It names the agent because
              * that is who loads a page here in practice — the address bar is
              * the manual route, not the expected one.
              */}
            <p className="ag-browser-kosong-judul">{tr('No preview yet')}</p>
            <p className="ag-browser-kosong-petunjuk">
              {tr('Let AI generate something to explore, or enter a URL above.')}
            </p>
            {/*
              * Running services — REAL ports, not a suggestion list.
              *
              * "select a running service" in the placeholder is only honest if
              * there is somewhere to select one, so the ones already forwarded
              * to this machine are listed here. `usePorts` is the same store the
              * Ports view reads; a click fills the address bar and opens it.
              */}
            {ports.length > 0 && (
              <div className="ag-browser-layanan" data-testid="ag-browser-services">
                <div className="ag-browser-layanan-judul">{tr('Running services')}</div>
                {ports.map((p) => {
                  const alamat = `${p.protocol}://localhost:${p.hostPort}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="ag-browser-layanan-baris"
                      data-testid={`ag-browser-service-${p.hostPort}`}
                      title={`${alamat}${p.process ? ` · ${p.process}` : ''}`}
                      onClick={() => buka(alamat)}
                    >
                      <span className="ag-browser-layanan-port">{p.hostPort}</span>
                      <span className="ag-browser-layanan-nama">{p.process || p.forwarder}</span>
                      <span className="ag-browser-layanan-proto">{p.protocol}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="ag-browser-kosong-petunjuk">
              {tr('Shortcuts: Ctrl+Shift+C inspect · F12 developer tools')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
