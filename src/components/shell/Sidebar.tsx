// Sidebar.tsx — panel kiri per ikon ActivityBar.
//
// CATATAN (jangan diulang): daftar 11 section Settings hidup di SINI
// (SettingsNav), bukan di dalam halaman. Sempat ada di dua tempat dan
// hasilnya daftar dobel + Reset Semua muncul dua kali di layar.

import { useStore } from '../../lib/store';
import AiSidebar from '../ai/AiSidebar';
import ExplorerPanel from '../explorer/ExplorerPanel';
import ExtensionsView from '../extensions/ExtensionsView';
import SearchPanel from '../explorer/SearchPanel';
import SourceControlPanel from '../scm/SourceControlPanel';
import SettingsNav from '../settings/SettingsNav';
import TerminalPanel from './TerminalPanel';

export default function Sidebar() {
  const activity = useStore((s) => s.activity);

  switch (activity) {
    case 'explorer':
      return <ExplorerPanel />;
    case 'search':
      return <SearchPanel />;
    case 'scm':
      return <SourceControlPanel />;
    case 'ai':
      return <AiSidebar />;
    case 'terminal':
      return <TerminalPanel />;
    case 'extensions':
      return <ExtensionsView />;
    case 'settings':
      return <SettingsNav />;
  }
}
