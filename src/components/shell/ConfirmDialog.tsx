// ConfirmDialog.tsx — dialog "tab belum disimpan": [Simpan][Jangan Simpan][Batal].
// Dipakai saat tutup tab kotor dan saat menutup window dengan tab kotor.

import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';
// fase 31: kurung fokus di dalam dialog. `aria-modal` hanya memberi tahu
// screen reader — ia TIDAK mengurung fokus keyboard.
import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm);
  const tabs = useStore((s) => s.tabs);
  const resolveConfirm = useStore((s) => s.resolveConfirm);
  const saveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirm) saveRef.current?.focus();
  }, [confirm]);

  // Hook WAJIB di atas early return: dipanggil bersyarat membuat React
  // melempar "Rendered fewer hooks than expected" saat dialog dibuka.
  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!confirm,
    onEscape: () => void resolveConfirm('cancel'),
  });

  if (!confirm) return null;

  const currentId = confirm.tabIds[0];
  const tab = tabs.find((t) => t.id === currentId);
  const remaining = confirm.tabIds.length;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') void resolveConfirm('cancel');
      }}
    >
      <div className="modal" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <h2 className="modal-title" id="cf-title">
          Simpan perubahan pada {tab?.name ?? 'file ini'}?
        </h2>
        <p className="modal-body">
          Perubahan akan hilang bila tidak disimpan.
          {remaining > 1 && ` (${remaining} file belum disimpan)`}
        </p>
        <div className="modal-actions">
          <button ref={saveRef} className="btn btn-primary" onClick={() => void resolveConfirm('save')}>
            Simpan
          </button>
          <button className="btn btn-danger" onClick={() => void resolveConfirm('discard')}>
            Jangan Simpan
          </button>
          <button className="btn" onClick={() => void resolveConfirm('cancel')}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
