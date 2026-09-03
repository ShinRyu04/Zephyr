// Panel.tsx — kontainer panel bawah (fase 20).
//
// Menggantikan TerminalArea sebagai anak langsung `.main-area`. TerminalArea
// TIDAK dihapus atau disalin: ia dirender di dalam tab "terminal" apa adanya,
// jadi split/grid/PTY fase 05/06 tetap milik komponen itu.
//
// KEPUTUSAN PENTING — kenapa tab terminal disembunyikan dengan CSS, bukan
// di-unmount seperti tab lain:
//   Melepas holder xterm dari DOM mematikan viewport-nya; saat dipasang lagi
//   xterm harus di-attach ulang dan scrollback yang belum ditulis ke buffer
//   hilang (masalah yang sama dengan xtermRegistry queue di fase 13). PTY-nya
//   sendiri hidup di Rust, tapi UI-nya rusak. Karena itu:
//     - tab non-terminal  : unmount penuh saat tidak aktif (hemat RAM, V8)
//     - tab terminal      : tetap mounted setelah pertama dibuka, disembunyikan
//                           dengan display:none
//   Ini yang membuat V3 lulus (jalankan node -v, tutup panel, buka lagi →
//   riwayat utuh) tanpa mengorbankan V8 untuk empat tab lainnya.

import { useCallback, useEffect, useRef } from 'react';
import { usePanel } from '../../lib/panelStore';
import { useTerminal } from '../../lib/terminalStore';
import PanelTabStrip from './PanelTabStrip';
import ProblemsView from './ProblemsView';
import OutputView from './OutputView';
import DebugConsoleView from './DebugConsoleView';
import PortsView from './PortsView';
import TerminalArea from './TerminalArea';

export default function Panel() {
  const visible = useTerminal((s) => s.visible);
  const height = useTerminal((s) => s.height);
  const setHeight = useTerminal((s) => s.setHeight);
  const setVisible = useTerminal((s) => s.setVisible);
  const activeTab = usePanel((s) => s.activeTab);
  const terminalMounted = usePanel((s) => s.terminalMounted);
  const persist = usePanel((s) => s.persist);

  const dragging = useRef(false);

  // Drag splitter (tinggi panel). Tinggi disimpan ke settings saat drag
  // SELESAI, bukan setiap pointermove — menulis file tiap pixel akan
  // menghabiskan I/O.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // 24px = --statusbar-h
      setHeight(window.innerHeight - e.clientY - 24);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('is-resizing-v');
      void persist();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setHeight, persist]);

  const startResize = useCallback(() => {
    dragging.current = true;
    document.body.classList.add('is-resizing-v');
  }, []);

  if (!visible) {
    return (
      <button
        className="term-collapsed"
        title="Tampilkan panel bawah (Ctrl+J)"
        data-testid="term-show"
        onClick={() => setVisible(true)}
      >
        Panel
      </button>
    );
  }

  return (
    <section className="panel-area" style={{ height }} aria-label="Panel bawah">
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Ubah tinggi panel bawah"
        onPointerDown={startResize}
      />

      <PanelTabStrip />

      <div className="panel-body" data-testid="panel-body" data-active-tab={activeTab}>
        {activeTab === 'problems' && <ProblemsView />}
        {activeTab === 'output' && <OutputView />}
        {activeTab === 'debug' && <DebugConsoleView />}
        {activeTab === 'ports' && <PortsView />}

        {/* Terminal: tetap mounted (lihat catatan di atas), disembunyikan saat
            tab lain aktif. `hidden` HTML tidak dipakai karena xterm butuh
            elemen yang punya ukuran saat di-mount pertama kali. */}
        {terminalMounted && (
          <div
            className="panel-term-host"
            data-testid="panel-term-host"
            style={{ display: activeTab === 'terminal' ? 'flex' : 'none' }}
          >
            <TerminalArea embedded />
          </div>
        )}
      </div>
    </section>
  );
}
