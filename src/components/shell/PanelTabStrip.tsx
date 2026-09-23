// PanelTabStrip.tsx — tab strip panel bawah (fase 20).
//
// Menggantikan DockSwitch sebagai baris pemilih isi panel. DockSwitch (fase 09)
// tetap dipakai DI DALAM header terminal/AI untuk memilih Terminal vs AI —
// jadi tidak ada dua baris tab bertumpuk (pelajaran fase 09: baris tambahan
// di atas panel menutupi toolbar kanan terminal).

import { useRef } from 'react';
import { PANEL_TABS, usePanel, type PanelTabId } from '../../lib/panelStore';
import { useStore } from '../../lib/store';
import Popover from './Popover';
import { useProblems } from '../../lib/problemsStore';
import { useOutput } from '../../lib/outputStore';
import { usePorts } from '../../lib/portsStore';
import { useTerminal } from '../../lib/terminalStore';
import { TerminalOps } from '../terminal/TerminalTabs';
import { runCommand } from '../../lib/commandRegistry';
import { useT, tx } from '../../lib/i18n';

export default function PanelTabStrip() {
  const tr = useT();
  const activeTab = usePanel((s) => s.activeTab);
  // Saat chat di kolom kanan, tab AI di sini tidak perlu ada.
  const aiDiKanan = useStore((s) => s.settings.general.aiPanel === 'right');
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
  /** anchor tombol "…" — menunya dirender lewat portal (lihat Popover). */
  const btnMenu = useRef<HTMLButtonElement | null>(null);

  // Klik-di-luar diurus Popover sendiri; efek lama dihapus supaya tidak ada dua
  // penutup yang saling balap.

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
      return <span className="pts-dot" data-testid="pts-dot-output" aria-label={tx('ada log baru')} />;
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
        {PANEL_TABS.filter((t) => visibleTabs.includes(t.id))
          // Tab AI disembunyikan saat chat sudah tampil di kolom kanan: isinya
          // hanya keterangan pemindahan, jadi slot tabnya terbuang.
          .filter((t) => !(t.id === 'ai' && aiDiKanan))
          .map((t) => (
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

      {/* fase 24.1: kontrol khusus terminal ([+ ▾] dan [⋮]) numpang di baris ini,
          sejajar Problems/Output/…, dan HANYA saat tab Terminal aktif. Dulu
          mereka punya baris toolbar sendiri di bawah — dua baris chrome untuk
          satu tingkat kendali. Waktu tab lain aktif, tombol ini dilepas dari DOM
          (bukan disembunyikan) supaya tidak bisa di-fokus lewat Tab. */}
      {activeTab === 'terminal' && <TerminalOps />}

      <div className="pts-ops" ref={menuRef}>
        <button
          className="pts-op"
          data-testid="pts-menu"
          title={tr('Tampilkan / sembunyikan tab')}
          aria-haspopup="menu"
          aria-expanded={tabMenuOpen}
          ref={btnMenu}
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
          title={tr('Tutup panel (Ctrl+J)')}
          onClick={() => void runCommand('workbench.action.togglePanel')}
        >
          ✕
        </button>

        {tabMenuOpen && (
          <Popover
            anchor={btnMenu.current}
            arah="down"
            sisi="right"
            className="pts-menu"
            testid="pts-menu-list"
            onClose={() => setTabMenuOpen(false)}
          >
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
          </Popover>
        )}
      </div>
    </div>
  );
}
