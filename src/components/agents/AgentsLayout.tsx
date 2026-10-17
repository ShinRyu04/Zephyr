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

  /* Toggle Details (☰): hides the RIGHT panel — Files, Changes, Search,
     Browser — while the editor/chat in the middle STAYS and grows into the
     freed space. This is the reference design's behaviour: pressing ☰ in the
     file panel collapses the panel, it never collapses the editor too.

     The title bar's ☰ and the strip's button are the SAME control, so both are
     wired to this one function rather than each holding their own flag. */
  const toggleDetails = () => setKananBuka((v) => !v);

  return (
    <div className={`ag-root${maks ? ' is-maks' : ''}`} data-testid="agents-layout">
      <AgentsTitlebar
        kiriBuka={kiriBuka}
        kananBuka={kananBuka}
        onToggleKiri={() => setKiriBuka((v) => !v)}
        onToggleKanan={toggleDetails}
      />
      <div
        className={`ag-body${kiriBuka && !maks ? '' : ' no-left'}${kananBuka ? '' : ' no-right'}${maks ? ' is-maks' : ''}`}
      >
        {kiriBuka && !maks && (
          <aside className="ag-col ag-left" data-testid="agents-left" aria-label="Sessions">
            <AgentsSessions />
          </aside>
        )}

        {/*
          * Maximise hides the CHAT too — the whole point is a full-window
          * file/diff surface, like VS Code's "Maximize Editor Area". The old
          * behaviour kept the chat at ~40% of the bar while only collapsing
          * sessions; the user's complaint was exact: "gua pake maximize jga
          * AI-nya msih ada". So under `maks` the centre does not render at
          * all and the right column takes 100%.
          */}
        {!maks && (
          <main className="ag-col ag-center" aria-label="Chat">
            <Suspense fallback={null}>
              {/*
                * `composerId="agents"` — this window gets its OWN composer.
                *
                * Without it the panel fell back to `''`, the primary surface's
                * key, so the Agents window and the main window shared one draft,
                * one active chat and one run state: typing here overwrote what
                * was typed there, and `/new` here switched the main window's
                * conversation too. Every reader in `AiPanel` resolves through
                * `activeIds[composerId]` / `drafts[composerId]` / `pendings[composerId]`,
                * so the id is the whole fix.
                *
                * `AiWindow` keeps `''` on purpose: it is a separate WebView with
                * its own store, so there it IS the primary surface.
                */}
              <AiHost composerId="agents" />
            </Suspense>
          </main>
        )}

        {kananBuka && (
          <aside
            className={`ag-col ag-right${maks ? ' is-maks' : ''}`}
            data-testid="agents-right"
            aria-label="Changes and files"
          >
            <AgentsRight maks={maks} onToggleMaks={() => setMaks((v) => !v)} />
          </aside>
        )}
      </div>
    </div>
  );
}
