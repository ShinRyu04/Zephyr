// Toast.tsx — tumpukan toast kanan-bawah (fase 27).
//
// Satu-satunya tempat toast dirender. Notifikasi datang dari
// notificationStore; komponen ini tidak punya state sendiri supaya tidak ada
// dua sumber kebenaran (masalah yang mau diselesaikan fase 27).
//
// aria-live="polite" supaya screen reader membacakannya tanpa memotong
// pekerjaan user (syarat a11y fase 31).

import { useNotif, type Notif } from '../../lib/notificationStore';
import { runCommand } from '../../lib/commandRegistry';

function Ikon({ severity }: { severity: Notif['severity'] }) {
  const p = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none' as const };
  const st = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const };
  if (severity === 'error') {
    return (
      <svg {...p} aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" {...st} />
        <path d="M8 4.9v4.2M8 11.1v.6" {...st} />
      </svg>
    );
  }
  if (severity === 'warn') {
    return (
      <svg {...p} aria-hidden="true">
        <path d="M8 2.2l5.9 11.2H2.1z" {...st} />
        <path d="M8 6.3v3.1M8 11.2v.6" {...st} />
      </svg>
    );
  }
  return (
    <svg {...p} aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" {...st} />
      <path d="M8 7.2v4M8 4.7v.6" {...st} />
    </svg>
  );
}

export default function Toast() {
  const items = useNotif((s) => s.items);
  const toasts = useNotif((s) => s.toasts);
  const dismiss = useNotif((s) => s.dismiss);

  // Selector zustand v5 tidak boleh mengembalikan array baru (pelajaran fase
  // 09), jadi keduanya diambil mentah lalu dipetakan di sini.
  const tampil = toasts
    .map((id) => items.find((x) => x.id === id))
    .filter((x): x is Notif => !!x)
    .slice(0, 5);

  if (tampil.length === 0) return null;

  return (
    <div className="toast-stack" data-testid="toast-stack" aria-live="polite" aria-atomic="false">
      {tampil.map((n) => (
        <div
          key={n.id}
          className={`toast is-${n.severity}`}
          data-testid="toast"
          data-severity={n.severity}
          data-notif-id={n.id}
          role={n.severity === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-ico">
            <Ikon severity={n.severity} />
          </span>

          <div className="toast-body">
            <span className="toast-msg" data-testid="toast-msg">
              {n.message}
            </span>
            {n.detail && <span className="toast-detail">{n.detail}</span>}

            {n.progress !== undefined && (
              <div
                className="toast-bar"
                data-testid="toast-bar"
                data-indeterminate={n.progress === 'indeterminate' ? '1' : '0'}
              >
                <div
                  className="toast-bar-fill"
                  style={{
                    width: n.progress === 'indeterminate' ? '35%' : `${n.progress}%`,
                  }}
                />
              </div>
            )}

            {n.actions.length > 0 && (
              <div className="toast-actions">
                {n.actions.map((a) => (
                  <button
                    key={a.command}
                    className="btn btn-sm"
                    data-testid="toast-action"
                    data-command={a.command}
                    onClick={() => {
                      void runCommand(a.command);
                      dismiss(n.id);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="toast-close"
            data-testid="toast-close"
            title="Tutup"
            aria-label="Tutup notifikasi"
            onClick={() => dismiss(n.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
