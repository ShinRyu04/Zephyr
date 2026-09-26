import { useT } from '../../lib/i18n';
import { useWs } from '../../lib/workspaceStore';

import { useFocusTrap } from '../../lib/useFocusTrap';

export default function TrustDialog() {
  const tr = useT();
  const tanyaUntuk = useWs((s) => s.tanyaUntuk);
  const setTrust = useWs((s) => s.setTrust);
  const tanya = useWs((s) => s.tanya);
  const roots = useWs((s) => s.roots);

  const trapRef = useFocusTrap<HTMLDivElement>({ aktif: !!tanyaUntuk });

  if (!tanyaUntuk) return null;

  const root = roots.find((r) => r.path.toLowerCase() === tanyaUntuk.toLowerCase());
  const sudahRestricted = root?.trust === 'restricted';

  return (
    <div className="trust-overlay" data-testid="trust-dialog">
      <div className="trust-card" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="trust-title">
        <div className="trust-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path
              d="M12 3l7.5 3v6c0 4.2-3 7.6-7.5 9-4.5-1.4-7.5-4.8-7.5-9V6L12 3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M8.6 12.2l2.3 2.3 4.4-4.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 id="trust-title" className="trust-title">
          {tr('Trust this folder?')}
        </h2>
        <p className="trust-path" title={tanyaUntuk} data-testid="trust-path">
          {tanyaUntuk}
        </p>

        <p className="trust-text">
          This folder can contain configuration that <strong>runs programs</strong> on your
          computer - <code>tasks.json</code>, <code>launch.json</code>, language servers, and extensions.
        </p>

        <ul className="trust-list">
          <li>
            <strong>Trust</strong> - tasks, debug, LSP, and extensions run normally.
          </li>
          <li>
            <strong>Restricted Mode</strong> - files can still be opened and edited, but nothing
            is run.
          </li>
        </ul>

        <div className="trust-actions">
          <button
            className="btn btn-primary"
            data-testid="trust-yes"
            onClick={() => void setTrust(tanyaUntuk, true)}
          >
            {tr('Trust this folder')}
          </button>
          <button
            className="btn"
            data-testid="trust-no"
            onClick={() => void setTrust(tanyaUntuk, false)}
          >
            {tr('Open in Restricted Mode')}
          </button>
        </div>

        {sudahRestricted && (
          
          <button className="trust-nanti" onClick={() => tanya(null)} data-testid="trust-close">
            {tr('Later')}
          </button>
        )}
      </div>
    </div>
  );
}
