import { useT } from '../../lib/i18n';
import { useEffect, useRef } from 'react';
import { useAi } from '../../lib/aiStore';

import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ClearChatsDialog() {
  const tr = useT();
  const open = useAi((s) => s.clearAllOpen);
  const jumlah = useAi((s) => s.sessions.length);
  const setOpen = useAi((s) => s.setClearAllOpen);
  const clearAll = useAi((s) => s.clearAllChats);
  const batalRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) batalRef.current?.focus();
  }, [open]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: open,
    onEscape: () => setOpen(false),
  });

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div className="modal" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="clr-title">
        <h2 className="modal-title" id="clr-title" data-testid="clr-title">
          {tr('Hapus semua riwayat chat?')}
        </h2>
        <p className="modal-body" data-testid="clr-body">
          {jumlah} percakapan akan dihapus PERMANEN dan tidak bisa dikembalikan.
          Satu sesi kosong akan dibuka setelahnya.
        </p>
        <div className="modal-actions">
          <button
            ref={batalRef}
            className="btn"
            data-testid="clr-cancel"
            onClick={() => setOpen(false)}
          >
            Batal
          </button>
          <button
            className="btn btn-danger"
            data-testid="clr-ok"
            onClick={() => clearAll()}
          >
            {tr('Hapus semua')}
          </button>
        </div>
      </div>
    </div>
  );
}
