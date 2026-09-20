// UpdatePanel.tsx — UI auto-update di Settings → Tentang (fase 17.6.d).
//
// Endpoint rilis AKTIF: status yang paling sering muncul di sini 'up-to-date'
// (app sekelas dengan latest.json) atau 'available' (ada versi baru). Status
// 'unconfigured' tinggal penjaga lama untuk kasus endpoint kosong.
//
// Panel harus tetap informatif dan tidak error dalam kondisi apa pun
// (syarat 17.6.e).

import { useUpdater, labelStatus } from '../../lib/updaterStore';
import { Changelog } from './changelogRender';

const URL_RILIS = 'https://github.com/ShinRyu04/Zephyr/releases';

async function bukaRilis() {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(URL_RILIS);
  } catch {
    /* diam — link hanya pelengkap */
  }
}

export default function UpdatePanel({ versiSekarang }: { versiSekarang: string }) {
  const status = useUpdater((s) => s.status);
  const versi = useUpdater((s) => s.version);
  const pubDate = useUpdater((s) => s.pubDate);
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
          Endpoint update belum terisi. Isi <code>plugins.updater.endpoints</code> di{' '}
          <code>src-tauri/tauri.conf.json</code>, lalu build ulang — tombol di atas
          langsung berfungsi tanpa install ulang.
        </p>
      )}

      {dialogOpen && status === 'available' && (
        <div className="upd-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) tutup(); }}>
          <div className="upd-dialog" role="dialog" aria-modal="true" aria-labelledby="upd-title">
            <div className="upd-dialog-head">
              <span className="upd-dialog-ico" aria-hidden="true">✦</span>
              <div>
                <h2 className="upd-dialog-title" id="upd-title" data-testid="upd-dialog-title">
                  Zephyr v{versi} tersedia
                </h2>
                <p className="upd-sub" data-testid="upd-dialog-sub">
                  v{versiSekarang} → v{versi}{pubDate ? ` · ${new Date(pubDate).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </div>
              <button className="btn btn-sm upd-dialog-x" data-testid="upd-dialog-x" aria-label="Tutup" onClick={tutup}>
                ✕
              </button>
            </div>
            <div className="upd-dialog-notes" data-testid="upd-dialog-notes">
              {notes ? <Changelog teks={notes} /> : 'Tidak ada catatan rilis.'}
            </div>
            <div className="upd-dialog-actions">
              <button className="btn btn-link" data-testid="upd-dialog-github" onClick={() => void bukaRilis()} title={URL_RILIS}>
                Lihat di GitHub
              </button>
              <span className="sb-spacer" />
              <button className="btn" data-testid="upd-dialog-later" onClick={tutup}>
                Nanti
              </button>
              <button className="btn btn-primary" data-testid="upd-dialog-ok" onClick={() => void unduh()}>
                Download & install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
