// TerminalPanel.tsx — panel sidebar "Terminal" (isi ikon ActivityBar yang
// sebelumnya cuma placeholder).
//
// Gunanya BUKAN menggantikan panel terminal di bawah: ini daftar sesi.
// Kalau sudah ada beberapa tab × beberapa pane, mencari satu pane lewat
// header jadi repot — di sini semuanya kelihatan sekaligus (jenis, PID,
// status, cwd) dan bisa langsung difokuskan atau dimatikan.

import { useEffect } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { useStore } from '../../lib/store';
import PaneIcon from '../terminal/PaneIcons';
import type { PaneMeta } from '../../lib/types';

function StatusDot({ status }: { status: PaneMeta['status'] }) {
  const label =
    status === 'live'
      ? 'hidup'
      : status === 'exited'
        ? 'sudah keluar'
        : status === 'connecting'
          ? 'menyambung'
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

  // Samakan dengan kenyataan di Rust saat panel dibuka: pane yang prosesnya
  // sudah mati di luar sepengetahuan UI akan ditandai "exited".
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
    // Beri fokus keyboard ke pane-nya supaya bisa langsung mengetik.
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-pane-body="${paneId}"] .xterm-helper-textarea`)
        ?.focus();
    }, 80);
  };

  return (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-title">Terminal</div>

        <div className="tp-summary" data-testid="tp-summary">
          {semuaPane.length === 0
            ? 'Belum ada sesi.'
            : `${tabs.length} tab · ${semuaPane.length} pane · ${hidup} hidup`}
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
            {visible ? 'Sembunyikan panel' : 'Tampilkan panel'}
          </button>
        </div>

        {agents.length > 0 && (
          <div className="tp-agents" data-testid="tp-agents">
            <div className="tp-subtitle">Agent CLI terdeteksi</div>
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
          </div>
        )}
      </div>

      <div className="side-section tp-list-wrap">
        {tabs.length === 0 ? (
          <p className="side-muted" data-testid="tp-empty">
            Panel terminal ada di bawah (Ctrl+`). Sesi yang berjalan akan muncul
            di sini beserta PID-nya.
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
                  title="Tutup tab"
                  aria-label={`Tutup ${tab.title}`}
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
                        {p.kind === 'browser' ? 'iframe' : p.pid ? `pid ${p.pid}` : '—'}
                      </span>
                    </button>
                    <span className="tp-pane-ops">
                      {p.status === 'live' && p.kind !== 'browser' && (
                        <button
                          className="tp-op"
                          title="Matikan proses (kill)"
                          data-testid={`tp-kill-${p.id}`}
                          onClick={() => void killPane(p.id)}
                        >
                          kill
                        </button>
                      )}
                      <button
                        className="tp-op"
                        title="Tutup pane"
                        data-testid={`tp-close-${p.id}`}
                        onClick={() => void closePane(p.id)}
                      >
                        tutup
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
