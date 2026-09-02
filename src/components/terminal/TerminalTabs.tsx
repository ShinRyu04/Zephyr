// TerminalTabs.tsx — tab strip terminal + toolbar:
// "+" pane shell, dropdown jenis shell, [+ Agent] popover, Split,
// Split With Browser, kebab (Rename/Clear/Kill/Close), sembunyikan panel.

import { useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { clearTerm } from '../../lib/xtermRegistry';
import PaneIcon, { AgentLogo } from './PaneIcons';
import type { PaneKind, TerminalTab } from '../../lib/types';

/** Ikon aksi kecil untuk tombol toolbar & item menu (ukuran seragam). */
function ActionIcon({
  name,
}: {
  name:
    | 'plus'
    | 'chevron'
    | 'kebab'
    | 'hide'
    | 'rename'
    | 'clear'
    | 'kill'
    | 'close'
    | 'split'
    | 'browser'
    | 'robot'
    | 'maximize'
    | 'restore';
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 16 16" className="tt-icon" aria-hidden="true">
      {name === 'plus' && <path d="M8 3.5v9M3.5 8h9" {...common} />}
      {name === 'chevron' && <path d="M4 6.5l4 3.5 4-3.5" {...common} />}
      {name === 'kebab' && (
        <>
          <circle cx="8" cy="3.6" r="1.15" fill="currentColor" />
          <circle cx="8" cy="8" r="1.15" fill="currentColor" />
          <circle cx="8" cy="12.4" r="1.15" fill="currentColor" />
        </>
      )}
      {name === 'hide' && <path d="M3.5 5.5l4.5 4 4.5-4M3.5 11h9" {...common} />}
      {name === 'rename' && <path d="M9.5 3.5l3 3-6 6H3.5v-3z" {...common} />}
      {name === 'clear' && <path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8h5.6l.7-8" {...common} />}
      {name === 'kill' && <path d="M8 2.8v5.4M5 4.6a4.2 4.2 0 106 0" {...common} />}
      {name === 'close' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" {...common} />}
      {name === 'split' && <path d="M2.5 3h11v10h-11zM8 3v10" {...common} />}
      {name === 'browser' && <path d="M2.5 3.5h11v9h-11zM2.5 6h11" {...common} />}
      {name === 'robot' && (
        <>
          <rect x="3" y="5.5" width="10" height="7" rx="2" {...common} />
          <path d="M8 3v2.5" {...common} />
          <circle cx="6.2" cy="9" r="0.9" fill="currentColor" />
          <circle cx="9.8" cy="9" r="0.9" fill="currentColor" />
        </>
      )}
      {name === 'maximize' && <path d="M4 9.5l4-3.5 4 3.5" {...common} />}
      {name === 'restore' && <path d="M4 6.5l4 3.5 4-3.5" {...common} />}
    </svg>
  );
}

function RenameInput({ tab }: { tab: TerminalTab }) {
  const rename = useTerminal((s) => s.renameTab);
  const setRenaming = useTerminal((s) => s.setRenaming);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="tt-rename"
      defaultValue={tab.title}
      aria-label="Nama tab terminal"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') rename(tab.id, (e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') setRenaming(null);
      }}
      onBlur={(e) => rename(tab.id, e.target.value)}
    />
  );
}

export default function TerminalTabs() {
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const shells = useTerminal((s) => s.shells);
  const agents = useTerminal((s) => s.agents);
  const pickerOpen = useTerminal((s) => s.pickerOpen);
  const agentPickerOpen = useTerminal((s) => s.agentPickerOpen);
  const menuFor = useTerminal((s) => s.menuFor);
  const renamingId = useTerminal((s) => s.renamingId);
  const terminalError = useTerminal((s) => s.terminalError);

  const setActiveTab = useTerminal((s) => s.setActiveTab);
  const newTab = useTerminal((s) => s.newTab);
  const closeTab = useTerminal((s) => s.closeTab);
  const addPane = useTerminal((s) => s.addPane);
  const closePane = useTerminal((s) => s.closePane);
  const killPane = useTerminal((s) => s.killPane);
  const setLayout = useTerminal((s) => s.setLayout);
  const setPickerOpen = useTerminal((s) => s.setPickerOpen);
  const setAgentPickerOpen = useTerminal((s) => s.setAgentPickerOpen);
  const setMenuFor = useTerminal((s) => s.setMenuFor);
  const setRenaming = useTerminal((s) => s.setRenaming);
  const setPaneMenuFor = useTerminal((s) => s.setPaneMenuFor);
  const setVisible = useTerminal((s) => s.setVisible);
  const maximized = useTerminal((s) => s.maximized);
  const toggleMaximized = useTerminal((s) => s.toggleMaximized);

  // Tutup semua dropdown saat klik di luar / Escape.
  useEffect(() => {
    if (!pickerOpen && !agentPickerOpen && !menuFor) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.tt-dropdown') && !el.closest('.tt-btn')) {
        setPickerOpen(false);
        setAgentPickerOpen(false);
        setMenuFor(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        setAgentPickerOpen(false);
        setMenuFor(null);
        setPaneMenuFor(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, agentPickerOpen, menuFor, setPickerOpen, setAgentPickerOpen, setMenuFor, setPaneMenuFor]);

  const menuTab = tabs.find((t) => t.id === menuFor);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activePane = activeTab?.panes.find((p) => p.id === activeTab.activePaneId) ?? null;

  return (
    <div className="term-header">
      <div className="tt-list" role="tablist" aria-label="Tab terminal">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeTabId}
            tabIndex={0}
            title={`${t.title} — ${t.panes.length} pane`}
            className={`tt-tab${t.id === activeTabId ? ' is-active' : ''}`}
            data-term-tab={t.id}
            onClick={() => setActiveTab(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab(t.id);
              }
            }}
            onDoubleClick={() => setRenaming(t.id)}
          >
            <PaneIcon kind={t.panes[0]?.kind ?? 'shell'} agentId={t.panes[0]?.agent?.name} />
            {renamingId === t.id ? <RenameInput tab={t} /> : <span className="tt-name">{t.title}</span>}
            {t.panes.length > 1 && <span className="tt-count">{t.panes.length}</span>}
            <button
              className="tt-tab-close"
              title="Tutup tab terminal"
              aria-label={`Tutup ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(t.id);
              }}
            >
              <ActionIcon name="close" />
            </button>
          </div>
        ))}
      </div>

      <div className="tt-actions">
        {terminalError && <span className="tt-error">{terminalError}</span>}

        <button
          className="tt-btn"
          title="Pane shell baru (Ctrl+Shift+T)"
          aria-label="Pane shell baru"
          data-testid="term-new"
          onClick={() => void addPane('shell')}
        >
          <ActionIcon name="plus" />
        </button>

        <div className="tt-picker-wrap">
          <button
            className="tt-btn"
            title="Pilih jenis terminal"
            aria-label="Pilih jenis terminal"
            data-testid="term-picker"
            onClick={() => setPickerOpen(!pickerOpen)}
          >
            <ActionIcon name="chevron" />
          </button>
          {pickerOpen && (
            <div className="tt-dropdown" role="menu">
              {shells.map((sh) => (
                <button
                  key={sh.id}
                  className="tt-drop-item"
                  role="menuitem"
                  title={sh.path}
                  onClick={() => void addPane((sh.id === 'powershell' ? 'shell' : sh.id) as PaneKind)}
                >
                  <PaneIcon kind={sh.id === 'powershell' ? 'shell' : (sh.id as PaneKind)} />
                  {sh.label}
                </button>
              ))}
              <div className="tt-drop-sep" />
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-new-private"
                onClick={() => void addPane('private')}
              >
                <PaneIcon kind="private" />
                Private Terminal
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-new-tab"
                onClick={() => {
                  newTab();
                  setPickerOpen(false);
                }}
              >
                <ActionIcon name="plus" />
                Tab terminal baru
              </button>
            </div>
          )}
        </div>

        {/* ── + Agent ── */}
        <div className="tt-picker-wrap">
          <button
            className="tt-btn"
            title="Tambah pane AI agent"
            aria-label="Tambah pane AI agent"
            data-testid="term-agent"
            onClick={() => setAgentPickerOpen(!agentPickerOpen)}
          >
            <ActionIcon name="robot" />
          </button>
          {agentPickerOpen && (
            <div className="tt-dropdown" role="menu" data-testid="agent-picker">
              {agents.length === 0 ? (
                <div className="tt-drop-empty">
                  Tidak ada CLI agent terdeteksi.
                  <br />
                  Pasang opencode / claude / codex / gemini.
                </div>
              ) : (
                agents.map((a) => (
                  <button
                    key={a.id}
                    className="tt-drop-item"
                    role="menuitem"
                    title={`${a.path} — klik lagi untuk pane kedua`}
                    data-agent={a.id}
                    onClick={() => void addPane('agent', { agentId: a.id })}
                  >
                    <AgentLogo id={a.id} />
                    {a.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          className="tt-btn"
          title="Split: susun 2 pane atas-bawah / kiri-kanan"
          aria-label="Ubah layout split"
          data-testid="term-split"
          disabled={!activeTab || activeTab.panes.length < 2}
          onClick={() => activeTab && setLayout(activeTab.id, activeTab.layout === 'grid' ? 'split' : 'grid')}
        >
          <ActionIcon name="split" />
        </button>

        <button
          className="tt-btn"
          title="Split With Browser — tambah pane preview di samping shell"
          aria-label="Split With Browser"
          data-testid="term-browser"
          onClick={async () => {
            // Belum ada pane sama sekali? buat shell dulu supaya benar-benar
            // jadi split, bukan cuma browser sendirian.
            if ((activeTab?.panes.length ?? 0) === 0) await addPane('shell');
            await addPane('browser');
          }}
        >
          <ActionIcon name="browser" />
        </button>

        <div className="tt-picker-wrap">
          <button
            className="tt-btn"
            title="Menu tab terminal"
            aria-label="Menu tab terminal"
            data-testid="term-kebab"
            disabled={!activeTabId}
            onClick={() => setMenuFor(menuFor ? null : activeTabId)}
          >
            <ActionIcon name="kebab" />
          </button>
          {menuTab && (
            <div className="tt-dropdown tt-dropdown-right" role="menu">
              <button className="tt-drop-item" role="menuitem" onClick={() => setRenaming(menuTab.id)}>
                <ActionIcon name="rename" />
                Rename Tab
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-clear"
                disabled={!activePane || activePane.kind === 'browser'}
                onClick={() => {
                  if (activePane) clearTerm(activePane.id);
                  setMenuFor(null);
                }}
              >
                <ActionIcon name="clear" />
                Clear Pane
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-kill"
                disabled={!activePane || activePane.kind === 'browser'}
                onClick={() => activePane && void killPane(activePane.id)}
              >
                <ActionIcon name="kill" />
                Kill Process
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-close-pane"
                disabled={!activePane}
                onClick={() => activePane && void closePane(activePane.id)}
              >
                <ActionIcon name="close" />
                Close Pane
              </button>
              <div className="tt-drop-sep" />
              <button
                className="tt-drop-item tt-drop-danger"
                role="menuitem"
                onClick={() => void closeTab(menuTab.id)}
              >
                <ActionIcon name="close" />
                Close Tab
              </button>
            </div>
          )}
        </div>

        <button
          className="tt-btn"
          title={maximized ? 'Pulihkan ukuran panel (Ctrl+Alt+`)' : 'Perbesar panel (Ctrl+Alt+`)'}
          aria-label={maximized ? 'Pulihkan ukuran panel terminal' : 'Perbesar panel terminal'}
          aria-pressed={maximized}
          data-testid="term-maximize"
          onClick={toggleMaximized}
        >
          <ActionIcon name={maximized ? 'restore' : 'maximize'} />
        </button>

        <button
          className="tt-btn"
          title="Sembunyikan panel (Ctrl+`)"
          aria-label="Sembunyikan panel terminal"
          onClick={() => setVisible(false)}
        >
          <ActionIcon name="hide" />
        </button>
      </div>
    </div>
  );
}
