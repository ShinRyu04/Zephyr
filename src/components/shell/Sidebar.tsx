import { lazy, Suspense } from 'react';
import { useStore } from '../../lib/store';
const AiSidebar = lazy(() => import('../ai/AiSidebar'));
const DebugView = lazy(() => import('../debug/DebugView'));
const ExplorerPanel = lazy(() => import('../explorer/ExplorerPanel'));
const ExtensionsView = lazy(() => import('../extensions/ExtensionsView'));
const OutlinePanel = lazy(() => import('../explorer/OutlinePanel'));
const SearchPanel = lazy(() => import('../explorer/SearchPanel'));
const SourceControlPanel = lazy(() => import('../scm/SourceControlPanel'));
const SettingsNav = lazy(() => import('../settings/SettingsNav'));
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
      case 'ai':
        return <AiSidebar />;
      case 'terminal':
        return <TerminalPanel />;
      case 'extensions':
        return <ExtensionsView />;
      case 'settings':
        return <SettingsNav />;
      default:
        return null;
    }
  })();

  return <Suspense fallback={null}>{isi}</Suspense>;
}
