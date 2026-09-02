// TerminalArea.tsx — panel terminal bawah: divider resize, tab strip,
// grid pane tab aktif, dan toast batas pane.
// Pane tab non-aktif tetap hidup (holder xterm-nya dilepas dari DOM).

import { useCallback, useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import AiPanel from '../ai/AiPanel';
import DockSwitch from './DockSwitch';
import PaneGrid, { PaneEmpty } from '../terminal/PaneGrid';
import TerminalTabs from '../terminal/TerminalTabs';

export default function TerminalArea() {
  const visible = useTerminal((s) => s.visible);
  const height = useTerminal((s) => s.height);
  const setHeight = useTerminal((s) => s.setHeight);
  const dock = useTerminal((s) => s.dock);
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const setVisible = useTerminal((s) => s.setVisible);
  const toast = useTerminal((s) => s.toast);
  const setToast = useTerminal((s) => s.setToast);

  const dragging = useRef(false);

  // Drag divider horizontal (tinggi panel).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // 24px = tinggi StatusBar (token --statusbar-h)
      setHeight(window.innerHeight - e.clientY - 24);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('is-resizing-v');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setHeight]);

  // Toast hilang sendiri setelah 3.5s.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  const startResize = useCallback(() => {
    dragging.current = true;
    document.body.classList.add('is-resizing-v');
  }, []);

  const paneCount = tabs.reduce((n, t) => n + t.panes.length, 0);

  if (!visible) {
    return (
      <button
        className="term-collapsed"
        title="Tampilkan panel bawah (Ctrl+`)"
        data-testid="term-show"
        onClick={() => setVisible(true)}
      >
        {dock === 'ai' ? 'AI' : 'Terminal'}{' '}
        {dock === 'terminal' && paneCount > 0 && <span className="term-badge">{paneCount}</span>}
      </button>
    );
  }

  const active = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <section className="term-area" style={{ height }} aria-label="Panel bawah">
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Ubah tinggi panel terminal"
        onPointerDown={startResize}
      />

      {/* Pemilih isi panel bawah: Terminal | AI (fase 09) — baris sendiri
          di atas isi panel, seperti semula. */}
      <DockSwitch />

      {dock === 'ai' ? (
        <AiPanel />
      ) : (
        <>
          <TerminalTabs />
          <div className="term-body">{active ? <PaneGrid tab={active} /> : <PaneEmpty />}</div>
        </>
      )}

      {toast && (
        <div className="term-toast" role="status" data-testid="term-toast">
          {toast}
        </div>
      )}
    </section>
  );
}
