import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import GhMenu from './GhMenu';
import { useT, useTf } from '../../lib/i18n';
import type { ActivityId } from '../../lib/types';
import { bukaPanel } from '../../lib/bukaPanel';

const Icons: Record<ActivityId, () => JSX.Element> = {
  explorer: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M1.5 3.5A1.5 1.5 0 013 2h3l1.2 1.5H13A1.5 1.5 0 0114.5 5v7A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V3.5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2l3.6 3.6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  ),
  outline: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M3 4h7M5.4 8h7M7.8 12h5.4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="2" cy="4" r="0.9" fill="currentColor" />
      <circle cx="4.4" cy="8" r="0.9" fill="currentColor" />
      <circle cx="6.8" cy="12" r="0.9" fill="currentColor" />
    </svg>
  ),
  scm: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="12.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.3v5.4M5.8 11.4C9 11 10.2 9.8 10.4 8.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  ),
  /*
   * `wiki` glyph kept for the union, but no longer in ORDER so the rail has one
   * entry fewer. The drawing stays so a stale profile that still names it does
   * not render an empty button.
   */
  wiki: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="8" cy="3.4" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3.4" cy="12.2" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.6" cy="12.2" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 5.1L4.4 10.5M9 5.1l2.6 5.4M5.3 12.2h5.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  ),
  ai: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      {/*
       * A robot head, not a sparkle.
       *
       * The four-point star is the generic "AI" glyph and says nothing about
       * this product; the robot is already the face of the subagent panel, so
       * the two now read as one feature instead of two.
       */}
      <path d="M8 3.6V2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="8" cy="1.6" r="0.8" fill="currentColor" />
      <rect x="2.6" y="3.8" width="10.8" height="8.4" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="7.6" r="1.1" fill="currentColor" />
      <circle cx="10" cy="7.6" r="1.1" fill="currentColor" />
      <path d="M6.4 10.2h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  ),
  debug: () => (

    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="8" cy="8.4" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {/* the bug's legs */}
      <path
        d="M3.6 8.4H1.7M12.4 8.4h1.9M4.6 5.4L3.2 4M11.4 5.4L12.8 4M4.6 11.4L3.2 12.8M11.4 11.4l1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* the play triangle in the middle */}
      <path d="M6.9 6.6l3 1.8-3 1.8z" fill="currentColor" />
    </svg>
  ),
  terminal: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.2 6l2 2-2 2M8.4 10h3.4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  ),
  extensions: () => (

    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.8" y="1.8" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.8" y="9" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {/* the fourth box is "detached": shifted over + dashed outline */}
      <rect
        x="9.6"
        y="1.2"
        width="5.2"
        height="5.2"
        rx="0.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeDasharray="2 1.4"
      />
    </svg>
  ),
  settings: () => (

    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path
        d="M6.72 1.12L9.28 1.12L8.94 2.94L10.92 3.76L11.96 2.23L13.77 4.04L12.24 5.08L13.06 7.06L14.88 6.72L14.88 9.28L13.06 8.94L12.24 10.92L13.77 11.96L11.96 13.77L10.92 12.24L8.94 13.06L9.28 14.88L6.72 14.88L7.06 13.06L5.08 12.24L4.04 13.77L2.23 11.96L3.76 10.92L2.94 8.94L1.12 9.28L1.12 6.72L2.94 7.06L3.76 5.08L2.23 4.04L4.04 2.23L5.08 3.76L7.06 2.94Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  // One entry for the four workspace tools. They used to be four separate
  // icons; the mark is a toolbox so the rail reads as "the local machine's
  // tooling" rather than as any one of the four views inside.
  tools: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path
        d="M1.8 5.4a1.2 1.2 0 0 1 1.2-1.2h10a1.2 1.2 0 0 1 1.2 1.2v7.4a1.2 1.2 0 0 1-1.2 1.2h-10a1.2 1.2 0 0 1-1.2-1.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M1.8 7.6h12.4" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M5.6 4.2V3a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.4 9.4h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  /*
   * The four single views no longer have a rail button, but they still exist as
   * activities: the command palette jumps straight to one of them (e.g. "Run
   * tests" opens Tests, not the Tools tab strip). These entries keep that path
   * type-safe, and the palette renders them.
   */
  devenv: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.8" y="1.8" width="12.4" height="3.6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.8" y="6.2" width="12.4" height="3.6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.8" y="10.6" width="12.4" height="3.6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.1" cy="3.6" r="0.85" fill="currentColor" />
      <circle cx="4.1" cy="8" r="0.85" fill="currentColor" />
      <circle cx="4.1" cy="12.4" r="0.85" fill="currentColor" />
    </svg>
  ),
  api: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M1.8 7.4 14.4 1.9 9.4 14.2 7.1 9.1 1.8 7.4Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.1 9.1 14.4 1.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  sftp: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M3 5.6h8.4M9.2 3.2l2.4 2.4-2.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 10.4H4.6M6.8 8l-2.4 2.4L6.8 12.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  tests: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M6.2 2.4h3.6v2.4H6.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.2 3.6H4.4v10h7.2v-10H9.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 9.2l1.4 1.4 2.8-2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const LABEL: Record<ActivityId, string> = {
  explorer: 'Explorer',
  search: 'Search',
  outline: 'Outline',
  scm: 'Source Control',
  wiki: 'Atlas',
  debug: 'Run & Debug (Ctrl+Shift+D)',
  /*
   * No `ai` entry. The robot icon used to sit in the rail and toggle the chat
   * in whatever home it had been given, but the rail is for the EDITOR's views
   * (files, search, source control, terminal...), and the chat is not one of
   * them: it now lives in the Agents window (Ctrl+Shift+A) or the right-hand
   * column, both reachable from Customize Layout. The label is kept in the type
   * because `ActivityId` still accepts the value for saved profiles.
   */
  ai: 'AI Chat',
  terminal: 'Terminal',
  extensions: 'Extensions (Ctrl+Shift+X)',
  devenv: 'Dev Environment',
  api: 'API Client',
  sftp: 'SFTP',
  tests: 'Tests',
  tools: 'Tools — Dev Environment, API Client, SFTP, Tests',
  settings: 'Settings',
};

/*
 * Order matches VS Code's rail: the file-centric views first, then Extensions,
 * then the machine-side Tools.
 *
 * NO `outline` ENTRY. Outline is a section at the BOTTOM of the Explorer now
 * (see SectionLipat), which is where VS Code and Qoder both put it: it describes
 * the file that is open, so it belongs beside the tree that opens it, not as a
 * fourth kind of view in the rail. The `ActivityId` still accepts the value for
 * saved profiles, and the palette still reaches it.
 *
 * Settings is NOT here either: it sits at the very bottom, under the GitHub
 * avatar, which is where VS Code puts it and where a reader looks for it last.
 */
const ORDER: ActivityId[] = [
  'explorer',
  'search',
  'scm',
  'debug',
  'extensions',
  'terminal',
  'tools',
];

export default function ActivityBar() {
  const tr = useT();
  const tf = useTf();
  const activity = useStore((s) => s.activity);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const setActivity = useStore((s) => s.setActivity);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const gh = useGit((s) => s.gh);
  const loadGh = useGit((s) => s.loadGh);
  const loginDevice = useGit((s) => s.loginDevice);
  const logoutAkun = useGit((s) => s.logoutGh);

  useEffect(() => {
    void loadGh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = !!gh?.signedIn;
  const user = gh?.user ?? null;
  const oauthSiap = !!gh?.oauthConfigured;
  const avatarUrl = gh?.avatarUrl ?? null;

  const [avatarGagal, setAvatarGagal] = useState(false);
  useEffect(() => {
    setAvatarGagal(false);
  }, [avatarUrl]);

  const [menuGhTerbuka, setMenuGhTerbuka] = useState(false);
  const [anchorGh, setAnchorGh] = useState<HTMLElement | null>(null);

  const klikGh = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorGh(e.currentTarget);
    setMenuGhTerbuka((v) => !v);
    setSettingsOpen(false);
  };

  const loginGh = () => {
    if (oauthSiap) {
      void loginDevice();
    } else {
      void openUrl('https://github.com/settings/developers');
    }
    setActivity('scm');
    if (!sidebarVisible) toggleSidebar();
  };

  const logoutGh = () => {
    void logoutAkun();
  };

  return (
    <>
      {menuGhTerbuka && (
        <GhMenu
          anchor={anchorGh}
          gh={gh}
          onClose={() => setMenuGhTerbuka(false)}
          onLogin={loginGh}
          onLogout={logoutGh}
          onBukaToken={() => void openUrl('https://github.com/settings/tokens')}
        />
      )}
      <nav className="activitybar" aria-label="Activity Bar">
      {ORDER.map((id) => {
        const Icon = Icons[id];
        /* Extensions and Tools are windows now, so there is no popup flag to
           read: the rail's only active state is the side-bar view it opens. */
        const isActive = activity === id && sidebarVisible;
        return (
          <button
            key={id}
            className={`ab-btn${isActive ? ' is-active' : ''}`}
            title={tr(LABEL[id])}
            aria-label={tr(LABEL[id])}
            aria-pressed={isActive}
            data-activity={id}
            data-testid={`ab-${id}`}
            onClick={() => {
              setSettingsOpen(false);

              /*
               * Extensions and Tools open as WINDOWS, not popups.
               *
               * They used to float over the editor, and when maximized their
               * own chrome fought their layout: the left rail was painted over
               * the content. A settings or marketplace page is a surface the
               * reader keeps beside their code, so it gets a real window with
               * the platform's own maximize/minimize.
               */
              if (id === 'extensions') {
                bukaPanel('extensions');
                return;
              }
              if (id === 'tools') {
                bukaPanel('tools');
                return;
              }

              if (activity === id) toggleSidebar();
              else {
                setActivity(id);
                if (!sidebarVisible) toggleSidebar();
              }
            }}
          >
            <Icon />
            {isActive && <span className="ab-indicator" aria-hidden="true" />}
          </button>
        );
      })}

      {/* The GitHub account goes BELOW the activity bar (bottom-left corner,
          like VS Code). Not logged in: the "…" avatar button opens Source
          Control (log in there). Logged in: a round avatar with the user's
          initials; the click still goes to SCM. */}
      <span className="ab-spacer" aria-hidden="true" />
      <button
        className={`ab-btn ab-gh${signedIn ? ' is-in' : ''}`}
        data-testid="ab-gh"
        title={
          signedIn
            ? tf('@{user} - GitHub account (click: Source Control)', { user: user ?? '' })
            : oauthSiap
              ? tr('Sign in to GitHub (opens browser)')
              : tr('Sign in to GitHub - open Source Control')
        }
        aria-label={signedIn ? tf('GitHub account: @{user}', { user: user ?? '' }) : tr('Sign in to GitHub')}
        onClick={klikGh}
      >
        {signedIn ? (
          <span className="ab-gh-avatar" aria-hidden="true">
            {avatarUrl && !avatarGagal ? (
              <img
                className="ab-gh-img"
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
          <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
            {/* the official github mark (Octocat, GitHub Primer) */}
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>

      {/*
        * Settings sits UNDER the avatar, at the very bottom of the rail.
        *
        * VS Code's rail ends with the account button and the gear; the gear
        * is the last thing, because it is the least frequently pressed and
        * the most disruptive when pressed by accident. It used to sit among
        * the views, between Tools and the avatar, where it read as a fifth
        * view of the editor rather than as the settings of the app.
        *
        * NO ACTIVE STATE, deliberately. It used to light up while the Settings
        * popup was open, which made sense when the panel lived inside this
        * window. Settings is now its own window: the rail cannot see whether
        * that window exists, and a button that claims to be "active" while the
        * window is closed (or dark while it is open on another monitor) is worse
        * than a button that simply opens it.
        */}
      <button
        className="ab-btn ab-gear"
        data-testid="ab-settings"
        data-activity="settings"
        title={tr(LABEL.settings)}
        aria-label={tr(LABEL.settings)}
        onClick={() => bukaPanel('settings')}
      >
        <Icons.settings />
      </button>
      </nav>
    </>
  );
}
