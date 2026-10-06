import { useEffect } from 'react';
import { useAiTabs, CLI_TABS } from '../../lib/aiTabsStore';
import { useTerminal } from '../../lib/terminalStore';
import XtermPane from '../terminal/XtermPane';
import { useT, useTf } from '../../lib/i18n';
import type { PaneMeta } from '../../lib/types';

/*
 * One hosted-CLI tab (Cara A): spawn the CLI once in its own PTY and show its
 * real TUI with the shared <XtermPane/>. Login is handled by the CLI itself, so
 * what runs here shares the same session as the CLI run from a terminal.
 */
export default function CliSessionTab({ agentId }: { agentId: string }) {
  const tr = useT();
  const tf = useTf();
  const meta = CLI_TABS.find((c) => c.id === agentId);
  const label = meta?.label ?? agentId;

  const session = useAiTabs((s) => s.sessions[agentId]);
  const spawning = useAiTabs((s) => s.spawning === agentId);
  const error = useAiTabs((s) => s.error);
  const ensureSession = useAiTabs((s) => s.ensureSession);
  const killSession = useAiTabs((s) => s.killSession);

  /* Is the CLI detected on PATH? `terminalStore` loads this at startup. */
  const detected = useTerminal((s) => s.agents.some((a) => a.id === agentId));

  useEffect(() => {
    if (detected) void ensureSession(agentId);
  }, [detected, agentId, ensureSession]);

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

  if (spawning || !session) {
    return (
      <div className="ai-cli-empty" data-testid={`ai-cli-loading-${agentId}`}>
        <p className="ai-cli-empty-sub">
          {error ? error : tf('Starting {name}…', { name: label })}
        </p>
      </div>
    );
  }

  const pane: PaneMeta = {
    id: session.paneId,
    kind: 'agent',
    agent: { name: agentId, label },
    title: label,
    sessionId: session.paneId,
    status: 'live',
    cwd: '',
    pid: null,
  };

  return (
    <div className="ai-cli-host" data-testid={`ai-cli-host-${agentId}`}>
      <div className="ai-cli-bar">
        <span className="ai-cli-name">{label}</span>
        <button
          className="btn btn-sm"
          data-testid={`ai-cli-restart-${agentId}`}
          title={tr('Restart this session')}
          onClick={() => {
            killSession(agentId);
            void ensureSession(agentId);
          }}
        >
          {tr('Restart')}
        </button>
      </div>
      <div className="ai-cli-term">
        <XtermPane pane={pane} />
      </div>
    </div>
  );
}
