// PanelTabStrip.tsx — tab strip panel bawah (fase 20).
//
// Menggantikan DockSwitch sebagai baris pemilih isi panel. DockSwitch (fase 09)
// tetap dipakai DI DALAM header terminal/AI untuk memilih Terminal vs AI —
// jadi tidak ada dua baris tab bertumpuk (pelajaran fase 09: baris tambahan
// di atas panel menutupi toolbar kanan terminal).

import { useEffect, useRef } from 'react';
import { PANEL_TABS, usePanel, type PanelTabId } from '../../lib/panelStore';
import { useProblems } from '../../lib/problemsStore';
import { useOutput } from '../../lib/outputStore';
import { usePorts } from '../../lib/portsStore';
import { useTerminal } from '../../lib/terminalStore';
import { runCommand } from '../../lib/commandRegistry';

export default function PanelTabStrip() {
  const activeTab = usePanel((s) => s.activeTab);
  const visibleTabs = usePanel((s) => s.visibleTabs);
  const tabMenuOpen = usePanel((s) => s.tabMenuOpen);
  const focusTab = usePanel((s) => s.focusTab);
  const toggleTabVisible = usePanel((s) => s.toggleTabVisible);
  const setTabMenuOpen = usePanel((s) => s.setTabMenuOpen);

  // Badge: ambil PRIMITIF, jangan objek/array baru (zustand v5 pakai ===).
  const errors = useProblems((s) => {
    let n = 0;
    for (const list of s.byFile.values()) for (const d of list) if (d.severity === 'error') n++;
    return n;
  });
  const warnings = useProblems((s) => {
    let n = 0;
    for (const list of s.byFile.values()) for (const d of list) if (d.severity === 'warning') n++;
    return n;
  });
  const outputDirty = useOutput((s) => s.channels.some((c) => c.dirty));
  const portCount = usePorts((s) => s.ports.length);
  const paneCount = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));
  const maximized = useTerminal((s) => s.maximized);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tabMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setTabMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [tabMenuOpen, setTabMenuOpen]);

  const badge = (id: PanelTabId) => {
    if (id === 'problems' && (errors > 0 || warnings > 0)) {
      return (
        <span className="pts-badges">
          {errors > 0 && (
            <span className="pts-badge is-error" data-testid="pts-badge-error">
              {errors}
            </span>
          )}
          {warnings > 0 && (
            <span className="pts-badge is-warn" data-testid="pts-badge-warn">
              {warnings}
            </span>
          )}
        </span>
      );
    }
    if (id === 'output' && outputDirty) {
      return <span className="pts-dot" data-testid="pts-dot-output" aria-label="ada log baru" />;
    }
    if (id === 'ports' && portCount > 0) {
      return (
        <span className="pts-badge" data-testid="pts-badge-ports">
          {portCount}
        </span>
      );
    }
    if (id === 'terminal' && paneCount > 0) {
      return (
        <span className="pts-badge" data-testid="pts-badge-term">
          {paneCount}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="pts-root" data-testid="panel-tabstrip">
      <div className="pts-tabs" role="tablist" aria-label="Tab panel bawah">
        {PANEL_TABS.filter((t) => visibleTabs.includes(t.id)).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`pts-tab${activeTab === t.id ? ' is-active' : ''}`}
            data-testid="pts-tab"
            data-tab={t.id}
            onClick={() => focusTab(t.id)}
          >
            {t.label}
            {badge(t.id)}
          </button>
        ))}
      </div>

      <span className="pts-spacer" />

      <div className="pts-ops" ref={menuRef}>
        <button
          className="pts-op"
          data-testid="pts-menu"
          title="Tampilkan / sembunyikan tab"
          aria-haspopup="true"
          aria-expanded={tabMenuOpen}
          onClick={() => setTabMenuOpen(!tabMenuOpen)}
        >
          …
        </button>
        <button
          className="pts-op"
          data-testid="pts-maximize"
          title={maximized ? 'Kembalikan ukuran panel' : 'Perbesar panel'}
          onClick={() => void runCommand('workbench.action.toggleMaximizedPanel')}
        >
          {maximized ? '⌄' : '⌃'}
        </button>
        <button
          className="pts-op"
          data-testid="pts-close"
          title="Tutup panel (Ctrl+J)"
          onClick={() => void runCommand('workbench.action.togglePanel')}
        >
          ✕
        </button>

        {tabMenuOpen && (
          <div className="pts-menu" role="menu" data-testid="pts-menu-list">
            {PANEL_TABS.map((t) => (
              <button
                key={t.id}
                role="menuitemcheckbox"
                aria-checked={visibleTabs.includes(t.id)}
                className="pts-menu-item"
                data-testid="pts-menu-item"
                data-tab={t.id}
                onClick={() => toggleTabVisible(t.id)}
              >
                <span className="pts-check">{visibleTabs.includes(t.id) ? '✓' : ''}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
