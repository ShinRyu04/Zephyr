// CrashDialog.tsx — fase 14.6: panic Rust / error frontend yang tidak
// tertangkap ditampilkan sekali, dengan lokasi file log-nya.
//
// Kenapa dialog, bukan toast: panic berarti ada state yang mungkin sudah tidak
// konsisten. User harus tahu, bukan melihat notifikasi 3 detik lalu lupa.
// Toast tetap dipakai untuk unhandledRejection biasa (di App.tsx).

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';

interface PanicPayload {
  message: string;
  location: string;
  logFile: string | null;
}

/** Guard modul: listener `app-panic` hanya boleh terpasang sekali
 *  (StrictMode dev menjalankan effect dua kali → dialog dobel). */
let panicListenerBound = false;

export default function CrashDialog() {
  const [info, setInfo] = useState<PanicPayload | null>(null);

  useEffect(() => {
    if (panicListenerBound) return;
    panicListenerBound = true;
    void listen<PanicPayload>('app-panic', (e) => setInfo(e.payload)).catch(() => {
      /* non-Tauri */
    });
  }, []);

  if (!info) return null;

  return (
    <div className="crash-backdrop" role="alertdialog" aria-modal="true" data-testid="crash-dialog">
      <div className="crash-card">
        <h2 className="crash-title">Zephyr mengalami masalah</h2>
        <p className="crash-sub">
          Log sudah tersimpan. Tab yang belum disimpan sebaiknya disimpan sekarang,
          lalu tutup dan buka Zephyr lagi.
        </p>

        <div className="crash-detail">
          <code data-testid="crash-message">{info.message}</code>
          {info.location && <span className="crash-loc">{info.location}</span>}
        </div>

        <div className="crash-actions">
          {info.logFile && (
            <button
              className="btn btn-sm"
              data-testid="crash-log"
              onClick={() => void openPath(info.logFile as string).catch(() => {})}
            >
              Buka file log
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            data-testid="crash-close"
            onClick={() => setInfo(null)}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
