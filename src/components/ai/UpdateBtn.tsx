import { useEffect, useState } from 'react';
import { useUpdater } from '../../lib/updaterStore';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { useDragPopup } from '../../lib/useDragPopup';
import ZephyrLogo from '../shell/ZephyrLogo';

/*
 * The Update button, VSCode-style.
 *
 * Appears in the tab strip only when the updater has found a newer release,
 * and only after a short settle delay — VSCode does not interrupt a fresh
 * launch with an update affordance, it lets the window settle first. Pressing
 * it opens a small popup: the Zephyr mark, current version, latest version,
 * release date, and a Release Notes button that opens the notes as an editor
 * tab — the same shape as VSCode's "Update" badge and its "Restart to Update"
 * panel.
 *
 * The boot check (`cekUpdateStartup` in App.tsx) runs silently; this component
 * only renders the button when `status === 'available'`, so the strip stays
 * clean when there is nothing to update. It re-renders automatically because
 * it reads from the zustand store.
 */

/* How long after a release is found before the button appears. VSCode waits
   roughly this long so the badge does not fight the window's own startup. */
const SETTLE_MS = 20_000;

export default function UpdateBtn() {
  const tr = useT();
  const status = useUpdater((s) => s.status);
  const versi = useUpdater((s) => s.version);
  const pubDate = useUpdater((s) => s.pubDate);
  const notes = useUpdater((s) => s.notes);
  const appInfo = useStore((s) => s.appInfo);
  const [buka, setBuka] = useState(false);
  /*
   * Whether the settle delay has elapsed.
   *
   * Keyed off `status === 'available'`: the timer starts when a release is
   * found and is cancelled if the status changes (e.g. the user installs, or a
   * re-check clears it) so a stale timer cannot reveal the button after the
   * update is gone. Opening the popup from the bell is unaffected — this gate
   * is only about the title-bar button's own entrance.
   */
  const [reveal, setReveal] = useState(false);
  const { popupRef, onPointerDown } = useDragPopup();

  useEffect(() => {
    if (status !== 'available') {
      setReveal(false);
      return;
    }
    const t = setTimeout(() => setReveal(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [status]);

  /* Close on Escape. */
  useEffect(() => {
    if (!buka) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuka(false);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [buka]);

  /*
   * Rendered only when the updater found a release AND the settle delay passed.
   *
   * The boot check runs silently on startup (`cekUpdateStartup` in App.tsx);
   * this button is the always-visible door to the same thing — VSCode's update
   * badge — so it must not ask the network again on mount.
   */
  if (status !== 'available' || !versi || !reveal) return null;

  const tanggal = pubDate
    ? new Date(pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <span className="ai-upd-wrap">
      <button
        className="ai-upd-btn"
        data-testid="ai-update-btn"
        title={tr('Update available')}
        aria-label={tr('Update available')}
        aria-haspopup="dialog"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        {tr('Update')}
      </button>
      {buka && (
        <>
          <div className="ai-more-backdrop" onClick={() => setBuka(false)} />
          <div ref={popupRef} className="ai-upd-pop" data-testid="ai-update-pop" role="dialog" aria-label={tr('Update available')} style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}>
            <div className="ai-upd-head" data-drag-handle onPointerDown={onPointerDown} style={{ cursor: 'grab' }}>
              <span className="ai-upd-mark" aria-hidden="true">
                <ZephyrLogo size={32} />
              </span>
              <div className="ai-upd-titles">
                <b>{tr('Restart to Update')}</b>
                <span>Zephyr</span>
              </div>
            </div>
            <div className="ai-upd-baris">
              <span>{tr('Current Version')}</span>
              <b>{appInfo?.version ?? '?'}</b>
            </div>
            <div className="ai-upd-baris">
              <span>{tr('Latest Version')}</span>
              <b>{versi}</b>
            </div>
            {tanggal && (
              <div className="ai-upd-baris">
                <span>{tr('Released')}</span>
                <b>{tanggal}</b>
              </div>
            )}
            {notes && (
              <button
                className="ai-upd-notes-btn"
                data-testid="ai-update-notes"
                onClick={() => {
                  setBuka(false);
                  void import('../../lib/commands').then((c) =>
                    c.fsWrite(
                      `${appInfo?.dataDir ?? ''}/release-notes-${versi}.md`,
                      `# Zephyr ${versi}\n\n${notes}`,
                    ).then(() => {
                      void useStore.getState().openPath(`${appInfo?.dataDir ?? ''}/release-notes-${versi}.md`);
                    }),
                  );
                }}
              >
                {tr('Release Notes')}
              </button>
            )}
            <div className="ai-upd-actions">
              <button
                className="ai-upd-install"
                data-testid="ai-update-install"
                onClick={() => {
                  setBuka(false);
                  void useUpdater.getState().unduhDanPasang();
                }}
              >
                {tr('Download & Install')}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
