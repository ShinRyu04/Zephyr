import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { useT } from '../../lib/i18n';
import WindowControls from '../shell/WindowControls';
import ZephyrLogo from '../shell/ZephyrLogo';

/** Last path segment, for the folder name shown in the middle of the bar. */
function namaFolder(p: string | null | undefined): string {
  if (!p) return '';
  const bersih = p.replace(/[\\/]+$/, '');
  const bagian = bersih.split(/[\\/]/);
  return bagian[bagian.length - 1] || bersih;
}

/**
 * The Agents window's title bar.
 *
 * Shaped after the MAIN window's bar rather than invented fresh: logo at the
 * far left, the workspace's name in the middle, and the account and window
 * controls at the right. A window that sits beside the editor for hours reads
 * its own bar by habit, and a bar that puts the same things in different places
 * from one window to the next costs a beat every time it is glanced at.
 *
 * The main bar's File/Edit menus, command-centre box and layout toggles are
 * absent on purpose: this window has no editor to command, and the column
 * toggles it DOES need are two buttons, not a menu of eleven.
 *
 * `data-tauri-drag-region` on the root is what makes the empty space draggable,
 * since the native title bar is off (`decorations: false`).
 */
export default function AgentsTitlebar({
  kiriBuka,
  kananBuka,
  onToggleKiri,
  onToggleKanan,
}: {
  kiriBuka: boolean;
  kananBuka: boolean;
  onToggleKiri: () => void;
  onToggleKanan: () => void;
}) {
  const tr = useT();
  const workspace = useStore((s) => s.workspace);

  /* GitHub account, the same state the ActivityBar avatar reads. */
  const gh = useGit((s) => s.gh);
  const signedIn = !!gh?.signedIn && !!gh?.user;
  const [avatarGagal, setAvatarGagal] = useState(false);
  const avatarUrl = gh?.avatarUrl ?? '';
  const user = gh?.user;

  return (
    <div className="ag-titlebar" data-testid="agents-titlebar" data-tauri-drag-region>
      <div className="ag-tb-left">
        <span className="ag-tb-brand" aria-hidden="true">
          <ZephyrLogo size={11} glyphOnly muted />
        </span>
        <span className="ag-tb-folder" title={workspace ?? ''}>
          {namaFolder(workspace)}
        </span>
      </div>

      <div className="ag-tb-right">
        <button
          className={`ag-tb-btn${kiriBuka ? ' is-on' : ''}`}
          data-testid="ag-toggle-left"
          aria-label={tr('Toggle sessions column')}
          aria-pressed={kiriBuka}
          onClick={onToggleKiri}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        <button
          className={`ag-tb-btn${kananBuka ? ' is-on' : ''}`}
          data-testid="ag-toggle-right"
          aria-label={tr('Toggle changes and files column')}
          aria-pressed={kananBuka}
          onClick={onToggleKanan}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.6 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        {/*
          * The account, matching the main window's corner avatar: signed in it
          * is the user's picture, signed out it is the GitHub mark. Both are a
          * button that opens Source Control, because that is where the account
          * is managed and there is no account screen of its own.
          */}
        <button
          className="ag-tb-gh"
          data-testid="ag-tb-gh"
          title={signedIn ? `@${user ?? ''}` : tr('Sign in to GitHub')}
          aria-label={signedIn ? `@${user ?? ''}` : tr('Sign in to GitHub')}
          onClick={() => {
            /* The window has no activity bar to switch, so the account action
               is a no-op beyond the label here: the reader manages the session
               from the main window. */
          }}
        >
          {signedIn ? (
            <span className="ag-tb-gh-avatar" aria-hidden="true">
              {avatarUrl && !avatarGagal ? (
                <img
                  src={avatarUrl}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarGagal(true)}
                />
              ) : (
                (user ?? '?').slice(0, 1).toUpperCase()
              )}
            </span>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {/* the official github mark (Octocat, GitHub Primer) */}
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>

        <WindowControls />
      </div>
    </div>
  );
}
