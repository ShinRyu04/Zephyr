// BrowserPane.tsx — pane 'browser' (Split With Browser, fase 06).
//
// Implementasi v1 = <iframe> di dalam webview Tauri. Konsekuensi jujur:
// situs yang mengirim X-Frame-Options/CSP frame-ancestors akan menolak
// dimuat (mis. google.com). Untuk dev server lokal — kasus pemakaian
// utamanya — ini bekerja. Tombol "Buka di jendela" memakai plugin opener
// sebagai jalan keluar untuk situs yang memblokir.

import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTerminal } from '../../lib/terminalStore';
import type { PaneMeta } from '../../lib/types';

/** Lengkapi input user jadi URL yang bisa dimuat. */
function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)) return `http://${t}`;
  return `https://${t}`;
}

export default function BrowserPane({ pane }: { pane: PaneMeta }) {
  const setPaneUrl = useTerminal((s) => s.setPaneUrl);
  const [draft, setDraft] = useState(pane.url ?? '');
  const [nonce, setNonce] = useState(0);
  /** jumlah kali iframe selesai memuat — bukti nyata halaman terambil.
   *  Isi DOM-nya tidak bisa dibaca dari luar (sandbox = origin lain),
   *  jadi event `load` + log server adalah bukti yang sah. */
  const [loads, setLoads] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => setDraft(pane.url ?? ''), [pane.url]);

  const go = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setPaneUrl(pane.id, url);
    setNonce((n) => n + 1);
  };

  return (
    <div className="browser-pane" data-pane-body={pane.id}>
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
          title="Muat ulang"
          aria-label="Muat ulang"
          data-testid="bp-reload"
          onClick={() => setNonce((n) => n + 1)}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M13 8a5 5 0 11-1.7-3.8M13 2.6V5h-2.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <input
          className="bp-url"
          value={draft}
          spellCheck={false}
          aria-label="Alamat URL"
          data-testid="bp-url"
          placeholder="http://localhost:8080"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="bp-btn bp-go" title="Buka URL" aria-label="Buka URL">
          Go
        </button>
        <button
          type="button"
          className="bp-btn"
          title="Buka di browser sistem (untuk situs yang menolak iframe)"
          aria-label="Buka di browser sistem"
          onClick={() => void openUrl(pane.url ?? normalizeUrl(draft)).catch(() => {})}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M9.5 3h3.5v3.5M12.6 3.4L7.8 8.2M12 9.6V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>

      {pane.url ? (
        <iframe
          ref={frameRef}
          key={`${pane.url}#${nonce}`}
          className="bp-frame"
          src={pane.url}
          title={`Browser ${pane.url}`}
          data-testid="bp-frame"
          data-loads={loads}
          onLoad={() => setLoads((n) => n + 1)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="bp-blank">Masukkan URL lalu tekan Enter</div>
      )}
    </div>
  );
}
