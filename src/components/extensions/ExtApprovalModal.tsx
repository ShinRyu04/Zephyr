// ExtApprovalModal.tsx — dialog izin runtime eksternal ekstensi (fase 34).
// Muncul ketika worker ekstensi memanggil zephyr.exec() untuk runtime yang
// belum di-whitelist. Ini SATU-SATUNYA pintu persetujuan: tanpa klik
// "Izinkan", Rust menolak eksekusi apa pun.

import { useState } from 'react';
import { useExtApproval } from '../../lib/extApprovalStore';

export default function ExtApprovalModal() {
  const kepala = useExtApproval((s) => s.antrean[0]);
  const putuskan = useExtApproval((s) => s.putuskan);
  const [sibuk, setSibuk] = useState(false);

  if (!kepala) return null;

  const argsTeks = kepala.args.length > 0 ? kepala.args.join(' ') : '(tanpa argumen)';

  return (
    <div className="modal-backdrop" role="presentation" data-testid="ext-approval">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="ext-approval-title">
        <h2 className="modal-title" id="ext-approval-title">
          Izin runtime eksternal
        </h2>

        <p className="set-note">
          Ekstensi <strong>{kepala.extId}</strong> minta menjalankan{' '}
          <code>{kepala.runtime}</code> — <code>{kepala.binPath}</code> — dengan
          argumen <code>{argsTeks}</code>.
        </p>

        <p className="set-note">
          Eksekusi dilakukan Zephyr di sisi Rust, hanya lewat binary ini, dengan
          timeout otomatis. Ekstensi tidak mendapat akses sistem lain. Izin
          tersimpan di Settings → Ekstensi dan bisa dicabut kapan saja.
        </p>

        <div className="modal-actions">
          <button
            className="btn"
            data-testid="ext-approval-tolak"
            disabled={sibuk}
            onClick={() => void putuskan(false)}
          >
            Tolak
          </button>
          <button
            className="btn btn-primary"
            data-testid="ext-approval-izinkan"
            disabled={sibuk}
            onClick={async () => {
              setSibuk(true);
              await putuskan(true);
              setSibuk(false);
            }}
          >
            Izinkan &amp; jalankan
          </button>
        </div>
      </div>
    </div>
  );
}