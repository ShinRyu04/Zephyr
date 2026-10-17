import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAiTabs, CLI_TABS } from '../../lib/aiTabsStore';
import { useTerminal } from '../../lib/terminalStore';
import { useStore } from '../../lib/store';
import AiPanel from './AiPanel';
import PanelTrail from './PanelTrail';
import PanelWins from './PanelWins';
import { useT } from '../../lib/i18n';

const CliSessionTab = lazy(() => import('./CliSessionTab'));

/*
 * The AI panel with a VSCode/Copilot-style tab strip on top.
 *
 * Tab "Chat" is Zephyr's own AI panel. A tab for Claude Code / Codex appears
 * only when that CLI is actually detected on PATH (same rule VSCode uses for an
 * installed extension), and hosts the CLI's real TUI (Cara A). The chat panel
 * is kept MOUNTED when a CLI tab is in front (hidden with CSS, not unmounted),
 * so switching back is instant and a streaming answer is never thrown away.
 */
export default function AiHost({ composerId = '' }: { composerId?: string }) {
  const tr = useT();
  const active = useAiTabs((s) => s.active);
  const setActive = useAiTabs((s) => s.setActive);

  /* Which CLI tabs to show: the catalogue entries that are actually detected.
     Read as a primitive-ish derived list is fine here — the agents array
     identity is stable in terminalStore between loads. */
  const agents = useTerminal((s) => s.agents);
  const cliTabs = CLI_TABS.filter((c) => agents.some((a) => a.id === c.id));

  /* If the active CLI tab's CLI disappeared (rescan), fall back to chat. */
  const activeValid = active === 'chat' || cliTabs.some((c) => c.id === active);
  const current: typeof active = activeValid ? active : 'chat';

  /*
   * The trail (`PanelTrail`) renders on this row in every state, and decides
   * its own contents. `showMax` is the right column's rule: maximize only means
   * something when the panel has a width to grow into.
   */
  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const showMax = aiPos === 'right';
  const aiMax = useStore((s) => s.aiMax);

  /*
   * While MAXIMISED the tab row travels up into the top control row above the
   * Sessions column, so tabs and action buttons share ONE bar with the tabs at
   * the leading edge. A PORTAL, not a second copy: the tablist must stay a
   * single element or `aria-selected` and the tab order would exist twice.
   *
   * The host is found by id, not by context: App renders it, this subtree does
   * not own it, and the lookup has to re-run the first time the panel grows.
   */
  const [topHost, setTopHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!aiMax) {
      setTopHost(null);
      return;
    }
    setTopHost(document.getElementById('ai-side-top-tabs'));
  }, [aiMax]);

  /*
   * The tab strip. Built once, then either kept here (compact) or PORTALLED up
   * into the top control row above the Sessions column (maximised), so "Chat /
   * Claude Code / Codex" and the action buttons share one bar. A portal rather
   * than a second copy: the tablist has to stay a single element, or there
   * would be two of every tab in the tab order.
   */
  const strip = (
    <div className="ai-host-tabs" role="tablist" data-testid="ai-host-tabs">
      <button
        role="tab"
        aria-selected={current === 'chat'}
        className={`ai-host-tab${current === 'chat' ? ' is-on' : ''}`}
        data-testid="ai-host-tab-chat"
        onClick={() => setActive('chat')}
      >
        {tr('Agent')}
      </button>
      {cliTabs.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={current === c.id}
          className={`ai-host-tab${current === c.id ? ' is-on' : ''}`}
          data-testid={`ai-host-tab-${c.id}`}
          onClick={() => setActive(c.id)}
        >
          {c.label}
        </button>
      ))}
      <span className="ai-host-tabs-spacer" aria-hidden="true" />
      {/* COMPACT only: when expanded, the trail lives in the top control row
          (App renders it there) and must not also be down here. */}
      {!aiMax && current === 'chat' && <PanelTrail showMax={showMax} />}
      {!aiMax && current !== 'chat' && (
        <>
          <span className="ai-host-sep" aria-hidden="true" />
          <PanelWins showMax={showMax} />
        </>
      )}
    </div>
  );

  return (
    <div className="ai-host" data-testid="ai-host">
      {/*
        * Maximised: the strip goes up to the top control row, for EVERY tab —
        * the tabs are how you get back, so they must not travel with only one
        * of the surfaces they switch between. Compact: it stays right here.
        */}
      {aiMax && topHost ? createPortal(strip, topHost) : strip}

      <div className="ai-host-body">
        {/* Chat stays mounted; CSS hides it when a CLI tab is in front so a
            streaming run is not interrupted by switching tabs. */}
        <div
          className="ai-host-pane"
          data-testid="ai-host-pane-chat"
          hidden={current !== 'chat'}
        >
          <AiPanel composerId={composerId} />
        </div>
        {current !== 'chat' && (
          <div className="ai-host-pane" data-testid={`ai-host-pane-${current}`}>
            <Suspense fallback={null}>
              <CliSessionTab agentId={current} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
