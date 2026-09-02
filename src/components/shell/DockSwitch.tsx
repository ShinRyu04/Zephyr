// DockSwitch.tsx — pemilih isi panel bawah: Terminal | AI (fase 09).
//
// PENTING (koreksi user): switch ini TIDAK boleh jadi baris sendiri di atas
// panel — baris tambahan itu menggeser/menutupi toolbar kanan terminal
// (+, jenis shell, agent, split, browser, kebab, maximize, sembunyikan).
// Jadi komponen ini dirender DI DALAM baris header yang sudah ada
// (`.term-header` milik TerminalTabs, `.ai-head` milik AiPanel) sebagai
// elemen paling kiri. Tinggi panel tetap sama seperti sebelum fase 09.

import { useTerminal } from '../../lib/terminalStore';

export default function DockSwitch() {
  const dock = useTerminal((s) => s.dock);
  const setDock = useTerminal((s) => s.setDock);
  const paneCount = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));

  return (
    <div className="dock-switch" role="tablist" aria-label="Isi panel bawah">
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
  );
}
