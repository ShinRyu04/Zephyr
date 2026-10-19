import { useEffect } from 'react';
import { cliTabs } from '../../lib/aiTabsStore';
import { useTerminal } from '../../lib/terminalStore';
import CliChat from './CliChat';
import CodexChat from './CodexChat';
import { useT, useTf } from '../../lib/i18n';

/*
 * One hosted-CLI tab, rendered as the native headless chat (Cara B): Zephyr's
 * own bubbles with the CLI run headless. Login is the CLI's own job.
 *
 * The old "Chat / Terminal" mode toggle and the PTY (Cara A) fallback view were
 * removed — the surface is plain now, and the window controls live only in the
 * shared tab strip (AiHost). Codex keeps its own full surface (CodexChat).
 */
export default function CliSessionTab({ agentId }: { agentId: string }) {
  const tr = useT();
  const tf = useTf();
  /*
   * The label comes from the DETECTION result, not a fixed table: `cliTabs`
   * builds it from `list_agents()`, so a CLI the catalogue never listed still
   * gets its own name here.
   */
  const agents = useTerminal((s) => s.agents);
  /*
   * The panel tab resolves the CLI from the SHARED catalogue, so it must wait
   * for that catalogue to be loaded rather than assume it already is.
   *
   * `terminalStore.agents` starts as `[]` and is filled by `loadAgents()`,
   * which App.tsx fires once on mount. A tab opened before that promise
   * settled - or in a window that never ran it - looked the id up in an empty
   * array and reported "claude is not installed" while `claude.exe` was
   * detected and working in the bottom terminal. Same catalogue, two answers.
   */
  const daftarAgen = useTerminal((s) => s.agents);
  const muatAgen = useTerminal((s) => s.loadAgents);
  useEffect(() => {
    if (daftarAgen.length === 0) void muatAgen();
  }, [daftarAgen.length, muatAgen]);

  const meta = cliTabs(agents).find((c) => c.id === agentId);
  const label = meta?.label ?? agentId;

  /* Is the CLI detected on PATH? `terminalStore` loads this at startup. */
  const detected = agents.some((a) => a.id === agentId);

  if (!detected) {
    const docs: Record<string, string> = {
      claude: 'https://docs.anthropic.com/en/docs/claude-code',
      codex: 'https://developers.openai.com/codex/cli',
    };
    return (
      <div className="ai-cli-empty" data-testid={`ai-cli-missing-${agentId}`}>
        <p className="ai-cli-empty-title">{tf('{name} is not installed', { name: label })}</p>
        <p className="ai-cli-empty-sub">
          {tr('Install the CLI and sign in once; the tab appears automatically.')}
        </p>
        {docs[agentId] && (
          <a className="btn btn-sm" href={docs[agentId]} target="_blank" rel="noreferrer">
            {tr('Install guide')}
          </a>
        )}
      </div>
    );
  }

  /*
   * Codex gets its OWN full TUI surface (toolbar + composer + settings), which
   * does not use the Chat/Terminal mode bar at all — see CodexChat. Claude Code
   * and any other hosted CLI keep the shared two-view host below.
   */
  if (agentId === 'codex') {
    return (
      <div className="ai-cli-host is-codex" data-testid={`ai-cli-host-${agentId}`}>
        <CodexChat label={label} />
      </div>
    );
  }

  /*
   * Claude Code is now rendered PLAIN: no "Chat / Terminal" toggle bar and no
   * title row above it. The whole surface is the native chat (headless Cara B),
   * so the window controls that used to crowd the top (maximize, hide, New
   * chat) live only in the shared tab strip (AiHost) — the three features at the
   * top-right. The old PTY "Terminal" fallback view is dropped from the UI; the
   * headless chat is the one surface.
   */
  return (
    <div className="ai-cli-host" data-testid={`ai-cli-host-${agentId}`}>
      <CliChat agentId={agentId} label={label} />
    </div>
  );
}
