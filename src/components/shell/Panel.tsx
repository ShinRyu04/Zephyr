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
import { useStore } from '../../lib/store';
import PanelTabStrip from './PanelTabStrip';
import ProblemsView from './ProblemsView';
import OutputView from './OutputView';
import DebugConsoleView from './DebugConsoleView';
import PortsView from './PortsView';
import SubAgentView from './SubAgentView';
import AiPanel from '../ai/AiPanel';
import TerminalArea from './TerminalArea';
import { useT } from '../../lib/i18n';

/**
 * Isi tab AI di panel bawah.
 *
 * KENAPA tidak langsung `<AiPanel />`: panel AI bisa dipindah ke kolom kanan
 * (Settings → Umum → Panel AI). Kalau tab ini tetap merender AiPanel, akan ada
 * DUA AiPanel ter-mount sekaligus — dua listener `ai-chunk` = setiap token
 * tampil dobel, dan dua store subscription. Jadi tab ini mengikuti aturan yang
 * sama dengan dock bawah: satu tempat saja.
 */
function AiTabView() {
  const tr = useT();
  const aiDiKanan = useStore((s) => s.settings.general.aiPanel === 'right');
  if (aiDiKanan) {
    return (
      <p className="ai-moved" data-testid="ai-tab-moved">
        {tr('Panel AI sedang tampil di kolom kanan. Ubah di Settings → Umum → Panel AI.')}
      </p>
    );
  }
  return <AiPanel />;
}

export default function Panel() {
  const tr = useT();
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
        title={tr('Tampilkan panel bawah (Ctrl+J)')}
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
        aria-label={tr('Ubah tinggi panel bawah')}
        onPointerDown={startResize}
      />

      <PanelTabStrip />

      <div className="panel-body" data-testid="panel-body" data-active-tab={activeTab}>
        {activeTab === 'problems' && <ProblemsView />}
        {activeTab === 'output' && <OutputView />}
        {activeTab === 'debug' && <DebugConsoleView />}
        {activeTab === 'ports' && <PortsView />}
        {activeTab === 'subagents' && <SubAgentView />}

        {/* T4.11: tab AI. AiPanel tetap SATU instance: kalau panel AI dipindah
            ke kolom kanan (Settings → Umum → Panel AI), tab ini menampilkan
            keterangan pemindahan — bukan salinan kedua panel (dua listener
            streaming = setiap token tampil dobel). */}
        {activeTab === 'ai' && <AiTabView />}

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
