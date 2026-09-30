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

function AiTabView() {
  const tr = useT();
  const aiDiKanan = useStore((s) => s.settings.general.aiPanel === 'right');
  if (aiDiKanan) {
    return (
      <p className="ai-moved" data-testid="ai-tab-moved">
        {tr('The AI panel is showing in the right column. Change it in Settings → General → AI panel.')}
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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;

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
        title={tr('Show the bottom panel (Ctrl+J)')}
        data-testid="term-show"
        onClick={() => setVisible(true)}
      >
        Panel
      </button>
    );
  }

  return (
    <section className="panel-area" style={{ height }} aria-label={tr('Bottom panel')}>
      <div
        className="term-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label={tr('Resize the bottom panel height')}
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
            keterangan pemindahan - bukan salinan kedua panel (dua listener
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
