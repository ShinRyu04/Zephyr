import { useT } from '../../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTerminal } from '../../lib/terminalStore';
import * as cmd from '../../lib/commands';
import type { PaneMeta } from '../../lib/types';
import { tx } from '../../lib/i18n';

export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)) {
    return `http://${t}`;
  }
  return `https://${t}`;
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

const HOME = 'http://localhost:5173';

function Icon({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Pane browser dengan webview anak asli, bukan iframe.
 *
 * KENAPA bukan iframe: isi iframe tidak bisa dibaca dari luar karena aturan
 * same-origin, dan situs yang mengirim X-Frame-Options menolak tampil sama
 * sekali. Webview2 anak dimiliki proses ini sendiri, jadi agent bisa membaca
 * DOM-nya lewat browser_pane_eval, mengklik elemen, dan situs seperti Google
 * can load because no iframe is involved.
 *
 * KONSEKUENSI tata letak: webview anak melayang di atas jendela pada koordinat
 * native, jadi ia TIDAK ikut scroll atau terpotong oleh induknya. Karena itu
 * posisinya disinkronkan terus lewat requestAnimationFrame dan disembunyikan
 * begitu elemen penampungnya keluar dari layar.
 */
export default function BrowserPane({ pane }: { pane: PaneMeta }) {
  const tr = useT();
  const setPaneUrl = useTerminal((s) => s.setPaneUrl);
  const [draft, setDraft] = useState(pane.url ?? '');
  const [live, setLive] = useState({ url: pane.url ?? '', title: '' });
  const [galat, setGalat] = useState('');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef(pane.url ?? '');
  const siapRef = useRef(false);

  useEffect(() => {
    setDraft(pane.url ?? '');
  }, [pane.url]);

  useEffect(() => {
    urlRef.current = pane.url ?? '';
  }, [pane.url]);

  /**
   * Buka (atau arahkan ulang) webview ke URL pane.
   *
   * The initial position comes from the container element so the webview lands
   * in the right place; the sync loop below keeps it there afterwards.
   */
  useEffect(() => {
    const url = pane.url;
    if (!url) {
      siapRef.current = false;
      void cmd.browserPaneClose(pane.id).catch(() => {});
      return;
    }
    const el = stageRef.current;
    const r = el?.getBoundingClientRect();
    setGalat('');
    void cmd
      .browserPaneOpen({
        paneId: pane.id,
        url,
        x: r?.left ?? 0,
        y: r?.top ?? 0,
        width: r?.width ?? 800,
        height: r?.height ?? 600,
      })
      .then(() => {
        siapRef.current = true;
      })
      .catch((e: unknown) => {
        siapRef.current = false;
        setGalat(String((e as Error)?.message ?? e));
      });
  }, [pane.id, pane.url]);

  useEffect(() => {
    const id = pane.id;
    return () => {
      void cmd.browserPaneClose(id).catch(() => {});
    };
  }, [pane.id]);

  /**
   * Keep the child webview glued to its container element.
   *
   * WHY this is not a plain requestAnimationFrame loop: the first version ran
   * 60 times a second, forever, and each tick called getBoundingClientRect plus
   * a document.querySelector for modal detection. That is 60 full DOM scans per
   * second for a pane that may not even be open, and it made the whole window
   * stutter. The work here is now event driven:
   *
   *   - ResizeObserver fires on size changes (panel resized, column widened)
   *   - scroll and resize listeners fire on movement
   *   - MutationObserver on body fires when a modal opens or closes
   *
   * A slow 500ms interval remains as a safety net for the cases those events do
   * not cover (parent re-layout with no size change), which is 120x less work
   * than before and still instant to the eye.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !pane.url) return;
    let kunciLalu = '';
    let terlihatLalu: boolean | null = null;
    let raf = 0;

    const tik = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const adaModal = !!document.querySelector(
        '.modal-backdrop, .cp-overlay, .trust-overlay, [data-modal-terbuka]',
      );
      const terlihat =
        !adaModal &&
        el.offsetParent !== null &&
        r.width > 4 &&
        r.height > 4 &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < window.innerHeight &&
        r.left < window.innerWidth;

      if (terlihat !== terlihatLalu) {
        terlihatLalu = terlihat;
        void cmd.browserPaneVisible(pane.id, terlihat).catch(() => {});
      }
      if (terlihat) {
        const kunci = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (kunci !== kunciLalu) {
          kunciLalu = kunci;
          void cmd
            .browserPaneBounds({
              paneId: pane.id,
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

    // Modal open and close: watch for added or removed nodes only. Watching
    // attributes too would fire on every class change in the app.
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
  }, [pane.id, pane.url]);

  /**
   * Follow the page: keep the address bar and title in sync when the user
   * navigates inside the webview.
   *
   * WHY this checks less often than it looks: the first version polled every
   * 900ms forever, and each poll is a cross-process round trip into WebView2
   * (browser_pane_info evaluates document.title). That ran for every browser
   * pane whether or not the pane was on screen. It now skips the call entirely
   * while the document is hidden, and slows to 3s in the background.
   */
  useEffect(() => {
    if (!pane.url) return;
    let t = 0;
    const jeda = () => (document.hidden ? 3000 : 900);

    const tik = () => {
      if (siapRef.current && !document.hidden) {
        void cmd
          .browserPaneInfo(pane.id)
          .then((i) => {
            setLive({ url: i.url, title: i.title });
            if (i.url && i.url !== urlRef.current) setPaneUrl(pane.id, i.url);
          })
          .catch(() => {});
      }
      t = window.setTimeout(tik, jeda());
    };
    t = window.setTimeout(tik, jeda());
    return () => window.clearTimeout(t);
  }, [pane.id, pane.url, setPaneUrl]);

  const go = useCallback(
    (raw: string) => {
      const url = normalizeUrl(raw);
      if (!url) return;
      setGalat('');
      setPaneUrl(pane.id, url);
      setDraft(url);
    },
    [pane.id, setPaneUrl],
  );

  const nav = useCallback(
    (aksi: string) => {
      void cmd.browserPaneNav(pane.id, aksi).catch(() => {});
    },
    [pane.id],
  );

  const secure = live.url.startsWith('https://');

  return (
    <div className="browser-pane" data-pane-body={pane.id} data-bp-blocked="0">
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
          title={tx('Kembali')}
          aria-label={tx('Kembali')}
          data-testid="bp-back"
          onClick={() => nav('back')}
        >
          <Icon d="M9.8 3.5L5.3 8l4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title={tx('Maju')}
          aria-label={tx('Maju')}
          data-testid="bp-fwd"
          onClick={() => nav('forward')}
        >
          <Icon d="M6.2 3.5L10.7 8l-4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title={tx('Muat ulang')}
          aria-label={tx('Muat ulang')}
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
          title={secure ? 'Koneksi HTTPS' : 'HTTP biasa (tanpa enkripsi)'}
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
          aria-label={tx('Alamat URL')}
          data-testid="bp-url"
          placeholder="http://localhost:5173"
          onChange={(e) => setDraft(e.target.value)}
        />

        <button type="submit" className="bp-btn bp-go" title={tx('Buka URL')} aria-label={tx('Buka URL')}>
          Go
        </button>
        <button
          type="button"
          className="bp-btn"
          title={tx('Buka di browser sistem')}
          aria-label={tx('Buka di browser sistem')}
          data-testid="bp-external"
          onClick={() => void openUrl(live.url || normalizeUrl(draft)).catch(() => {})}
        >
          <Icon d="M9.5 3h3.5v3.5M12.6 3.4L7.8 8.2M12 9.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.4" />
        </button>
      </form>

      {pane.url ? (
        <div className="bp-stage" ref={stageRef} data-testid="bp-stage">
          {galat && (
            <div className="bp-blocked" data-testid="bp-error" role="alert">
              <p className="bp-blocked-title">{tr('Halaman tidak bisa dimuat')}</p>
              <p className="bp-blocked-body">
                <code>{shortUrl(pane.url)}</code> — {galat}
              </p>
              <div className="bp-blocked-actions">
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="bp-open-external"
                  onClick={() => void openUrl(pane.url as string).catch(() => {})}
                >
                  {tr('Buka di browser eksternal')}
                </button>
                <button className="btn btn-sm" data-testid="bp-goto-local" onClick={() => go(HOME)}>
                  Ke localhost:5173
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
          <p>Masukkan URL lalu tekan Enter.</p>
          <button className="btn btn-sm" data-testid="bp-blank-home" onClick={() => go(HOME)}>
            Buka {HOME}
          </button>
        </div>
      )}
    </div>
  );
}
