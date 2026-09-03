// TerminalTabs.tsx — kontrol terminal, dipecah mengikuti tata letak VS Code
// (fase 24.1, permintaan user):
//
//   <TerminalOps />       [+ ▾] dan [⋮] — dirender DI BARIS TAB PANEL
//                         (sejajar Problems/Output/Debug/Terminal/Ports),
//                         dan HANYA saat tab Terminal yang aktif. Jadi tidak
//                         ada baris toolbar tambahan yang memakan tempat.
//   <TerminalSideTabs />  daftar tab VERTIKAL di sisi kanan area terminal.
//                         Muncul hanya kalau tab terminal ≥ 2 — dengan satu
//                         terminal, daftarnya tidak memberi informasi apa pun.
//   ActionIcon            ikon bersama untuk tombol & item menu.
//
// Perbesar / sembunyikan panel TIDAK ada di sini: itu milik PanelTabStrip.
// Satu aksi satu tempat.

import { useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import { clearTerm } from '../../lib/xtermRegistry';
import Popover from '../shell/Popover';
import PaneIcon, { AgentLogo } from './PaneIcons';
import type { PaneKind, TerminalTab } from '../../lib/types';

/** Ikon aksi kecil untuk tombol toolbar & item menu (ukuran seragam). */
export function ActionIcon({
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

/**
 * Daftar tab terminal — kolom vertikal di SISI KANAN area terminal, seperti
 * VS Code. Sengaja mengembalikan null saat hanya ada satu tab: nama tab tunggal
 * tidak menambah informasi, dan barisnya cuma memakan tempat.
 */
export function TerminalSideTabs() {
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const renamingId = useTerminal((s) => s.renamingId);
  const setActiveTab = useTerminal((s) => s.setActiveTab);
  const closeTab = useTerminal((s) => s.closeTab);
  const setRenaming = useTerminal((s) => s.setRenaming);

  if (tabs.length < 2) return null;

  return (
    <div className="tt-side" role="tablist" aria-label="Tab terminal" data-testid="term-side-tabs">
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
          {renamingId === t.id ? (
            <RenameInput tab={t} />
          ) : (
            <span className="tt-name">{t.title}</span>
          )}
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
  );
}

/**
 * Dua kontrol terminal, dirender di baris tab panel (PanelTabStrip).
 *
 * Dulu ada 6 ikon sejajar (+, pilih shell, agent, split, browser, kebab) di
 * baris toolbar tersendiri. Terlalu padat, tiga di antaranya sama-sama berarti
 * "buat sesuatu yang baru", dan barisnya menghabiskan tinggi panel.
 *
 *   [+ ▾]  buat baru      — pane shell (klik), jenis lain (dropdown)
 *   [⋮]    urus yang ada  — clear / kill / close / layout / rename
 *
 * Klik utama tetap satu langkah: "+" langsung membuka pane shell.
 */
export function TerminalOps() {
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const shells = useTerminal((s) => s.shells);
  const agents = useTerminal((s) => s.agents);
  const pickerOpen = useTerminal((s) => s.pickerOpen);
  const menuFor = useTerminal((s) => s.menuFor);
  const terminalError = useTerminal((s) => s.terminalError);

  const newTab = useTerminal((s) => s.newTab);
  const closeTab = useTerminal((s) => s.closeTab);
  const addPane = useTerminal((s) => s.addPane);
  const closePane = useTerminal((s) => s.closePane);
  const killPane = useTerminal((s) => s.killPane);
  const setLayout = useTerminal((s) => s.setLayout);
  const setPickerOpen = useTerminal((s) => s.setPickerOpen);
  const setMenuFor = useTerminal((s) => s.setMenuFor);
  const setRenaming = useTerminal((s) => s.setRenaming);
  const setPaneMenuFor = useTerminal((s) => s.setPaneMenuFor);

  // Anchor tiap dropdown. Menu dirender lewat <Popover> (portal ke body) karena
  // panel bawah punya rantai `overflow: hidden` yang MEMOTONG menu absolut —
  // itu sebabnya "Pilih terminal" / "+ Agent" / kebab dulu terlihat tertimpa.
  const btnPicker = useRef<HTMLButtonElement | null>(null);
  const btnKebab = useRef<HTMLButtonElement | null>(null);

  // Popover mengurus klik-di-luar & Escape-nya sendiri. Yang tersisa di sini:
  // Escape juga menutup menu pane (paneMenuFor) yang bukan milik Popover.
  useEffect(() => {
    if (!pickerOpen && !menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaneMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, menuFor, setPaneMenuFor]);

  const menuTab = tabs.find((t) => t.id === menuFor);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activePane = activeTab?.panes.find((p) => p.id === activeTab.activePaneId) ?? null;

  return (
    <div className="tt-actions" data-testid="term-ops">
      {terminalError && <span className="tt-error">{terminalError}</span>}

      <div className="tt-split-btn">
        <button
          className="tt-btn"
          title="Pane shell baru (Ctrl+Shift+T)"
          aria-label="Pane shell baru"
          data-testid="term-new"
          onClick={() => void addPane('shell')}
        >
          <ActionIcon name="plus" />
        </button>
        <button
          ref={btnPicker}
          className="tt-btn tt-btn-caret"
          title="Buat pane lain: shell tertentu, private, AI agent, browser, tab baru"
          aria-label="Pilihan pane baru"
          data-testid="term-picker"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          <ActionIcon name="chevron" />
        </button>
        {pickerOpen && (
          <Popover
            anchor={btnPicker.current}
            arah="down"
            sisi="left"
            className="tt-dropdown"
            onClose={() => setPickerOpen(false)}
          >
            <div className="tt-drop-label">Shell</div>
            {shells.map((sh) => (
              <button
                key={sh.id}
                className="tt-drop-item"
                role="menuitem"
                title={sh.path}
                onClick={() => {
                  void addPane((sh.id === 'powershell' ? 'shell' : sh.id) as PaneKind);
                  setPickerOpen(false);
                }}
              >
                <PaneIcon kind={sh.id === 'powershell' ? 'shell' : (sh.id as PaneKind)} />
                {sh.label}
              </button>
            ))}
            <button
              className="tt-drop-item"
              role="menuitem"
              data-testid="term-new-private"
              onClick={() => {
                void addPane('private');
                setPickerOpen(false);
              }}
            >
              <PaneIcon kind="private" />
              Private Terminal
            </button>

            {/* AI agent: dulu tombol toolbar sendiri (ikon robot). */}
            <div className="tt-drop-sep" />
            <div className="tt-drop-label">AI agent</div>
            {agents.length === 0 ? (
              <div className="tt-drop-empty" data-testid="agent-picker">
                Tidak ada CLI agent terdeteksi.
                <br />
                Pasang opencode / claude / codex / gemini.
              </div>
            ) : (
              <div data-testid="agent-picker" className="tt-drop-group">
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className="tt-drop-item"
                    role="menuitem"
                    title={`${a.path} — klik lagi untuk pane kedua`}
                    data-agent={a.id}
                    onClick={() => {
                      void addPane('agent', { agentId: a.id });
                      setPickerOpen(false);
                    }}
                  >
                    <AgentLogo id={a.id} />
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="tt-drop-sep" />
            <button
              className="tt-drop-item"
              role="menuitem"
              data-testid="term-browser"
              onClick={async () => {
                setPickerOpen(false);
                // Belum ada pane sama sekali? buat shell dulu supaya benar-benar
                // jadi split, bukan cuma browser sendirian.
                if ((activeTab?.panes.length ?? 0) === 0) await addPane('shell');
                await addPane('browser');
              }}
            >
              <ActionIcon name="browser" />
              Pane Browser (split)
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
          </Popover>
        )}
      </div>

      <div className="tt-picker-wrap">
        <button
          ref={btnKebab}
          className="tt-btn"
          title="Menu tab & pane terminal"
          aria-label="Menu tab & pane terminal"
          data-testid="term-kebab"
          aria-haspopup="menu"
          aria-expanded={!!menuFor}
          disabled={!activeTabId}
          onClick={() => setMenuFor(menuFor ? null : activeTabId)}
        >
          <ActionIcon name="kebab" />
        </button>
        {menuTab && (
          <Popover
            anchor={btnKebab.current}
            arah="down"
            sisi="right"
            className="tt-dropdown"
            onClose={() => setMenuFor(null)}
          >
            <div className="tt-drop-label">Pane aktif</div>
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

            {/* Layout: dulu tombol toolbar tetap, padahal hanya berguna saat ada
                ≥2 pane. Sebagai item menu, status disabled-nya jelas alasannya. */}
            <div className="tt-drop-sep" />
            <div className="tt-drop-label">Tab ini</div>
            <button
              className="tt-drop-item"
              role="menuitem"
              data-testid="term-split"
              disabled={!activeTab || activeTab.panes.length < 2}
              onClick={() => {
                if (activeTab) {
                  setLayout(activeTab.id, activeTab.layout === 'grid' ? 'split' : 'grid');
                }
                setMenuFor(null);
              }}
            >
              <ActionIcon name="split" />
              {activeTab?.layout === 'grid' ? 'Layout: split' : 'Layout: grid'}
            </button>
            <button
              className="tt-drop-item"
              role="menuitem"
              onClick={() => setRenaming(menuTab.id)}
            >
              <ActionIcon name="rename" />
              Rename Tab
            </button>
            <button
              className="tt-drop-item tt-drop-danger"
              role="menuitem"
              onClick={() => void closeTab(menuTab.id)}
            >
              <ActionIcon name="close" />
              Close Tab
            </button>
          </Popover>
        )}
      </div>
    </div>
  );
}
