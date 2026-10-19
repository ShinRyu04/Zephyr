import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useGit } from '../../lib/gitStore';
import { usePalette } from '../../lib/paletteStore';
import { useT } from '../../lib/i18n';
import { fokusEditorWindow } from '../../lib/agentsWindow';
import WindowControls from '../shell/WindowControls';
import { NotifBell } from '../notifications/NotificationCenter';

/** Last path segment, for the folder name shown beside the mark. */
function namaFolder(p: string | null | undefined): string {
  if (!p) return '';
  const bersih = p.replace(/[\\/]+$/, '');
  const bagian = bersih.split(/[\\/]/);
  return bagian[bagian.length - 1] || bersih;
}

/**
 * The Agents window's MENUBAR — 56px, three groups, nothing centred.
 *
 * ## Measured shape
 *
 *   height            56px
 *   left group        at x=6,  32px tall: back/forward, then the mark + folder
 *   middle group      starts right after it: File / Edit / View / Help, plus a
 *                     "more" chevron — the menu row of a desktop app
 *   right group       the account, then the window buttons, flush to the edge
 *
 * ## Why a menubar and not a toolbar
 *
 * The previous bar was a toolbar: a search box in the middle with a
 * "Open in Editor" pill beside it. The reference is a MENUBAR — it reads
 * "File Edit View Help" and nothing else, because the window is an app of its
 * own rather than a mode of the editor. The search box moved into the chat
 * panel's header, where the reference puts it, and the pill is gone entirely:
 * a window whose whole purpose is to BE the agent surface does not need a
 * button in its title bar saying "go back to the editor".
 *
 * The menu LABELS are real menus, not decoration: each one opens a small list of
 * commands that exist in this window. A label that opens nothing would be the
 * kind of fake control this project has been burned by before.
 *
 * `data-tauri-drag-region` on the root keeps the bar draggable, since the native
 * title bar is off (`decorations: false`).
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

  /*
   * Which menu is open. `null` closes everything; opening one closes the other,
   * because two open menus at once is a state no desktop app has.
   */
  const [menu, setMenu] = useState<'file' | 'view' | 'help' | null>(null);

  const jalankan = (id: string) => {
    setMenu(null);
    void import('../../lib/commandRegistry').then((m) => m.runCommand(id));
  };

  /*
   * The menus, as data.
   *
   * Only commands that EXIST in this window are listed. `File > New Task` maps to
   * the same action as the left column's "New task" row, so the two cannot drift;
   * `View` carries the three column toggles the window actually has.
   */
  const MENUS: Record<'file' | 'view' | 'help', Array<{ label: string; kbd?: string; aksi: () => void } | { garis: true }>> = {
    file: [
      { label: tr('New Task'), kbd: 'Ctrl+N', aksi: () => void import('../../lib/aiStore').then((m) => m.useAi.getState().newChat('agents')) },
      { garis: true },
      { label: tr('Search Files & Commands…'), kbd: 'Ctrl+Shift+P', aksi: () => void usePalette.getState().openPalette('command') },
      { label: tr('Open Folder…'), aksi: () => jalankan('file.openFolder') },
      { garis: true },
      { label: tr('Open in Editor Window'), kbd: 'Ctrl+Shift+A', aksi: () => void fokusEditorWindow().catch(() => undefined) },
    ],
    view: [
      { label: tr(kiriBuka ? 'Hide Sessions Column' : 'Show Sessions Column'), aksi: onToggleKiri },
      { label: tr(kananBuka ? 'Hide Details Panel' : 'Show Details Panel'), aksi: onToggleKanan },
      { garis: true },
      { label: tr('Command Palette…'), kbd: 'Ctrl+Shift+P', aksi: () => jalankan('view.palette') },
      { label: tr('Settings'), kbd: 'Ctrl+,', aksi: () => jalankan('view.settings') },
      { label: tr('Customize Layout'), aksi: () => jalankan('view.customizeLayout') },
    ],
    help: [
      { label: tr('Documentation'), aksi: () => jalankan('help.docs') },
      { label: tr('Keyboard Shortcuts'), kbd: 'Ctrl+K Ctrl+S', aksi: () => jalankan('help.shortcuts') },
      { garis: true },
      { label: tr('Check for Updates'), aksi: () => jalankan('help.checkUpdates') },
      { label: tr('About Zephyr'), aksi: () => jalankan('help.about') },
    ],
  };

  return (
    <div className="ag-menubar" data-testid="agents-titlebar" data-tauri-drag-region>
      {/* ── Left: navigation, then the mark and the folder ─────────────────── */}
      <div className="ag-mb-aksi" data-tauri-drag-region>
        <button
          className="ag-mb-ikon"
          data-testid="ag-nav-back"
          title={tr('Go Back')}
          aria-label={tr('Go Back')}
          onClick={() => jalankan('nav.back')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="ag-mb-ikon"
          data-testid="ag-nav-forward"
          title={tr('Go Forward')}
          aria-label={tr('Go Forward')}
          onClick={() => jalankan('nav.forward')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5L10.5 8L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className={`ag-mb-ikon${kiriBuka ? ' is-on' : ''}`}
          data-testid="ag-toggle-left"
          title={tr('Toggle sessions column')}
          aria-label={tr('Toggle sessions column')}
          aria-pressed={kiriBuka}
          onClick={onToggleKiri}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>

        <span className="ag-mb-merek" aria-hidden="true">
          <svg viewBox="268 300 488 424">
            <path d="M268 300 L756 300 L756 396 L464 628 L756 628 L756 724 L268 724 L268 628 L560 396 L268 396 Z" fill="currentColor" />
          </svg>
        </span>
        <span className="ag-mb-folder" title={workspace ?? ''}>
          {namaFolder(workspace) || tr('No folder')}
        </span>
      </div>

      {/* ── Middle: the menu row ───────────────────────────────────────────── */}
      <div className="ag-mb-menu" data-tauri-drag-region>
        {(['file', 'view', 'help'] as const).map((k) => (
          <div key={k} className="ag-mb-menuwrap">
            <button
              className={`ag-mb-menulabel${menu === k ? ' is-buka' : ''}`}
              data-testid={`ag-menu-${k}`}
              aria-haspopup="menu"
              aria-expanded={menu === k}
              onClick={() => setMenu((v) => (v === k ? null : k))}
            >
              {tr(k === 'file' ? 'File' : k === 'view' ? 'View' : 'Help')}
            </button>
            {menu === k && (
              <div className="ag-mb-dropdown" role="menu" data-testid={`ag-dropdown-${k}`}>
                {MENUS[k].map((item, i) =>
                  'garis' in item ? (
                    <div key={i} className="ag-mb-garis" role="separator" />
                  ) : (
                    <button
                      key={i}
                      role="menuitem"
                      className="ag-mb-item"
                      onClick={() => {
                        setMenu(null);
                        item.aksi();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.kbd && <span className="ag-mb-kbd">{item.kbd}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

        {/* The "more" chevron: the reference has one after the last menu. It
            opens the same palette the File menu's search entry does, so it is a
            shortcut rather than a second, empty menu. */}
        <button
          className="ag-mb-ikon ag-mb-more"
          data-testid="ag-menu-more"
          title={tr('More')}
          aria-label={tr('More')}
          onClick={() => void usePalette.getState().openPalette('command')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6.2L8 10.2l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Right: account, column toggle, window buttons ──────────────────── */}
      <div className="ag-mb-kanan" data-tauri-drag-region>
        <NotifBell />

        <button
          className={`ag-mb-ikon${kananBuka ? ' is-on' : ''}`}
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

        <button
          className="ag-mb-gh"
          data-testid="ag-tb-gh"
          title={signedIn ? `@${user ?? ''}` : tr('Sign in to GitHub')}
          aria-label={signedIn ? `@${user ?? ''}` : tr('Sign in to GitHub')}
          onClick={() => undefined}
        >
          {signedIn ? (
            <span className="ag-mb-gh-avatar" aria-hidden="true">
              {avatarUrl && !avatarGagal ? (
                <img src={avatarUrl} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setAvatarGagal(true)} />
              ) : (
                (user ?? '?').slice(0, 1).toUpperCase()
              )}
            </span>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
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
