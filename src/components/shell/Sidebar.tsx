import { lazy, Suspense } from 'react';
import { useStore } from '../../lib/store';
const DebugView = lazy(() => import('../debug/DebugView'));
const ExplorerPanel = lazy(() => import('../explorer/ExplorerPanel'));
const OutlinePanel = lazy(() => import('../explorer/OutlinePanel'));
const SearchPanel = lazy(() => import('../explorer/SearchPanel'));
const SourceControlPanel = lazy(() => import('../scm/SourceControlPanel'));
const TerminalPanel = lazy(() => import('./TerminalPanel'));

export default function Sidebar() {
  const activity = useStore((s) => s.activity);

  /*
   * Dev Environment, API Client and SFTP use the full width: their content already
   * has its own layout (cards, double columns) and has no list
   * suitable for a sidebar. Previously all three fell through to `default`, which
   * returned null, so the left side looked empty across the whole sidebar width.
   */
  if (
    activity === 'tools' ||
    activity === 'devenv' ||
    activity === 'api' ||
    activity === 'sftp' ||
    activity === 'tests'
  ) {
    return null;
  }

  const isi = (() => {
    switch (activity) {
      case 'explorer':
        return <ExplorerPanel />;
      case 'search':
        return <SearchPanel />;
      case 'outline':
        return <OutlinePanel />;
      case 'scm':
        return <SourceControlPanel />;
      case 'debug':
        return <DebugView />;
      /* The left "AI Assistant" panel was REMOVED on request. The robot icon in
         the rail now only toggles the chat in its own home (right column /
         editor tab / pop-out window); chat history lives in the panel's
         own header switcher. So 'ai' no longer renders anything on the left. */
      case 'terminal':
        return <TerminalPanel />;
      /* Extensions is a floating panel now (ShellPopups), not a side-bar
         view: it needs the width, and taking the side bar left the editor
         squeezed beside a marketplace. */
      case 'extensions':
        return null;
      /*
       * Settings no longer draws its nav here.
       *
       * The nav lives INSIDE the Settings popup now (ShellPopups). Rendering it
       * in the side bar as well is what made pressing the gear show the same
       * column twice - once docked on the left, once inside the card - and the
       * docked copy was the one that stayed visible after the popup closed.
       */
      case 'settings':
        return null;
      default:
        return null;
    }
  })();

  return <Suspense fallback={null}>{isi}</Suspense>;
}
