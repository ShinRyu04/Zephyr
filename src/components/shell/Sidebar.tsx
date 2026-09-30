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
   * Dev Environment, API Client dan SFTP memakai lebar penuh: isinya sudah
   * punya tata letak sendiri (kartu, kolom ganda) dan tidak punya daftar
   * yang cocok untuk sidebar. Sebelumnya ketiganya jatuh ke `default` yang
   * mengembalikan null, jadi sisi kiri tampak kosong selebar sidebar.
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
