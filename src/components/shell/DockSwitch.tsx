// DockSwitch.tsx — pemilih isi panel bawah: Terminal | AI (fase 09).
//
// FASE 24.1: komponen ini kembali jadi SATU BARIS TIPIS berisi pemilih saja.
// Tab terminal pindah ke kolom kanan (TerminalSideTabs) dan tombol [+ ▾] / [⋮]
// pindah ke baris tab panel (TerminalOps di PanelTabStrip), sesuai permintaan
// user: kontrol khusus terminal sejajar Problems/Output/… dan tidak memakan
// baris tambahan.
//
// Perbesar/sembunyikan panel TIDAK ada di sini: itu milik PanelTabStrip.

import { useTerminal } from '../../lib/terminalStore';

export default function DockSwitch() {
  const dock = useTerminal((s) => s.dock);
  const setDock = useTerminal((s) => s.setDock);
  const paneCount = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));

  return (
    <div className="dock-switch" data-testid="dock-switch" data-dock={dock}>
      <div className="dock-tabs" role="tablist" aria-label="Isi panel bawah">
        <button
          role="tab"
          aria-selected={dock === 'terminal'}
          className={`dock-tab${dock === 'terminal' ? ' is-active' : ''}`}
          data-testid="dock-terminal"
          title="Tampilkan terminal di panel bawah"
          onClick={() => setDock('terminal')}
        >
          Terminal
          {paneCount > 0 && <span className="term-badge">{paneCount}</span>}
        </button>
        <button
          role="tab"
          aria-selected={dock === 'ai'}
          className={`dock-tab${dock === 'ai' ? ' is-active' : ''}`}
          data-testid="dock-ai"
          title="Tampilkan panel AI di panel bawah (Ctrl+Shift+A)"
          onClick={() => setDock('ai')}
        >
          AI
        </button>
      </div>
    </div>
  );
}
