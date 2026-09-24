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
   * Jaga posisi webview tetap menempel pada elemen penampung.
   *
   * Dipakai requestAnimationFrame, bukan ResizeObserver: yang berubah bukan
   * hanya ukuran, tapi juga posisi (panel bawah digeser, kolom AI dibuka,
   * sidebar toggled), and ResizeObserver does not see a shift.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !pane.url) return;
    let raf = 0;
    let kunciLalu = '';
    let terlihatLalu: boolean | null = null;

    const tik = () => {
      const r = el.getBoundingClientRect();
      /**
       * Webview anak melayang di atas segalanya — termasuk modal dan dialog
       * that should cover it. Without this check, the Command Palette dialog
       * Palette muncul "di belakang" halaman web dan tidak bisa diklik.
       */
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
      raf = requestAnimationFrame(tik);
    };
    raf = requestAnimationFrame(tik);
    return () => cancelAnimationFrame(raf);
  }, [pane.id, pane.url]);

  /**
   * Ikuti halaman: perbarui kolom alamat dan judul saat pengguna berpindah
   * halaman di dalam webview. Tanpa ini, kolom alamat berbohong setiap kali
   * navigasi terjadi dari dalam halaman.
   */
  useEffect(() => {
    if (!pane.url) return;
    const t = window.setInterval(() => {
      if (!siapRef.current) return;
      void cmd
        .browserPaneInfo(pane.id)
        .then((i) => {
          setLive({ url: i.url, title: i.title });
          if (i.url && i.url !== urlRef.current) setPaneUrl(pane.id, i.url);
        })
        .catch(() => {});
    }, 900);
    return () => window.clearInterval(t);
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
              <p className="bp-blocked-title">Halaman tidak bisa dimuat</p>
              <p className="bp-blocked-body">
                <code>{shortUrl(pane.url)}</code> — {galat}
              </p>
              <div className="bp-blocked-actions">
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="bp-open-external"
                  onClick={() => void openUrl(pane.url as string).catch(() => {})}
                >
                  Buka di browser eksternal
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
