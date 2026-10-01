import { useCallback, useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import PaneGrid, { PaneEmpty } from '../terminal/PaneGrid';
import { TerminalSideTabs } from '../terminal/TerminalTabs';
import { tx } from '../../lib/i18n';

export default function TerminalArea({ embedded = false }: { embedded?: boolean }) {
  const visible = useTerminal((s) => s.visible);
  const height = useTerminal((s) => s.height);
  const setHeight = useTerminal((s) => s.setHeight);
  const tabs = useTerminal((s) => s.terminalTabs);
  const activeTabId = useTerminal((s) => s.activeTabId);
  const setVisible = useTerminal((s) => s.setVisible);
  const toast = useTerminal((s) => s.toast);
  const setToast = useTerminal((s) => s.setToast);

  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;

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

  if (!visible && !embedded) {
    return (
      <button
        className="term-collapsed"
        title={tx('Show the bottom panel (Ctrl+`)')}
        data-testid="term-show"
        onClick={() => setVisible(true)}
      >
        Terminal{paneCount > 0 && <span className="term-badge">{paneCount}</span>}
      </button>
    );
  }

  const active = tabs.find((t) => t.id === activeTabId) ?? null;

  const isi = (
    <div className="term-split">
      <div className="term-body">{active ? <PaneGrid tab={active} /> : <PaneEmpty />}</div>
      <TerminalSideTabs />
    </div>
  );

  if (embedded) {
    return (
      <div className="term-embedded" aria-label="Terminal">
        {isi}
        {toast && (
          <div className="term-toast" role="status" data-testid="term-toast">
            {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="term-area" style={{ height }} aria-label={tx('Bottom panel')}>
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label={tx('Resize the terminal panel height')}
        onPointerDown={startResize}
      />

      {isi}

      {toast && (
        <div className="term-toast" role="status" data-testid="term-toast">
          {toast}
        </div>
      )}
    </section>
  );
}
