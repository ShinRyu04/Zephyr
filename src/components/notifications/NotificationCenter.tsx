// NotificationCenter.tsx — lonceng di status bar + panel riwayat (fase 27).
//
// Lonceng menampilkan badge jumlah yang belum dibaca. Klik = buka panel;
// membuka panel otomatis menandai semuanya terbaca (kalau tidak, badge-nya
// tidak pernah hilang dan jadi noise). Ikon berubah saat Do Not Disturb aktif
// supaya user tahu toast sedang diredam — bukan app-nya diam.

import { useNotif, type Notif } from '../../lib/notificationStore';
import { runCommand } from '../../lib/commandRegistry';

const waktu = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

function Baris({ n }: { n: Notif }) {
  const remove = useNotif((s) => s.remove);
  return (
    <li className={`nc-item is-${n.severity}`} data-testid="nc-item" data-severity={n.severity}>
      <span className={`nc-dot is-${n.severity}`} aria-hidden="true" />
      <div className="nc-body">
        <span className="nc-msg">{n.message}</span>
        {n.detail && <span className="nc-detail">{n.detail}</span>}
        <span className="nc-meta">
          {waktu(n.timestamp)}
          {n.source ? ` · ${n.source}` : ''}
        </span>
        {n.actions.length > 0 && (
          <div className="nc-actions">
            {n.actions.map((a) => (
              <button
                key={a.command}
                className="btn btn-sm"
                data-testid="nc-action"
                onClick={() => void runCommand(a.command)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="nc-x"
        title="Hapus dari riwayat"
        aria-label="Hapus notifikasi ini"
        onClick={() => remove(n.id)}
      >
        ✕
      </button>
    </li>
  );
}

/** Tombol lonceng — dipasang di StatusBar. */
export function NotifBell() {
  const unread = useNotif((s) => s.items.filter((x) => !x.read).length);
  const dnd = useNotif((s) => s.dnd);
  const open = useNotif((s) => s.centerOpen);
  const toggle = useNotif((s) => s.toggleCenter);

  return (
    <button
      className={`sb-item sb-bell${open ? ' is-active' : ''}${dnd ? ' is-dnd' : ''}`}
      data-testid="nc-bell"
      data-unread={unread}
      data-dnd={dnd ? '1' : '0'}
      title={
        dnd
          ? 'Notifikasi diredam (Do Not Disturb) — klik untuk melihat riwayat'
          : unread > 0
            ? `${unread} notifikasi belum dibaca`
            : 'Notifikasi'
      }
      aria-label="Notifikasi"
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" className="sb-bell-ico" aria-hidden="true">
        <path
          d="M8 2.2c-2 0-3.4 1.5-3.4 3.4 0 2.6-.9 3.5-1.4 4 -.3.3-.1.8.3.8h9c.4 0 .6-.5.3-.8 -.5-.5-1.4-1.4-1.4-4C11.4 3.7 10 2.2 8 2.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path d="M6.6 12.4a1.5 1.5 0 002.8 0" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        {dnd && <path d="M2.6 13.4L13.4 2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />}
      </svg>
      {unread > 0 && !dnd && (
        <span className="sb-bell-badge" data-testid="nc-badge">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

/** Panel riwayat — dipasang sekali di App.tsx. */
export default function NotificationCenter() {
  const open = useNotif((s) => s.centerOpen);
  const items = useNotif((s) => s.items);
  const dnd = useNotif((s) => s.dnd);
  const setOpen = useNotif((s) => s.setCenterOpen);
  const clear = useNotif((s) => s.clear);
  const markAllRead = useNotif((s) => s.markAllRead);
  const toggleDnd = useNotif((s) => s.toggleDnd);

  if (!open) return null;

  return (
    <div
      className="nc-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <aside className="nc-panel" data-testid="nc-panel" aria-label="Notifikasi">
        <header className="nc-head">
          <span className="nc-title">Notifikasi</span>
          <span className="nc-count" data-testid="nc-total">
            {items.length}
          </span>
          <span className="sb-spacer" />
          <button
            className={`btn btn-sm${dnd ? ' btn-primary' : ''}`}
            data-testid="nc-dnd"
            aria-pressed={dnd}
            title="Do Not Disturb: toast diredam, riwayat tetap dicatat"
            onClick={toggleDnd}
          >
            {dnd ? 'DND aktif' : 'Do Not Disturb'}
          </button>
          <button className="btn btn-sm" data-testid="nc-read-all" onClick={markAllRead}>
            Tandai terbaca
          </button>
          <button className="btn btn-sm" data-testid="nc-clear" onClick={clear}>
            Bersihkan
          </button>
          <button className="btn btn-sm" data-testid="nc-close" onClick={() => setOpen(false)}>
            Tutup
          </button>
        </header>

        {items.length === 0 ? (
          <p className="side-muted nc-empty" data-testid="nc-empty">
            Belum ada notifikasi.
          </p>
        ) : (
          <ul className="nc-list" data-testid="nc-list">
            {items.map((n) => (
              <Baris key={n.id} n={n} />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
