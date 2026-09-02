// BrowserPane.tsx — pane 'browser' (Split With Browser). Final di fase 12.
//
// Implementasi = <iframe> di dalam webview Tauri. Konsekuensi jujur: situs yang
// mengirim X-Frame-Options / CSP frame-ancestors MENOLAK dimuat (google.com,
// github.com, dsb). Header respons tidak bisa dibaca dari dalam webview, jadi
// setiap navigasi ditanyakan dulu ke Rust (`browser_probe`) yang memeriksa
// header sungguhan — bukan menebak dari timeout. Untuk dev server lokal, kasus
// pemakaian utamanya, iframe bekerja.
//
// Riwayat back/forward dipegang sendiri (array url + kursor): history iframe
// lintas-origin tidak bisa diakses dari sini, jadi kita mencatat navigasi yang
// kita lakukan sendiri, bukan mengintip milik halaman.

import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTerminal } from '../../lib/terminalStore';
import * as cmd from '../../lib/commands';
import type { PaneMeta, ProbeResult } from '../../lib/types';

/** Batas tunggu sebelum sebuah URL dianggap menolak embed. */
const BLOCK_MS = 3500;

/** Lengkapi input user jadi URL yang bisa dimuat. */
export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)) {
    return `http://${t}`;
  }
  return `https://${t}`;
}

/** Tampilan ringkas untuk label tab pane: host + path pendek. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${p}`.slice(0, 28);
  } catch {
    return url.slice(0, 28);
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

export default function BrowserPane({ pane }: { pane: PaneMeta }) {
  const setPaneUrl = useTerminal((s) => s.setPaneUrl);
  const [draft, setDraft] = useState(pane.url ?? '');
  const [nonce, setNonce] = useState(0);
  /** jumlah event `load` — bukti nyata halaman terambil (isi DOM lintas-origin
   *  tidak bisa dibaca, jadi ini + log server adalah bukti yang sah). */
  const [loads, setLoads] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  /** riwayat navigasi pane ini + posisi kursor */
  const [hist, setHist] = useState<string[]>(pane.url ? [pane.url] : []);
  const [at, setAt] = useState(pane.url ? 0 : -1);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => setDraft(pane.url ?? ''), [pane.url]);

  // Setiap navigasi: tanya Rust apakah URL ini boleh di-embed. Ini yang
  // menentukan tampil-tidaknya panel "menolak embed" — bukan timeout.
  useEffect(() => {
    if (!pane.url) return;
    let batal = false;
    setBlocked(false);
    setProbe(null);
    setBusy(true);
    // Fallback bila probe sendiri menggantung: jangan biarkan "memuat…" abadi.
    const timer = window.setTimeout(() => {
      if (!batal) setBusy(false);
    }, BLOCK_MS);

    void cmd
      .browserProbe(pane.url)
      .then((r) => {
        if (batal) return;
        setProbe(r);
        setBusy(false);
        if (!r.embeddable) setBlocked(true);
      })
      .catch(() => {
        // Probe gagal bukan alasan menuduh situsnya memblokir; biarkan iframe
        // mencoba sendiri.
        if (!batal) setBusy(false);
      });

    return () => {
      batal = true;
      window.clearTimeout(timer);
    };
  }, [pane.url, nonce]);

  /** Navigasi baru (memotong riwayat di depan kursor, seperti browser). */
  const go = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setPaneUrl(pane.id, url);
    setHist((h) => [...h.slice(0, at + 1), url]);
    setAt((i) => i + 1);
    setNonce((n) => n + 1);
  };

  /** Pindah di riwayat tanpa menambah entri baru. */
  const jump = (delta: number) => {
    const next = at + delta;
    if (next < 0 || next >= hist.length) return;
    setAt(next);
    setPaneUrl(pane.id, hist[next]);
    setNonce((n) => n + 1);
  };

  const canBack = at > 0;
  const canFwd = at >= 0 && at < hist.length - 1;
  const secure = (pane.url ?? '').startsWith('https://');

  return (
    <div className="browser-pane" data-pane-body={pane.id} data-bp-blocked={blocked ? '1' : '0'}>
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
          title="Kembali"
          aria-label="Kembali"
          data-testid="bp-back"
          disabled={!canBack}
          onClick={() => jump(-1)}
        >
          <Icon d="M9.8 3.5L5.3 8l4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title="Maju"
          aria-label="Maju"
          data-testid="bp-fwd"
          disabled={!canFwd}
          onClick={() => jump(1)}
        >
          <Icon d="M6.2 3.5L10.7 8l-4.5 4.5" />
        </button>
        <button
          type="button"
          className="bp-btn"
          title="Muat ulang"
          aria-label="Muat ulang"
          data-testid="bp-reload"
          onClick={() => setNonce((n) => n + 1)}
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
          aria-label="Alamat URL"
          data-testid="bp-url"
          placeholder="http://localhost:5173"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="bp-btn bp-go" title="Buka URL" aria-label="Buka URL">
          Go
        </button>
        <button
          type="button"
          className="bp-btn"
          title="Buka di browser sistem"
          aria-label="Buka di browser sistem"
          data-testid="bp-external"
          onClick={() => void openUrl(pane.url ?? normalizeUrl(draft)).catch(() => {})}
        >
          <Icon d="M9.5 3h3.5v3.5M12.6 3.4L7.8 8.2M12 9.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.4" />
        </button>
      </form>

      {pane.url ? (
        <div className="bp-stage">
          <iframe
            ref={frameRef}
            key={`${pane.url}#${nonce}`}
            className="bp-frame"
            src={pane.url}
            title={`Browser ${pane.url}`}
            data-testid="bp-frame"
            data-loads={loads}
            onLoad={() => {
              setLoads((n) => n + 1);
              setBusy(false);
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          {busy && (
            <div className="bp-busy" data-testid="bp-busy">
              memuat…
            </div>
          )}
          {blocked && (
            <div className="bp-blocked" data-testid="bp-blocked" role="alert">
              <p className="bp-blocked-title">Situs ini menolak ditampilkan di dalam Zephyr</p>
              <p className="bp-blocked-body">
                <code>{shortUrl(pane.url)}</code> — {probe?.reason ?? 'server melarang embed.'}
                {probe?.header ? (
                  <>
                    {' '}
                    Header aslinya: <code data-testid="bp-blocked-header">{probe.header}</code>.
                  </>
                ) : null}{' '}
                Itu keputusan situsnya, bukan bug di sini — pane browser paling berguna untuk dev
                server lokal.
              </p>
              <div className="bp-blocked-actions">
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="bp-open-external"
                  onClick={() => void openUrl(pane.url as string).catch(() => {})}
                >
                  Buka di browser eksternal
                </button>
                <button
                  className="btn btn-sm"
                  data-testid="bp-retry"
                  onClick={() => setNonce((n) => n + 1)}
                >
                  Coba lagi
                </button>
                <button
                  className="btn btn-sm"
                  data-testid="bp-goto-local"
                  onClick={() => go(HOME)}
                >
                  Ke localhost:5173
                </button>
              </div>
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
