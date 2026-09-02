// Sidebar.tsx — panel kiri per ikon ActivityBar.
//
// CATATAN (jangan diulang): daftar 11 section Settings hidup di SINI
// (SettingsNav), bukan di dalam halaman. Sempat ada di dua tempat dan
// hasilnya daftar dobel + Reset Semua muncul dua kali di layar.

import { useStore } from '../../lib/store';
import ExplorerPanel from '../explorer/ExplorerPanel';
import SearchPanel from '../explorer/SearchPanel';
import SettingsNav from '../settings/SettingsNav';
import TerminalPanel from './TerminalPanel';

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">{title}</div>
        <p className="side-muted">{note}</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const activity = useStore((s) => s.activity);

  switch (activity) {
    case 'explorer':
      return <ExplorerPanel />;
    case 'search':
      return <SearchPanel />;
    case 'scm':
      return <Placeholder title="Source Control" note="Integrasi git — fase 10." />;
    case 'ai':
      return <Placeholder title="AI / MCP" note="Panel AI fase 09, MCP 9222 fase 11." />;
    case 'terminal':
      return <TerminalPanel />;
    case 'settings':
      return <SettingsNav />;
  }
}
