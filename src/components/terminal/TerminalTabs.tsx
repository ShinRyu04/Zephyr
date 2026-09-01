// TerminalTabs.tsx — daftar tab terminal + tombol "+" (pilih shell) +
// kebab menu (Rename/Kill/Clear/Close) + tombol sembunyikan panel.

import { useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { clearTerm } from '../../lib/xtermRegistry';
import type { PtyKind, TerminalSession } from '../../lib/types';

/** Ikon per jenis shell (inline SVG, tanpa lib ikon). */
function ShellIcon({ kind }: { kind: string }) {
  if (kind === 'private') {
    return (
      <svg viewBox="0 0 16 16" className="tt-icon" role="img" aria-label="Private (tanpa riwayat)">
        <path
          d="M1.6 8s2.4-4 6.4-4 6.4 4 6.4 4-2.4 4-6.4 4S1.6 8 1.6 8z"
          fill="none"
          stroke="var(--warning)"
          strokeWidth="1.2"
        />
        <circle cx="8" cy="8" r="1.7" fill="var(--warning)" />
        <path d="M3 13L13 3" stroke="var(--warning)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'cmd') {
    return (
      <svg viewBox="0 0 16 16" className="tt-icon" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 6h2M4 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'bash' || kind === 'wsl') {
    return (
      <svg viewBox="0 0 16 16" className="tt-icon" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="var(--success)" strokeWidth="1.2" />
        <path d="M4.2 6.2l2 2-2 2M8 10.4h3.5" stroke="var(--success)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  // PowerShell (default)
  return (
    <svg viewBox="0 0 16 16" className="tt-icon" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
      <path d="M5 5.6l3 2.4-3 2.4M8.6 10.4h3" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function RenameInput({ session }: { session: TerminalSession }) {
  const rename = useTerminal((s) => s.renameSession);
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
      defaultValue={session.title}
      aria-label="Nama terminal"
      onKeyDown={(e) => {
        if (e.key === 'Enter') rename(session.id, (e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') setRenaming(null);
      }}
      onBlur={(e) => rename(session.id, e.target.value)}
    />
  );
}

export default function TerminalTabs() {
  const sessions = useTerminal((s) => s.sessions);
  const activeId = useTerminal((s) => s.activeId);
  const shells = useTerminal((s) => s.shells);
  const pickerOpen = useTerminal((s) => s.pickerOpen);
  const menuFor = useTerminal((s) => s.menuFor);
  const renamingId = useTerminal((s) => s.renamingId);
  const terminalError = useTerminal((s) => s.terminalError);

  const setActive = useTerminal((s) => s.setActive);
  const createSession = useTerminal((s) => s.createSession);
  const closeSession = useTerminal((s) => s.closeSession);
  const killSession = useTerminal((s) => s.killSession);
  const setPickerOpen = useTerminal((s) => s.setPickerOpen);
  const setMenuFor = useTerminal((s) => s.setMenuFor);
  const setRenaming = useTerminal((s) => s.setRenaming);
  const setVisible = useTerminal((s) => s.setVisible);

  // Tutup dropdown/menu saat klik di luar.
  useEffect(() => {
    if (!pickerOpen && !menuFor) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.tt-dropdown') && !el.closest('.tt-btn')) {
        setPickerOpen(false);
        setMenuFor(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        setMenuFor(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, menuFor, setPickerOpen, setMenuFor]);

  const menuSession = sessions.find((s) => s.id === menuFor);

  return (
    <div className="term-header">
      <div className="tt-list" role="tablist" aria-label="Tab terminal">
        {sessions.map((s) => (
          <div
            key={s.id}
            role="tab"
            aria-selected={s.id === activeId}
            tabIndex={0}
            title={`${s.title}${s.pid ? ` — pid ${s.pid}` : ''}${s.alive ? '' : ' (mati)'}`}
            className={`tt-tab${s.id === activeId ? ' is-active' : ''}${s.alive ? '' : ' is-dead'}`}
            data-term-tab={s.id}
            onClick={() => setActive(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActive(s.id);
              }
            }}
            onDoubleClick={() => setRenaming(s.id)}
          >
            <ShellIcon kind={s.kind} />
            {renamingId === s.id ? (
              <RenameInput session={s} />
            ) : (
              <span className="tt-name">{s.title}</span>
            )}
            {!s.alive && <span className="tt-dead">exited</span>}
            <button
              className="tt-close"
              title="Tutup terminal"
              aria-label={`Tutup ${s.title}`}
              onClick={(e) => {
                e.stopPropagation();
                void closeSession(s.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="tt-actions">
        {terminalError && <span className="tt-error">{terminalError}</span>}

        <button
          className="tt-btn"
          title="Terminal baru (Ctrl+`)"
          aria-label="Terminal baru"
          data-testid="term-new"
          onClick={() => void createSession('shell')}
        >
          ＋
        </button>

        <div className="tt-picker-wrap">
          <button
            className="tt-btn"
            title="Pilih jenis terminal"
            aria-label="Pilih jenis terminal"
            data-testid="term-picker"
            onClick={() => setPickerOpen(!pickerOpen)}
          >
            ⌄
          </button>
          {pickerOpen && (
            <div className="tt-dropdown" role="menu">
              {shells.map((sh) => (
                <button
                  key={sh.id}
                  className="tt-drop-item"
                  role="menuitem"
                  title={sh.path}
                  onClick={() => void createSession((sh.id === 'shell' ? 'shell' : sh.id) as PtyKind)}
                >
                  <ShellIcon kind={sh.id} />
                  {sh.label}
                </button>
              ))}
              <div className="tt-drop-sep" />
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-new-private"
                onClick={() => void createSession('private')}
              >
                <ShellIcon kind="private" />
                Private Terminal
              </button>
            </div>
          )}
        </div>

        <div className="tt-picker-wrap">
          <button
            className="tt-btn"
            title="Menu terminal aktif"
            aria-label="Menu terminal aktif"
            data-testid="term-kebab"
            disabled={!activeId}
            onClick={() => setMenuFor(menuFor ? null : activeId)}
          >
            ⋮
          </button>
          {menuSession && (
            <div className="tt-dropdown tt-dropdown-right" role="menu">
              <button className="tt-drop-item" role="menuitem" onClick={() => setRenaming(menuSession.id)}>
                Rename
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-clear"
                onClick={() => {
                  clearTerm(menuSession.id);
                  setMenuFor(null);
                }}
              >
                Clear
              </button>
              <button
                className="tt-drop-item"
                role="menuitem"
                data-testid="term-kill"
                onClick={() => void killSession(menuSession.id)}
              >
                Kill Process
              </button>
              <div className="tt-drop-sep" />
              <button
                className="tt-drop-item tt-drop-danger"
                role="menuitem"
                onClick={() => void closeSession(menuSession.id)}
              >
                Close Terminal
              </button>
            </div>
          )}
        </div>

        <button
          className="tt-btn"
          title="Sembunyikan panel (Ctrl+`)"
          aria-label="Sembunyikan panel terminal"
          onClick={() => setVisible(false)}
        >
          ▾
        </button>
      </div>
    </div>
  );
}
