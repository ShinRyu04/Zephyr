import { useT, useTf } from '../../lib/i18n';
import { useNotif, type Notif } from '../../lib/notificationStore';
import { runCommand } from '../../lib/commandRegistry';
import { Changelog } from '../settings/changelogRender';
import { tx } from '../../lib/i18n';

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
        {n.detail && <span className="nc-detail"><Changelog teks={n.detail} /></span>}
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
        title={tx('Remove from history')}
        aria-label={tx('Remove this notification')}
        onClick={() => remove(n.id)}
      >
        ✕
      </button>
    </li>
  );
}

export function NotifBell() {
  const tr = useT();
  const tf = useTf();
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
          ? tr('Notifications muted (Do Not Disturb) - click to view history')
          : unread > 0
            ? tf('{n} unread notifications', { n: unread })
            : tr('Notifications')
      }
      aria-label={tr('Notifications')}
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

export default function NotificationCenter() {
  const tr = useT();
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
      <aside className="nc-panel" data-testid="nc-panel" aria-label={tr('Notifications')}>
        <header className="nc-head">
          <span className="nc-title">{tr('Notifications')}</span>
          <span className="nc-count" data-testid="nc-total">
            {items.length}
          </span>
          <span className="sb-spacer" />
          <button
            className={`btn btn-sm${dnd ? ' btn-primary' : ''}`}
            data-testid="nc-dnd"
            aria-pressed={dnd}
            title={tr('Do Not Disturb: toasts are muted, history is still recorded')}
            onClick={toggleDnd}
          >
            {dnd ? tr('DND active') : tr('Do Not Disturb')}
          </button>
          <button className="btn btn-sm" data-testid="nc-read-all" onClick={markAllRead}>
            {tr('Mark all read')}
          </button>
          <button className="btn btn-sm" data-testid="nc-clear" onClick={clear}>
            {tr('Clear')}
          </button>
          <button className="btn btn-sm" data-testid="nc-close" onClick={() => setOpen(false)}>
            {tr('Close')}
          </button>
        </header>

        {items.length === 0 ? (
          <p className="side-muted nc-empty" data-testid="nc-empty">
            {tr('No notifications yet.')}
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
