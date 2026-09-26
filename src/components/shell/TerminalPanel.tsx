import { useEffect } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { useStore } from '../../lib/store';
import PaneIcon from '../terminal/PaneIcons';
import type { PaneMeta } from '../../lib/types';
import { tx, tf } from '../../lib/i18n';

function StatusDot({ status }: { status: PaneMeta['status'] }) {
  const label =
    status === 'live'
      ? 'live'
      : status === 'exited'
        ? tx('has exited')
        : status === 'connecting'
          ? 'connecting'
          : 'error';
  return <span className={`tp-dot is-${status}`} role="img" aria-label={label} title={label} />;
}

export default function TerminalPanel() {
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const agents = useTerminal((s) => s.agents);
  const visible = useTerminal((s) => s.visible);
  const maxPanes = useTerminal((s) => s.maxPanes);
  const setVisible = useTerminal((s) => s.setVisible);
  const setActiveTab = useTerminal((s) => s.setActiveTab);
  const setActivePane = useTerminal((s) => s.setActivePane);
  const addPane = useTerminal((s) => s.addPane);
  const closePane = useTerminal((s) => s.closePane);
  const killPane = useTerminal((s) => s.killPane);
  const closeTab = useTerminal((s) => s.closeTab);
  const refreshFromBackend = useTerminal((s) => s.refreshFromBackend);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  useEffect(() => {
    void refreshFromBackend();
  }, [refreshFromBackend]);

  const semuaPane = tabs.flatMap((t) => t.panes);
  const hidup = semuaPane.filter((p) => p.status === 'live').length;

  const fokus = (tabId: string, paneId: string) => {
    setSettingsOpen(false);
    if (!visible) setVisible(true);
    setActiveTab(tabId);
    setActivePane(tabId, paneId);

    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-pane-body="${paneId}"] .xterm-helper-textarea`)
        ?.focus();
    }, 80);
  };

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">{tx('Terminal')}</div>

        <div className="tp-summary" data-testid="tp-summary">
          {semuaPane.length === 0
            ? tx('No sessions yet.')
            : tf('{a} tabs · {b} panes · {c} live', { a: tabs.length, b: semuaPane.length, c: hidup })}
        </div>

        <div className="tp-actions">
          <button
            className="btn btn-sm"
            data-testid="tp-new-shell"
            onClick={() => {
              setSettingsOpen(false);
              if (!visible) setVisible(true);
              void addPane('shell');
            }}
          >
            + Shell
          </button>
          <button
            className="btn btn-sm"
            data-testid="tp-new-private"
            onClick={() => {
              setSettingsOpen(false);
              if (!visible) setVisible(true);
              void addPane('private');
            }}
          >
            + Private
          </button>
          <button
            className="btn btn-sm"
            data-testid="tp-toggle-panel"
            onClick={() => setVisible(!visible)}
          >
            {visible ? tx('Hide panel') : tx('Show panel')}
          </button>
        </div>

        <div className="tp-agents" data-testid="tp-agents">
          <div className="tp-subtitle">
            {agents.length > 0 ? tx('Agent CLIs detected') : tx('Agent CLI')}
          </div>
          {agents.length === 0 ? (
            <p className="side-muted" data-testid="tp-agents-kosong">
              {tx('No agent CLI installed. Install one (opencode, Claude Code, Codex, Gemini, Copilot) then reload the list.')}
            </p>
          ) : (
            <>
              <p className="side-muted tp-agents-hint">
                {tx('Click = open the agent in the bottom terminal panel.')}
                {!visible && tx(' The panel is not showing - it will be opened too.')}
              </p>
            {agents.map((a) => (
              <button
                key={a.id}
                className="tp-agent"
                data-testid={`tp-agent-${a.id}`}
                title={a.path}
                onClick={() => {
                  setSettingsOpen(false);
                  if (!visible) setVisible(true);
                  void addPane('agent', { agentId: a.id });
                }}
              >
                <PaneIcon kind="agent" agentId={a.id} size={13} />
                <span className="tp-agent-name">{a.label}</span>
                <span className="tp-agent-plus">+</span>
              </button>
            ))}
            </>
          )}
        </div>
      </div>

      <div className="side-section tp-list-wrap">
        {tabs.length === 0 ? (
          <p className="side-muted" data-testid="tp-empty">
            {tx('The terminal panel is at the bottom (Ctrl+`). Running sessions will appear here with their PID.')}
          </p>
        ) : (
          tabs.map((tab) => (
            <div key={tab.id} className="tp-tab" data-tp-tab={tab.id}>
              <div className="tp-tab-head">
                <button
                  className={`tp-tab-name${tab.id === activeTabId ? ' is-active' : ''}`}
                  onClick={() => {
                    setSettingsOpen(false);
                    if (!visible) setVisible(true);
                    setActiveTab(tab.id);
                  }}
                >
                  {tab.title}
                </button>
                <span className="tp-count">
                  {tab.panes.length}/{maxPanes()}
                </span>
                <button
                  className="tp-x"
                  title={tx('Close tab')}
                  aria-label={`Close ${tab.title}`}
                  data-testid={`tp-close-tab-${tab.id}`}
                  onClick={() => void closeTab(tab.id)}
                >
                  ✕
                </button>
              </div>

              <ul className="tp-panes">
                {tab.panes.map((p) => (
                  <li key={p.id} className="tp-pane" data-tp-pane={p.id}>
                    <button
                      className={`tp-pane-btn${
                        tab.activePaneId === p.id && tab.id === activeTabId ? ' is-active' : ''
                      }`}
                      onClick={() => fokus(tab.id, p.id)}
                      title={p.cwd ?? p.url ?? p.title}
                    >
                      <PaneIcon kind={p.kind} agentId={p.agent?.name} size={13} />
                      <span className="tp-pane-title">{p.title}</span>
                      <StatusDot status={p.status} />
                      <span className="tp-pid">
                        {p.kind === 'browser' ? 'iframe' : p.pid ? `pid ${p.pid}` : '-'}
                      </span>
                    </button>
                    <span className="tp-pane-ops">
                      {p.status === 'live' && p.kind !== 'browser' && (
                        <button
                          className="tp-op"
                          title={tx('Kill process')}
                          data-testid={`tp-kill-${p.id}`}
                          onClick={() => void killPane(p.id)}
                        >
                          kill
                        </button>
                      )}
                      <button
                        className="tp-op"
                        title={tx('Close pane')}
                        data-testid={`tp-close-${p.id}`}
                        onClick={() => void closePane(p.id)}
                      >
                        close
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
