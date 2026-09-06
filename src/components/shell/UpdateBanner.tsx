import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';

export default function UpdateBanner() {
  const banner = useStore((s) => s.updateBanner);
  const setUpdateBanner = useStore((s) => s.setUpdateBanner);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  if (!banner) return null;

  return (
    <div className="upd-banner" data-testid="upd-banner" role="status">
      <span className="upd-banner-ico" aria-hidden="true">
        ✦
      </span>
      <span className="upd-banner-text">
        <strong>Zephyr diperbarui ke v{banner.version}</strong>
        {banner.notes && <span className="upd-banner-notes">{banner.notes}</span>}
      </span>
      <button
        className="btn btn-sm"
        data-testid="upd-banner-notes"
        onClick={() => {
          useSettingsUi.getState().setSection('about');
          setSettingsOpen(true);
        }}
      >
        Apa yang baru
      </button>
      <button
        className="btn btn-sm"
        data-testid="upd-banner-close"
        aria-label="Tutup pemberitahuan"
        onClick={() => setUpdateBanner(null)}
      >
        ✕
      </button>
    </div>
  );
}
