// TerminalArea.tsx — isi panel bawah untuk dock Terminal/AI.
//
// FASE 20: dirender DI DALAM Panel.tsx (`embedded`), jadi resizer + tinggi panel
// dipegang Panel. Mode non-embedded dipertahankan supaya komponen ini masih bisa
// dipakai berdiri sendiri.
//
// FASE 24.1 (tata letak ala VS Code, permintaan user):
//   * Tombol [+ ▾] / [⋮] pindah ke baris tab panel (PanelTabStrip) — lihat
//     TerminalOps. Tidak ada lagi baris `.term-header` di sini.
//   * Daftar tab terminal jadi kolom VERTIKAL di sisi kanan (TerminalSideTabs),
//     dan hanya tampil kalau tab terminal ≥ 2.
//   * DockSwitch (Terminal | AI) tetap satu baris tipis di atas isi.

import { useCallback, useEffect, useRef } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import AiPanel from '../ai/AiPanel';
import DockSwitch from './DockSwitch';
import PaneGrid, { PaneEmpty } from '../terminal/PaneGrid';
import { TerminalSideTabs } from '../terminal/TerminalTabs';

export default function TerminalArea({ embedded = false }: { embedded?: boolean }) {
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

  // Dalam mode embedded, visibilitas & tinggi diurus Panel.tsx.
  if (!visible && !embedded) {
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

  // Pane di kiri, daftar tab vertikal di kanan (kolomnya null kalau < 2 tab).
  const isi =
    dock === 'ai' ? (
      <AiPanel />
    ) : (
      <div className="term-split">
        <div className="term-body">{active ? <PaneGrid tab={active} /> : <PaneEmpty />}</div>
        <TerminalSideTabs />
      </div>
    );

  if (embedded) {
    return (
      <div className="term-embedded" aria-label="Terminal">
        <DockSwitch />
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
    <section className="term-area" style={{ height }} aria-label="Panel bawah">
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Ubah tinggi panel terminal"
        onPointerDown={startResize}
      />

      <DockSwitch />
      {isi}

      {toast && (
        <div className="term-toast" role="status" data-testid="term-toast">
          {toast}
        </div>
      )}
    </section>
  );
}
