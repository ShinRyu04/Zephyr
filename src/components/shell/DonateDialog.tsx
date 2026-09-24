import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { TrakteerLogo, SaweriaLogo } from '../settings/BrandLogos';

const TRAKTEER = 'https://trakteer.id/ryuga-9jfin';
const SAWERIA = 'https://saweria.co/ShinRyuga04';

async function buka(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    /* diam — link hanya pelengkap */
  }
}

export default function DonateDialog() {
  const tr = useT();
  const open = useStore((s) => s.donateOpen);
  const setOpen = useStore((s) => s.setDonateOpen);

  if (!open) return null;

  return (
    <div
      className="upd-backdrop"
      role="presentation"
      data-testid="donate-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="upd-dialog donate-dialog" role="dialog" aria-modal="true" aria-labelledby="donate-title">
        <div className="upd-dialog-head">
          <span className="upd-dialog-ico donate-ico" aria-hidden="true">
            <TrakteerLogo size={14} />
          </span>
          <div>
            <h2 className="upd-dialog-title" id="donate-title" data-testid="donate-title">
              {tr('donate.title')}
            </h2>
            <p className="upd-sub">{tr('donate.hint')}</p>
          </div>
          <button
            className="btn btn-sm upd-dialog-x"
            aria-label={tr('common.close')}
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="donate-body" data-testid="donate-options">
          <button
            className="btn donate-opt"
            data-testid="donate-trakteer"
            onClick={() => {
              setOpen(false);
              void buka(TRAKTEER);
            }}
          >
            <span className="donate-brand">
              <TrakteerLogo size={15} />
              <strong>Trakteer</strong>
            </span>
            <span className="donate-url">trakteer.id/ryuga-9jfin</span>
          </button>
          <button
            className="btn donate-opt"
            data-testid="donate-saweria"
            onClick={() => {
              setOpen(false);
              void buka(SAWERIA);
            }}
          >
            <span className="donate-brand">
              <SaweriaLogo size={15} />
              <strong>Saweria</strong>
            </span>
            <span className="donate-url">saweria.co/ShinRyuga04</span>
          </button>
        </div>
      </div>
    </div>
  );
}
