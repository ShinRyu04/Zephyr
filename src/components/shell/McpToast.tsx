// McpToast.tsx — notifikasi kecil saat AI CLI melakukan sesuatu yang perlu
// disadari user (fase 12).
//
// Alasan ada: MCP membuat proses lain bisa mengemudikan jendela ini. Kalau
// agent mengambil screenshot pane, user harus melihatnya — bukan mengetahuinya
// nanti dari file di %TEMP%. Toast tampil 4 detik lalu hilang sendiri.

import { useEffect } from 'react';
import { useMcp } from '../../lib/mcpStore';

export default function McpToast() {
  const toast = useMcp((s) => s.toast);
  const setToast = useMcp((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;

  return (
    <div className="mcp-toast" role="status" data-testid="mcp-toast">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M2.6 11.4V6.2a2 2 0 012-2h6.8a2 2 0 012 2v5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M5.4 11.4V7.6M8 11.4V6.8M10.6 11.4V8.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span>{toast}</span>
      <button
        className="mcp-toast-x"
        aria-label="Tutup notifikasi"
        data-testid="mcp-toast-x"
        onClick={() => setToast(null)}
      >
        ✕
      </button>
    </div>
  );
}
