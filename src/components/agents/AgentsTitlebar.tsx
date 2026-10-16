import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { usePalette } from '../../lib/paletteStore';
import { useT } from '../../lib/i18n';
import { fokusEditorWindow } from '../../lib/agentsWindow';
import Tip from '../shell/Tip';
import WindowControls from '../shell/WindowControls';

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
      {/*
        * Left: the panel toggle, then the folder name — VS Code's order.
        *
        * The toggle opens/closes the sessions column and sits FIRST, before the
        * name, because that is where the eye goes for "get the sidebar back":
        * in VS Code the icon is the leftmost thing in the bar and the folder
        * name follows it. The Zephyr wordmark that used to sit here is gone —
        * a second logo, in a window whose sibling already shows one, is noise.
        */}
      <div className="ag-tb-left">
        <button
          className={`ag-tb-btn${kiriBuka ? ' is-on' : ''}`}
          data-testid="ag-toggle-left"
          title={tr('Toggle sessions column')}
          aria-label={tr('Toggle sessions column')}
          aria-pressed={kiriBuka}
          onClick={onToggleKiri}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {/* The panel-box glyph, matching the right column's toggle: a
                rectangle with the divider on the side the column sits. Left and
                right read as a pair, the way VS Code's two side-bar toggles do,
                which the decreasing-lines glyph did not. */}
            <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        <span className="ag-tb-folder" title={workspace ?? ''}>
          {namaFolder(workspace)}
        </span>
      </div>

      {/*
        * Centre: back/forward, then the command palette box.
        *
        * The chevrons belong to the palette rather than to the sidebar toggle:
        * they move through what has been OPENED, which is the same "go find a
        * thing" errand the search box serves, and they read as one group with it.
        * Sitting them at the far left split that pair across the bar.
        */}
      <div className="ag-tb-center">
        <button
          className="ag-tb-btn"
          data-testid="ag-nav-back"
          title={tr('Go Back')}
          aria-label={tr('Go Back')}
          onClick={() => void import('../../lib/commandRegistry').then((m) => m.runCommand('nav.back'))}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="ag-tb-btn"
          data-testid="ag-nav-forward"
          title={tr('Go Forward')}
          aria-label={tr('Go Forward')}
          onClick={() => void import('../../lib/commandRegistry').then((m) => m.runCommand('nav.forward'))}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5L10.5 8L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className="ag-cc"
          data-testid="ag-command-center"
          title={tr('Command Palette - search commands & files (Ctrl+Shift+P / Ctrl+P)')}
          aria-haspopup="dialog"
          onClick={() => void usePalette.getState().openPalette('command')}
        >
          <svg className="ag-cc-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10.5 5.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.8 3.9 4 4.1-1 1-4-4.1a5 5 0 0 1-6.7-6.7L1 7 1.9 5.6A5 5 0 0 1 8 1a5 5 0 0 1 5.5 4.3l.4 2.6-1.9.5-2.3.5z"
              fill="currentColor"
            />
          </svg>
          <span className="ag-cc-label">{tr('Search files & commands…')}</span>
        </button>

        {/*
          * "Open in Editor" — the main window's "Open in Agents" pill, copied
          * whole: same markup, same classes, same hover animation. It sits at
          * the END of the centred group, right after the search box, so nothing
          * follows it and the label can open rightward without pushing anything
          * along — see the `.ag-open-editor` note in agents-window.css.
          *
          * The old comment here said the label was a FIXED-width part of the
          * button rather than something that animates. That was never true of
          * the main window's pill and is not true of this one: it starts clipped
          * at `max-width: 0` and grows on hover, and the Z glyph moves with it.
          * Corrected so the comment stops describing a widget that is not there.
          */}
        <Tip label={tr('Open in Editor Window')} kbd="Ctrl+Shift+A">
          <button
            className="mb-aipill ag-open-editor"
            data-testid="ag-open-editor"
            aria-label={tr('Open in Editor')}
            onClick={() => {
              void fokusEditorWindow().catch((error: unknown) => {
                console.error('gagal membuka jendela editor dari Agents', error);
              });
            }}
          >
            {/* The Zephyr "Z" on its own — the same glyph as the main window's
                "Open in Agents" pill, so the two title bars carry one mark
                rather than a different logo in each. */}
            <svg className="mb-aipill-ic" viewBox="268 300 488 424" aria-hidden="true">
              <path
                d="M268 300 L756 300 L756 396 L464 628 L756 628 L756 724 L268 724 L268 628 L560 396 L268 396 Z"
                fill="currentColor"
              />
            </svg>
            <span className="mb-aipill-body">
              <span className="mb-aipill-label">{tr('Open in Editor')}</span>
            </span>
          </button>
        </Tip>
      </div>

      <div className="ag-tb-right">
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
