import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';

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
          <span className="upd-dialog-ico" aria-hidden="true"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><path d="M3 5.5h8.5v3.2a4.2 4.2 0 0 1-4.2 4.2h-.1A4.2 4.2 0 0 1 3 8.7z"/><path d="M11.5 6.6h1.2a1.9 1.9 0 0 1 0 3.8h-1.2"/><path d="M5.6 2.2c0 .9-.8 1.1-.8 2M8.2 2.2c0 .9-.8 1.1-.8 2"/></svg></span>
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
            className="btn btn-primary donate-opt"
            data-testid="donate-trakteer"
            onClick={() => {
              setOpen(false);
              void buka(TRAKTEER);
            }}
          >
            <strong>Trakteer</strong>
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
            <strong>Saweria</strong>
            <span className="donate-url">saweria.co/ShinRyuga04</span>
          </button>
        </div>
      </div>
    </div>
  );
}
