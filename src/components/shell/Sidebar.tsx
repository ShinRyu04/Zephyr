// Sidebar.tsx — panel kiri. Explorer & Search sudah nyata (fase 04);
// SCM/AI/Terminal/Settings masih placeholder sampai fase masing-masing.

import { useStore } from '../../lib/store';
import ExplorerPanel from '../explorer/ExplorerPanel';
import SearchPanel from '../explorer/SearchPanel';

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
      return <Placeholder title="Terminal" note="Terminal & agent pane — fase 05–06." />;
    case 'settings':
      return <Placeholder title="Settings" note="Halaman settings lengkap — fase 08." />;
  }
}
