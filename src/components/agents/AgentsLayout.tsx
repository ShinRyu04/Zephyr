import { lazy, Suspense, useState } from 'react';
import AgentsTitlebar from './AgentsTitlebar';
import AgentsSessions from './AgentsSessions';
import AgentsRight from './AgentsRight';
import '../../styles/agents-window.css';

const AiHost = lazy(() => import('../ai/AiHost'));

/**
 * The 3-column Agents workspace.
 *
 *   +----------------------------------------------------------+
 *   |  titlebar (back/forward, folder, controls, window btns)   |
 *   +---------+------------------------------+-----------------+
 *   | Sessions|  the Zephyr chat              | Changes / Files |
 *   | + Custom|  (AiHost, unmodified)         |                 |
 *   +---------+------------------------------+-----------------+
 *
 * The middle column is `AiHost` EXACTLY as the main window mounts it — the
 * chat's composer, transcript, model picker and mode chips all come from there.
 * Nothing is re-implemented: the user asked for Zephyr's own chat in the middle,
 * not a lookalike, and `AiWindow` already proved the whole host can be dropped
 * into a pop-out root unchanged.
 */
export default function AgentsLayout() {
  const [kiriBuka, setKiriBuka] = useState(true);
  const [kananBuka, setKananBuka] = useState(true);
  const [maks, setMaks] = useState(false);

  return (
    <div className={`ag-root${maks ? ' is-maks' : ''}`} data-testid="agents-layout">
      <AgentsTitlebar
        kiriBuka={kiriBuka}
        kananBuka={kananBuka}
        onToggleKiri={() => setKiriBuka((v) => !v)}
        onToggleKanan={() => setKananBuka((v) => !v)}
      />
      <div className={`ag-body${kiriBuka && !maks ? '' : ' no-left'}${kananBuka ? '' : ' no-right'}`}>
        {kiriBuka && !maks && (
          <aside className="ag-col ag-left" data-testid="agents-left" aria-label="Sessions">
            <AgentsSessions />
          </aside>
        )}

        <main className="ag-col ag-center" aria-label="Chat">
          <Suspense fallback={null}>
            <AiHost />
          </Suspense>
        </main>

        {kananBuka && (
          <aside className="ag-col ag-right" data-testid="agents-right" aria-label="Changes and files">
            <AgentsRight maks={maks} onToggleMaks={() => setMaks((v) => !v)} />
          </aside>
        )}
      </div>
    </div>
  );
}
