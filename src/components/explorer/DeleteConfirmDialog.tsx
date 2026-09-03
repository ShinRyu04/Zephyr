// DeleteConfirmDialog.tsx — konfirmasi hapus file/folder (fase 27).
//
// Menggantikan `window.confirm()` yang dulu dipakai Explorer. Alasannya bukan
// kosmetik: dialog native memblokir seluruh event loop WebView, tidak bisa
// di-tema, tidak bisa dibaca screen reader dengan konteks, dan TIDAK BISA
// diotomasi oleh harness verifikasi — jadi jalur hapus tidak pernah terbukti.

import { useEffect, useRef } from 'react';
import { useExplorer } from '../../lib/explorerStore';

const nama = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function DeleteConfirmDialog() {
  const pending = useExplorer((s) => s.pendingDelete);
  const cancel = useExplorer((s) => s.cancelDelete);
  // Dinamai `jalankanHapus`, BUKAN `confirm` — nama `confirm` di scope komponen
  // menyerupai `window.confirm` dan bikin audit "tidak ada confirm() native"
  // (V5 fase 27) menandainya sebagai temuan palsu.
  const jalankanHapus = useExplorer((s) => s.confirmDelete);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (pending) okRef.current?.focus();
  }, [pending]);

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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
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
