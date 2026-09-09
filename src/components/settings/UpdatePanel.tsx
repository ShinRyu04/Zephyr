// UpdatePanel.tsx — UI auto-update di Settings → Tentang (fase 17.6.d).
//
// Endpoint rilis AKTIF: status yang paling sering muncul di sini 'up-to-date'
// (app sekelas dengan latest.json) atau 'available' (ada versi baru). Status
// 'unconfigured' tinggal penjaga lama untuk kasus endpoint kosong.
//
// Panel harus tetap informatif dan tidak error dalam kondisi apa pun
// (syarat 17.6.e).

import { useUpdater, labelStatus } from '../../lib/updaterStore';

export default function UpdatePanel({ versiSekarang }: { versiSekarang: string }) {
  const status = useUpdater((s) => s.status);
  const versi = useUpdater((s) => s.version);
  const notes = useUpdater((s) => s.notes);
  const progress = useUpdater((s) => s.progress);
  const message = useUpdater((s) => s.message);
  const dialogOpen = useUpdater((s) => s.dialogOpen);
  const check = useUpdater((s) => s.check);
  const unduh = useUpdater((s) => s.unduhDanPasang);
  const restart = useUpdater((s) => s.restart);
  const tutup = useUpdater((s) => s.tutupDialog);

  const sibuk = status === 'checking' || status === 'downloading';

  return (
    <div className="upd" data-testid="upd-panel" data-status={status}>
      <div className="diag-head">
        <span className="diag-title">Update</span>
        <code className="upd-versi" data-testid="upd-versi">
          v{versiSekarang}
        </code>

        {status === 'available' ? (
          <button className="btn btn-sm btn-primary" data-testid="upd-install" onClick={() => void unduh()}>
            {labelStatus(status, versi, progress)}
          </button>
        ) : status === 'ready' ? (
          <button className="btn btn-sm btn-primary" data-testid="upd-restart" onClick={() => void restart()}>
            Restart sekarang
          </button>
        ) : (
          <button
            className="btn btn-sm"
            data-testid="upd-check"
            disabled={sibuk}
            onClick={() => void check()}
          >
            {labelStatus(status, versi, progress)}
          </button>
        )}
      </div>

      {status === 'downloading' && (
        <div className="upd-bar" data-testid="upd-bar" aria-label={`Mengunduh ${progress}%`}>
          <div className="upd-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {message && (
        <p
          className={`set-note${status === 'error' ? ' diag-err' : ''}`}
          data-testid="upd-message"
        >
          {message}
        </p>
      )}

      {status === 'unconfigured' && (
        <p className="set-note" data-testid="upd-note">
          Zephyr punya kerangka auto-update lengkap (keypair + artefak
          <code> .msi.zip</code> + <code>.sig</code>), tetapi URL rilis belum
          diisi karena belum ada hosting. Setelah URL ada, tombol di atas
          langsung berfungsi tanpa install ulang.
        </p>
      )}

      {dialogOpen && status === 'available' && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="upd-title">
            <h2 className="modal-title" id="upd-title" data-testid="upd-dialog-title">
              Zephyr v{versi} tersedia
            </h2>
            <p className="modal-body" data-testid="upd-dialog-notes">
              {notes || 'Tidak ada catatan rilis.'}
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" data-testid="upd-dialog-ok" onClick={() => void unduh()}>
                Update sekarang
              </button>
              <button className="btn" data-testid="upd-dialog-later" onClick={tutup}>
                Nanti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
