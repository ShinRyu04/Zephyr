import { lazy, Suspense } from 'react';
import { useAiTabs, CLI_TABS } from '../../lib/aiTabsStore';
import { useTerminal } from '../../lib/terminalStore';
import AiPanel from './AiPanel';
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
export default function AiHost() {
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

  return (
    <div className="ai-host" data-testid="ai-host">
      {/* Only show the strip once there is more than the Chat tab — a lone
          "Chat" tab would just be chrome with no choice to make. */}
      {cliTabs.length > 0 && (
        <div className="ai-host-tabs" role="tablist" data-testid="ai-host-tabs">
          <button
            role="tab"
            aria-selected={current === 'chat'}
            className={`ai-host-tab${current === 'chat' ? ' is-on' : ''}`}
            data-testid="ai-host-tab-chat"
            onClick={() => setActive('chat')}
          >
            {tr('Chat')}
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
        </div>
      )}

      <div className="ai-host-body">
        {/* Chat stays mounted; CSS hides it when a CLI tab is in front so a
            streaming run is not interrupted by switching tabs. */}
        <div
          className="ai-host-pane"
          data-testid="ai-host-pane-chat"
          hidden={current !== 'chat'}
        >
          <AiPanel />
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
