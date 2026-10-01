import { useEffect, useRef } from 'react';
import { useExplorer } from '../../lib/explorerStore';
import { useT, useTf } from '../../lib/i18n';

import { useFocusTrap } from '../../lib/useFocusTrap';

const nama = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function DeleteConfirmDialog() {
  const tr = useT();
  const tf = useTf();
  const pending = useExplorer((s) => s.pendingDelete);
  const cancel = useExplorer((s) => s.cancelDelete);
  
  const jalankanHapus = useExplorer((s) => s.confirmDelete);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (pending) okRef.current?.focus();
  }, [pending]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!pending && pending.length > 0,
    onEscape: () => cancel(),
  });

  if (!pending || pending.length === 0) return null;

  const satu = pending.length === 1;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
      }}
    >
      <div className="modal" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="del-title">
        <h2 className="modal-title" id="del-title" data-testid="del-title">
          {satu ? `Delete "${nama(pending[0])}"?` : `Delete ${pending.length} items?`}
        </h2>
        <p className="modal-body" data-testid="del-body">
          {satu
            ? 'This item will be deleted PERMANENTLY (it will not go to the Recycle Bin and cannot be undone).'
            : `${pending.length} items will be deleted PERMANENTLY (they will not go to the Recycle Bin and cannot be undone).`}
        </p>
        {!satu && (
          <ul className="del-list" data-testid="del-list">
            {pending.slice(0, 8).map((p) => (
              <li key={p}>
                <code>{nama(p)}</code>
              </li>
            ))}
            {pending.length > 8 && <li className="side-muted">… and {pending.length - 8} more</li>}
          </ul>
        )}
        <div className="modal-actions">
          <button
            ref={okRef}
            className="btn btn-danger"
            data-testid="del-ok"
            onClick={() => void jalankanHapus()}
          >
            {satu ? tr('Delete') : tf('Delete {n} items', { n: pending.length })}
          </button>
          <button className="btn" data-testid="del-cancel" onClick={cancel}>
            {tr('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
