import { useState } from 'react';
import AgentsTitleBar from './AgentsTitleBar';
import AgentsSidebar from './AgentsSidebar';
import AgentsKontrolSudut from './AgentsKontrolSudut';
import AgentsComposer from './AgentsComposer';
/* Gaya jendela ini (`.agx-*`). Ia halaman sendiri (`#agents`), bukan bagian
   panel editor, jadi berkasnya dimuat di sini — `App.tsx` tidak mengimpornya. */
import '../../styles/agents2.css';

/*
 * Kerangka jendela Agents.
 *
 * Jendela ini frameless (`decorations: false`), jadi seluruh chrome-nya digambar
 * sendiri. Isinya: title bar di atas, sidebar di kiri, lalu kotak besar di
 * tengah yang memuat kontrol sudut (`IDE ↗` + toggle panel kanan) dan composer.
 */
export default function AgentsApp() {
  const [sidebarTerbuka, setSidebarTerbuka] = useState(true);

  return (
    <div className="agx" data-testid="agx-root">
      <AgentsTitleBar
        sidebarTerbuka={sidebarTerbuka}
        onToggleSidebar={() => setSidebarTerbuka((v) => !v)}
      />
      <div className="agx-body">
        {sidebarTerbuka && <AgentsSidebar />}
        <main className="agx-canvas" data-testid="agx-canvas">
          <AgentsKontrolSudut />
          <AgentsComposer />
        </main>
      </div>
    </div>
  );
}
