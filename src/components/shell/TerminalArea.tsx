// TerminalArea.tsx — panel terminal bawah: divider resize, tab strip,
// dan pane aktif. Sesi non-aktif tetap hidup (holder-nya dilepas dari DOM).

import { useCallback, useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import TerminalTabs from '../terminal/TerminalTabs';
import XtermPane from '../terminal/XtermPane';

export default function TerminalArea() {
  const visible = useTerminal((s) => s.visible);
  const height = useTerminal((s) => s.height);
  const setHeight = useTerminal((s) => s.setHeight);
  const sessions = useTerminal((s) => s.sessions);
  const activeId = useTerminal((s) => s.activeId);
  const createSession = useTerminal((s) => s.createSession);
  const setVisible = useTerminal((s) => s.setVisible);

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

  const startResize = useCallback(() => {
    dragging.current = true;
    document.body.classList.add('is-resizing-v');
  }, []);

  if (!visible) {
    return (
      <button
        className="term-collapsed"
        title="Tampilkan terminal (Ctrl+`)"
        data-testid="term-show"
        onClick={() => setVisible(true)}
      >
        Terminal {sessions.length > 0 && <span className="term-badge">{sessions.length}</span>}
      </button>
    );
  }

  const active = sessions.find((s) => s.id === activeId) ?? null;

  return (
    <section className="term-area" style={{ height }} aria-label="Panel terminal">
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Ubah tinggi panel terminal"
        onPointerDown={startResize}
      />
      <TerminalTabs />

      <div className="term-body">
        {active ? (
          <XtermPane key={active.id} session={active} />
        ) : (
          <div className="term-empty">
            <p className="side-muted">Belum ada terminal</p>
            <button className="btn btn-primary" onClick={() => void createSession('shell')}>
              Buka Terminal
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
