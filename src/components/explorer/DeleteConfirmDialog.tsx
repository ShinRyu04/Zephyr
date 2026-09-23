import { useEffect, useRef } from 'react';
import { useExplorer } from '../../lib/explorerStore';

import { useFocusTrap } from '../../lib/useFocusTrap';

const nama = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function DeleteConfirmDialog() {
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
          {satu ? `Hapus "${nama(pending[0])}"?` : `Hapus ${pending.length} item?`}
        </h2>
        <p className="modal-body" data-testid="del-body">
          {satu
            ? 'Item ini akan dihapus PERMANEN (tidak masuk Recycle Bin dan tidak bisa di-undo).'
            : `${pending.length} item akan dihapus PERMANEN (tidak masuk Recycle Bin dan tidak bisa di-undo).`}
        </p>
        {!satu && (
          <ul className="del-list" data-testid="del-list">
            {pending.slice(0, 8).map((p) => (
              <li key={p}>
                <code>{nama(p)}</code>
              </li>
            ))}
            {pending.length > 8 && <li className="side-muted">… dan {pending.length - 8} lagi</li>}
          </ul>
        )}
        <div className="modal-actions">
          <button
            ref={okRef}
            className="btn btn-danger"
            data-testid="del-ok"
            onClick={() => void jalankanHapus()}
          >
            {satu ? 'Hapus' : `Hapus ${pending.length} item`}
          </button>
          <button className="btn" data-testid="del-cancel" onClick={cancel}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
