// GhMenu.tsx — dropdown akun GitHub, muncul saat avatar di Activity Bar diklik.
// Pola sama seperti VS Code: identitas akun di atas, aksi akun di bawah.
//
// Kenapa dipisah dari ActivityBar: ActivityBar sudah panjang (ikon + state
// avatar), dan menu ini butuh Popover (portal ke <body>) supaya tidak
// terpotong rantai `overflow: hidden` Activity Bar.

import Popover from './Popover';
import { tx } from '../../lib/i18n';
import type { GhStatus } from '../../lib/types';

interface Props {
  anchor: HTMLElement | null;
  gh: GhStatus | null;
  onClose: () => void;
  onLogout: () => void;
  onLogin: () => void;
  /** buka halaman pengaturan token GitHub di browser */
  onBukaToken: () => void;
}

export default function GhMenu({ anchor, gh, onClose, onLogout, onLogin, onBukaToken }: Props) {
  const user = gh?.user ?? null;
  const signedIn = !!gh?.signedIn;

  /** Jalankan aksi lalu tutup menu — supaya menu tidak menggantung. */
  const jalankan = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Popover anchor={anchor} arah="up" sisi="left" onClose={onClose} testid="gh-menu" className="tt-dropdown">
      {/* Baris identitas — tidak diklik, hanya label */}
      <div className="gh-menu-id">
        {signedIn ? (
          <>
            <span className="gh-menu-nama">{user}</span>
            <span className="gh-menu-sub">GitHub</span>
          </>
        ) : (
          <span className="gh-menu-sub">{tx('Belum login')}</span>
        )}
      </div>

      <div className="tt-drop-sep" aria-hidden="true" />

      {signedIn ? (
        <>
          <button className="tt-drop-item" onClick={jalankan(onLogout)} data-testid="gh-menu-logout">
            {tx('Keluar dari GitHub')}
          </button>
        </>
      ) : (
        <button className="tt-drop-item" onClick={jalankan(onLogin)} data-testid="gh-menu-login">
          {tx('Login ke GitHub')}
        </button>
      )}

      <button className="tt-drop-item" onClick={jalankan(onBukaToken)} data-testid="gh-menu-token">
        {tx('Kelola token GitHub')}
      </button>
    </Popover>
  );
}
