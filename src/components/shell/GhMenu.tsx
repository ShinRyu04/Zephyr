import Popover from './Popover';
import { tx } from '../../lib/i18n';
import type { GhStatus } from '../../lib/types';

interface Props {
  anchor: HTMLElement | null;
  gh: GhStatus | null;
  onClose: () => void;
  onLogout: () => void;
  onLogin: () => void;

  onBukaToken: () => void;
}

export default function GhMenu({ anchor, gh, onClose, onLogout, onLogin, onBukaToken }: Props) {
  const user = gh?.user ?? null;
  const signedIn = !!gh?.signedIn;

  const jalankan = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Popover anchor={anchor} arah="up" sisi="left" onClose={onClose} testid="gh-menu" className="tt-dropdown">
      {/* Baris identitas - tidak diklik, hanya label */}
      <div className="gh-menu-id">
        {signedIn ? (
          <>
            <span className="gh-menu-nama">{user}</span>
            <span className="gh-menu-sub">GitHub</span>
          </>
        ) : (
          <span className="gh-menu-sub">{tx('Not signed in')}</span>
        )}
      </div>

      <div className="tt-drop-sep" aria-hidden="true" />

      {signedIn ? (
        <>
          <button className="tt-drop-item" onClick={jalankan(onLogout)} data-testid="gh-menu-logout">
            {tx('Sign out of GitHub')}
          </button>
        </>
      ) : (
        <button className="tt-drop-item" onClick={jalankan(onLogin)} data-testid="gh-menu-login">
          {tx('Sign in to GitHub')}
        </button>
      )}

      <button className="tt-drop-item" onClick={jalankan(onBukaToken)} data-testid="gh-menu-token">
        {tx('Manage GitHub token')}
      </button>
    </Popover>
  );
}
