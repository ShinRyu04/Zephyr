// UpdatePanel.tsx — UI auto-update di Settings → Tentang (fase 17.6.d).
//
// Endpoint rilis AKTIF: status yang paling sering muncul di sini 'up-to-date'
// (app sekelas dengan latest.json) atau 'available' (ada versi baru). Status
// 'unconfigured' tinggal penjaga lama untuk kasus endpoint kosong.
//
// Panel harus tetap informatif dan tidak error dalam kondisi apa pun
// (syarat 17.6.e).

import { useUpdater, labelStatus } from '../../lib/updaterStore';
import { useT, useTf, translate } from '../../lib/i18n';
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
  const tr = useT();
  const tf = useTf();
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

  // Teks dev-mode versi Indonesia dipakai sebagai "sidik jari": kalau pesan di
  // store sama dengan ini, artinya pesannya statis (bukan hasil server) dan
  // boleh dihitung ulang dari kamus bahasa yang aktif.
  const pesanDev = translate('id', 'update.devMode');

  /**
   * Pesan yang bergantung HANYA pada status (bukan data dari server) dihitung
   * ulang di sini, bukan dibaca dari store. Kalau disimpan saat check() jalan,
   * teksnya ikut membeku dalam bahasa yang aktif saat itu — mengganti bahasa
   * tidak mengubahnya sampai app di-reload.
   * Pesan yang memuat nilai dari server (versi, persen, teks error) tetap
   * dipakai apa adanya karena sudah diterjemahkan saat dibuat.
   */
  const pesanTampil =
    status === 'unconfigured'
      ? tr('update.unconfigured')
      : status === 'up-to-date'
        ? tr('update.upToDate')
        : // Mode dev: pesannya informatif murni (tidak ada nilai dari server),
          // jadi selalu ambil dari kamus bahasa yang sedang aktif.
          pesanDev === message
          ? tr('update.devMode')
          : message;

  return (
    <div className="upd" data-testid="upd-panel" data-status={status}>
      <div className="diag-head">
        <span className="diag-title">{tr('update.title')}</span>
        <code className="upd-versi" data-testid="upd-versi">
          v{versiSekarang}
        </code>

        {status === 'available' ? (
          <button className="btn btn-sm btn-primary" data-testid="upd-install" onClick={() => void unduh()}>
            {labelStatus(status, versi, progress)}
          </button>
        ) : status === 'ready' ? (
          <button className="btn btn-sm btn-primary" data-testid="upd-restart" onClick={() => void restart()}>
            {tr('update.restartNow')}
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
        <div className="upd-bar" data-testid="upd-bar" aria-label={tf('update.downloading', { p: progress })}>
          <div className="upd-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {message && (
        <p
          className={`set-note${status === 'error' ? ' diag-err' : ''}`}
          data-testid="upd-message"
        >
          {pesanTampil}
        </p>
      )}

      {status === 'unconfigured' && (
        <p className="set-note" data-testid="upd-note">
          {tr('update.unconfiguredHint')}
        </p>
      )}

      {dialogOpen && status === 'available' && (
        <div className="upd-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) tutup(); }}>
          <div className="upd-dialog" role="dialog" aria-modal="true" aria-labelledby="upd-title">
            <div className="upd-dialog-head">
              <span className="upd-dialog-ico" aria-hidden="true">✦</span>
              <div>
                <h2 className="upd-dialog-title" id="upd-title" data-testid="upd-dialog-title">
                  {tf('update.available', { v: versi ?? '?' })}
                </h2>
                <p className="upd-sub" data-testid="upd-dialog-sub">
                  v{versiSekarang} → v{versi}{pubDate ? ` · ${new Date(pubDate).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </div>
              <button className="btn btn-sm upd-dialog-x" data-testid="upd-dialog-x" aria-label={tr('common.close')} onClick={tutup}>
                ✕
              </button>
            </div>
            <div className="upd-dialog-notes" data-testid="upd-dialog-notes">
              {notes ? <Changelog teks={notes} /> : tr('update.noNotes')}
            </div>
            <div className="upd-dialog-actions">
              <button className="btn btn-link" data-testid="upd-dialog-github" onClick={() => void bukaRilis()} title={URL_RILIS}>
                {tr('update.viewOnGithub')}
              </button>
              <span className="sb-spacer" />
              <button className="btn" data-testid="upd-dialog-later" onClick={tutup}>
                {tr('update.later')}
              </button>
              <button className="btn btn-primary" data-testid="upd-dialog-ok" onClick={() => void unduh()}>
                {tr('update.downloadInstall')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
