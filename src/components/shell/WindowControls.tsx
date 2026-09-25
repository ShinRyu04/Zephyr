import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useT } from '../../lib/i18n';

export default function WindowControls() {
  const tr = useT();
  const [maks, setMaks] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      const w = getCurrentWindow();
      void w.isMaximized().then(setMaks).catch(() => {});
      void w
        .onResized(() => {
          void w.isMaximized().then(setMaks).catch(() => {});
        })
        .then((un) => {
          unlisten = un;
        })
        .catch(() => {});
    } catch {
      /* non-Tauri */
    }
    return () => unlisten?.();
  }, []);

  const aksi = (fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) => {
    try {
      void fn(getCurrentWindow()).catch(() => {});
    } catch {
      /* non-Tauri */
    }
  };

  return (
    <div className="wc" data-testid="window-controls">
      <button
        className="wc-btn"
        data-testid="wc-min"
        title={tr('win.minimize')}
        aria-label={tr('win.minimize')}
        onClick={() => aksi((w) => w.minimize())}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="wc-btn"
        data-testid="wc-max"
        title={maks ? tr('win.restore') : tr('win.maximize')}
        aria-label={maks ? tr('win.restore') : tr('win.maximize')}
        onClick={() => aksi((w) => w.toggleMaximize())}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maks ? (
            <>
              <rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M3 2.5V1h6v6H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          )}
        </svg>
      </button>
      <button
        className="wc-btn is-close"
        data-testid="wc-close"
        title={tr('win.close')}
        aria-label={tr('win.close')}
        onClick={() => aksi((w) => w.close())}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
