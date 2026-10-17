import { lazy, Suspense } from 'react';
import ModalPopup from './ModalPopup';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';

/*
 * The three floating panels, in one place.
 *
 * Each was a full-area view: Settings took over the editor area, Extensions
 * filled the side bar, Dev Tools filled the editor area. They are now the same
 * kind of surface - a centred card over the work - so they share one frame
 * (`ModalPopup`) and one mount point. Keeping them together is what makes it
 * impossible for one of them to drift back into "full screen" on its own.
 */

const SettingsPage = lazy(() => import('../settings/SettingsPage'));
const SettingsNav = lazy(() => import('../settings/SettingsNav'));
const ExtensionsView = lazy(() => import('../extensions/ExtensionsView'));
const ToolsView = lazy(() => import('./ToolsView'));

/** Settings: nav column + section, both inside the card. */
export function SettingsPopup() {
  const tr = useT();
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);

  return (
    <ModalPopup
      open={open}
      onClose={() => setOpen(false)}
      title={tr('Settings')}
      testid="settings-pop"
      width="min(1120px, 94vw)"
      height="min(800px, 88vh)"
    >
      <div className="mpop-settings-nav">
        <Suspense fallback={null}>
          <SettingsNav />
        </Suspense>
      </div>
      <div className="mpop-settings-body">
        <Suspense fallback={null}>
          <SettingsPage />
        </Suspense>
      </div>
    </ModalPopup>
  );
}

/** Extensions: the marketplace, plus "Open in Editor" for the full-width view. */
export function ExtensionsPopup() {
  const tr = useT();
  const open = useStore((s) => s.extensionsOpen);
  const setOpen = useStore((s) => s.setExtensionsOpen);
  const bukaTab = useStore((s) => s.bukaViewAi);

  return (
    <ModalPopup
      open={open}
      onClose={() => setOpen(false)}
      title={tr('Extensions')}
      testid="extensions-pop"
      width="min(1100px, 94vw)"
      height="min(780px, 88vh)"
      onOpenEditor={() => {
        /* The overlay and the tab are mutually exclusive by construction:
           closing the overlay first means the same page is never on screen
           twice, which is what made the old "maximize" feel like a trap. */
        setOpen(false);
        bukaTab('extensions');
      }}
    >
      <Suspense fallback={null}>
        <ExtensionsView />
      </Suspense>
    </ModalPopup>
  );
}

/** Dev Tools: Dev Environment / API Client / SFTP / Tests behind one entry. */
export function ToolsPopup() {
  const tr = useT();
  const open = useStore((s) => s.toolsOpen);
  const setOpen = useStore((s) => s.setToolsOpen);

  return (
    <ModalPopup
      open={open}
      onClose={() => setOpen(false)}
      title={tr('Tools')}
      testid="tools-pop"
      width="min(1200px, 95vw)"
      height="min(820px, 90vh)"
    >
      <Suspense fallback={null}>
        <ToolsView />
      </Suspense>
    </ModalPopup>
  );
}
