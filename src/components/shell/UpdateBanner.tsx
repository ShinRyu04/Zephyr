import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import { Changelog } from '../settings/changelogRender';

export default function UpdateBanner() {
  const tr = useT();
  const banner = useStore((s) => s.updateBanner);
  const setUpdateBanner = useStore((s) => s.setUpdateBanner);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [lihat, setLihat] = useState(false);

  if (!banner) return null;

  const judul = tr('update.done').replace('{v}', banner.version);

  return (
    <>
      <div className="upd-banner" data-testid="upd-banner" role="status">
        <span className="upd-banner-ico" aria-hidden="true">
          ✦
        </span>
        <span className="upd-banner-text">
          <strong>{judul}</strong>
          <span className="upd-banner-notes">{tr('update.doneHint')}</span>
        </span>
        {banner.notes && (
          <button
            className="btn btn-sm"
            data-testid="upd-banner-notes"
            onClick={() => setLihat(true)}
          >
            {tr('update.whatsNew')}
          </button>
        )}
        <button
          className="btn btn-sm upd-dialog-x"
          data-testid="upd-banner-close"
          aria-label={tr('common.close')}
          onClick={() => setUpdateBanner(null)}
        >
          ✕
        </button>
      </div>

      {lihat && banner.notes && (
        <div
          className="upd-backdrop"
          role="presentation"
          data-testid="upd-done-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLihat(false);
          }}
        >
          <div className="upd-dialog" role="dialog" aria-modal="true" aria-labelledby="upd-done-title">
            <div className="upd-dialog-head">
              <span className="upd-dialog-ico" aria-hidden="true">✦</span>
              <div>
                <h2 className="upd-dialog-title" id="upd-done-title" data-testid="upd-done-title">
                  {judul}
                </h2>
              </div>
              <button
                className="btn btn-sm upd-dialog-x"
                aria-label={tr('common.close')}
                onClick={() => setLihat(false)}
              >
                ✕
              </button>
            </div>
            <div className="upd-dialog-notes" data-testid="upd-done-notes">
              <Changelog teks={banner.notes} />
            </div>
            <div className="upd-dialog-actions">
              <span className="sb-spacer" />
              <button
                className="btn"
                data-testid="upd-done-changelog"
                onClick={() => {
                  setLihat(false);
                  useSettingsUi.getState().setSection('about');
                  setSettingsOpen(true);
                }}
              >
                {tr('update.fullChangelog')}
              </button>
              <button className="btn btn-primary" data-testid="upd-done-ok" onClick={() => setLihat(false)}>
                {tr('common.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
