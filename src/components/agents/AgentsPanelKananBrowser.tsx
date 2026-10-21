import { useEffect, useRef, useState, type ReactNode } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as cmd from '../../lib/commands';
import { HOME, normalizeUrl } from '../terminal/BrowserPane';
import { paneHarusTampil } from '../../lib/nativeOverlay';
import { useAgxTabs } from '../../lib/agentsTabs';
import ZephyrLogo from '../shell/ZephyrLogo';

/*
 * Browser di panel kanan — pane webview asli (BUKAN iframe), sama dengan
 * pane browser terminal: Google dan situs yang menolak iframe tetap bisa
 * dimuat karena webview-nya anak proses sendiri.
 *
 * Berbeda dari pane terminal, pane ini HIDUP hanya selama view Browser
 * terbuka: ditutup bersama view-nya (browserPaneClose), supaya satu panel
 * kanan tidak meninggalkan webview menggantung di belakang tampilan lain.
 */

export default function AgentsPanelKananBrowser({ bar, tab }: { bar?: ReactNode | null; tab?: { id: string; url?: string } }) {
  const [paneId] = useState(() => `agx-bp-${Date.now().toString(36)}`);
  /* Url awal dari tab (persit lintas pindah tab); `null` = halaman kosong. */
  const [url, setUrl] = useState<string | null>(tab?.url ?? null);
  const [draft, setDraft] = useState(tab?.url ?? '');
  const [live, setLive] = useState<{ url: string; title: string }>({ url: '', title: '' });
  const [galat, setGalat] = useState('');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const siapRef = useRef(false);

  const go = (raw: string) => {
    const u = normalizeUrl(raw);
    if (!u) return;
    setGalat('');
    setUrl(u);
    setDraft(u);
    /* Catat di tab: webview asli ditutup saat tab tidak aktif, tapi halaman
       terakhir harus dimuat ulang saat tab dibuka kembali. */
    if (tab) useAgxTabs.getState().setUrl(tab.id, u);
  };

  const nav = (aksi: string) => {
    void cmd.browserPaneNav(paneId, aksi).catch(() => {});
  };

  /* Buat/tutup webview mengikuti alamat. Pola geometri sama dengan
     BrowserPane: tunggu kontainer punya ukuran sebelum create. */
  useEffect(() => {
    if (!url) {
      siapRef.current = false;
      void cmd.browserPaneClose(paneId).catch(() => {});
      return;
    }
    setGalat('');
    let batal = false;
    const buka = () => {
      if (batal || siapRef.current) return;
      const r = stageRef.current?.getBoundingClientRect();
      if (!r || r.width < 4 || r.height < 4) return;
      void cmd
        .browserPaneOpen({ paneId, url, x: r.left, y: r.top, width: r.width, height: r.height })
        .then(() => {
          if (!batal) siapRef.current = true;
        })
        .catch((e: unknown) => {
          siapRef.current = false;
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
  }, [paneId, url]);

  /* Webview mengikuti kotaknya (scroll/resize) dan sembunyi saat tertutup
     overlay — jalan hidup hanya saat url terpasang. */
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
        void cmd.browserPaneVisible(paneId, terlihat).catch(() => {});
      }
      if (terlihat) {
        const kunci = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (kunci !== kunciLalu) {
          kunciLalu = kunci;
          void cmd
            .browserPaneBounds({ paneId, x: r.left, y: r.top, width: r.width, height: r.height })
            .catch(() => {});
        }
      }
    };
    const jadwalkan = () => {
      if (!raf) raf = requestAnimationFrame(tik);
    };
    const ro = new ResizeObserver(jadwalkan);
    ro.observe(el);
    window.addEventListener('resize', jadwalkan);
    window.addEventListener('scroll', jadwalkan, true);
    const net = window.setInterval(jadwalkan, 500);
    jadwalkan();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', jadwalkan);
      window.removeEventListener('scroll', jadwalkan, true);
      window.clearInterval(net);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [paneId, url]);

  /* Judul + url hidup: polling ringan seperti BrowserPane. */
  useEffect(() => {
    if (!url) return;
    const tik = () => {
      if (siapRef.current && !document.hidden) {
        void cmd
          .browserPaneInfo(paneId)
          .then((i) => setLive({ url: i.url, title: i.title }))
          .catch(() => {});
      }
    };
    const t = window.setInterval(tik, 900);
    return () => window.clearInterval(t);
  }, [paneId, url]);

  /* Webview mati bersama view. */
  useEffect(() => {
    const id = paneId;
    return () => {
      void cmd.browserPaneClose(id).catch(() => {});
    };
  }, [paneId]);

  const secure = live.url.startsWith('https://');

  return (
    <>
      {bar}
      <div className="agx-view-isi agx-browser" data-testid="agx-browser-view">
        <form
          className="agx-browser-bar"
          onSubmit={(e) => {
            e.preventDefault();
            go(draft);
          }}
        >
          <button type="button" className="bp-btn" title="Back" aria-label="Back" onClick={() => nav('back')}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M9.8 3.5L5.3 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="bp-btn" title="Forward" aria-label="Forward" onClick={() => nav('forward')}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M6.2 3.5L10.7 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="bp-btn" title="Reload" aria-label="Reload" onClick={() => nav('reload')}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M13 8a5 5 0 11-1.7-3.8M13 2.6V5h-2.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <span className={`bp-lock is-${secure ? 'https' : 'http'}`} title={secure ? 'HTTPS' : 'HTTP'}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                d={secure ? 'M4.8 7.2V5.6a3.2 3.2 0 016.4 0v1.6M4 7.2h8V13H4z' : 'M4 7.2h8V13H4zM6 7.2V5.6a2 2 0 013.6-1.2'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            className="bp-url"
            value={draft}
            spellCheck={false}
            aria-label="URL address"
            placeholder={HOME}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="bp-btn bp-go" title="Open URL">
            Go
          </button>
          <button
            type="button"
            className="bp-btn"
            title="Open in the system browser"
            onClick={() => void openUrl(live.url || normalizeUrl(draft)).catch(() => {})}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                d="M9.5 3h3.5v3.5M12.6 3.4L7.8 8.2M12 9.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </form>

        {!url ? (
          <div className="agx-view-kosong" data-testid="agx-browser-blank">
            {/* Ikon tengah = logo Zephyr yang sama dengan layar kosong editor
                (`SplitEditor`), diredupkan supaya tidak menyaingi teks. */}
            <span className="agx-browser-logo">
              <ZephyrLogo size={64} glyphOnly muted />
            </span>
            <span>Enter a URL then press Enter.</span>
            <button className="btn btn-sm" onClick={() => go(HOME)}>
              Open {HOME}
            </button>
          </div>
        ) : (
          <div className="agx-browser-stage" ref={stageRef} data-testid="agx-browser-stage">
            {galat && (
              <div className="agx-view-kosong" role="alert">
                <span>{galat}</span>
                <button className="btn btn-sm" onClick={() => void openUrl(url).catch(() => {})}>
                  Open in an external browser
                </button>
              </div>
            )}
            {live.title && <div className="bp-title">{live.title}</div>}
          </div>
        )}
      </div>
    </>
  );
}
