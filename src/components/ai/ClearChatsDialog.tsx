// ClearChatsDialog.tsx — konfirmasi "hapus semua riwayat chat" (1.1.10).
//
// Kenapa dialog sendiri, bukan window.confirm(): pola yang sama dipakai
// DeleteConfirmDialog/ScmConfirmDialog — dialog native memblokir event loop
// WebView, tidak bisa di-tema, dan TIDAK BISA diotomasi harness verifikasi.
//
// Kenapa perlu konfirmasi sama sekali: `clearAllChats` menghapus SEMUA sesi
// sekaligus tanpa undo. Satu klik salah = seluruh riwayat hilang.

import { useEffect, useRef } from 'react';
import { useAi } from '../../lib/aiStore';
// fase 31: kurung fokus di dalam dialog. `aria-modal` hanya memberi tahu
// screen reader — ia TIDAK mengurung fokus keyboard.
import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ClearChatsDialog() {
  const open = useAi((s) => s.clearAllOpen);
  const jumlah = useAi((s) => s.sessions.length);
  const setOpen = useAi((s) => s.setClearAllOpen);
  const clearAll = useAi((s) => s.clearAllChats);
  const batalRef = useRef<HTMLButtonElement | null>(null);

  // Fokus ke "Batal" (bukan tombol hapus): Enter refleks tidak menghapus
  // seluruh riwayat. Sama seperti pola destruktif lain di app ini.
  useEffect(() => {
    if (open) batalRef.current?.focus();
  }, [open]);

  // Hook WAJIB di atas early return: dipanggil bersyarat membuat React
  // melempar "Rendered fewer hooks than expected" saat dialog dibuka.
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
          Hapus semua riwayat chat?
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
            Hapus semua
          </button>
        </div>
      </div>
    </div>
  );
}
