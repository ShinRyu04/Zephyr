import { lazy, Suspense } from 'react';
import { useStore } from '../../lib/store';
const AiSidebar = lazy(() => import('../ai/AiSidebar'));
const DebugView = lazy(() => import('../debug/DebugView'));
const ExplorerPanel = lazy(() => import('../explorer/ExplorerPanel'));
const ExtensionsView = lazy(() => import('../extensions/ExtensionsView'));
const SearchPanel = lazy(() => import('../explorer/SearchPanel'));
const SourceControlPanel = lazy(() => import('../scm/SourceControlPanel'));
const SettingsNav = lazy(() => import('../settings/SettingsNav'));
const TerminalPanel = lazy(() => import('./TerminalPanel'));

export default function Sidebar() {
  const activity = useStore((s) => s.activity);

  const isi = (() => {
    switch (activity) {
      case 'explorer':
        return <ExplorerPanel />;
      case 'search':
        return <SearchPanel />;
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
