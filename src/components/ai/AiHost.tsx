import { lazy, Suspense } from 'react';
import { useAiTabs, CLI_TABS } from '../../lib/aiTabsStore';
import { useTerminal } from '../../lib/terminalStore';
import { useStore } from '../../lib/store';
import AiPanel from './AiPanel';
import AiIkon from './AiIkon';
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

  /*
   * Maximize/Restore lives in the tab strip, SHARED by all three tabs (Chat,
   * Claude Code, Codex), so it costs one slot instead of a button inside every
   * surface. Only meaningful in the right column, where `aiMax` drives
   * `.ai-side-col.is-max` in App.tsx.
   */
  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const aiMax = useStore((s) => s.aiMax);
  const setAiMax = useStore((s) => s.setAiMax);
  const applySettings = useStore((s) => s.applySettings);
  const showMax = aiPos === 'right';

  /* Hide the panel — the same action AiPanel's own header offered, lifted into
     the shared strip so Chat, Claude Code and Codex all close from one place
     (VSCode puts these window controls at the strip's trailing edge). */
  const hidePanel = () => {
    if (aiPos === 'right') {
      useStore.getState().setAiKolomVisible(false);
    } else if (aiPos === 'editor') {
      /* Editor-area view: closing returns the chat to the right column so the
         activity-bar icon can bring it back. */
      void applySettings({ general: { aiPanel: 'right' } } as never);
      useStore.getState().setAiKolomVisible(false);
    } else {
      void import('../../lib/terminalStore').then((m) => m.useTerminal.getState().setVisible(false));
    }
  };

  return (
    <div className="ai-host" data-testid="ai-host">
      {/* The strip always renders: it carries the shared window controls
          (maximize + hide) at its trailing edge, plus the CLI tabs when any
          are detected. */}
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
          {/* VSCode-style window controls at the strip's trailing edge, shared
              by all tabs: maximize/restore (right column only) + hide panel. */}
          <span className="ai-host-tabs-spacer" aria-hidden="true" />
          {showMax && (
            <button
              className="ai-host-win"
              data-testid="ai-host-maximize"
              title={aiMax ? tr('Restore panel size') : tr('Maximize panel')}
              aria-label={aiMax ? tr('Restore panel size') : tr('Maximize panel')}
              aria-pressed={aiMax}
              onClick={() => setAiMax(!aiMax)}
            >
              <AiIkon name={aiMax ? 'restore' : 'maximize'} size={14} />
            </button>
          )}
          <button
            className="ai-host-win"
            data-testid="ai-host-hide"
            title={tr('Hide AI panel')}
            aria-label={tr('Hide AI panel')}
            onClick={hidePanel}
          >
            <AiIkon name="close" size={14} />
          </button>
        </div>

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
