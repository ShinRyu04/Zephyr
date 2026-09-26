import { useState } from 'react';
import { useSubAgent, batasParalel } from '../../lib/subagentStore';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

export default function SubAgentBar({ selaluTerbuka = false }: { selaluTerbuka?: boolean }) {
  const tr = useT();

  const [buka, setBuka] = useState(selaluTerbuka);
  const [teks, setTeks] = useState('');
  const jalankan = useSubAgent((s) => s.jalankan);
  const sibuk = useSubAgent((s) => s.sibuk);
  const agentBusy = useAi((s) => s.agentBusy);
  const pending = useAi((s) => s.pending);

  const maks = batasParalel();
  const tugas = teks
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const terlalu = tugas.length > maks;
  const bisaJalan = tugas.length > 0 && !terlalu && !sibuk && !agentBusy && !pending;

  const go = async () => {
    if (!bisaJalan) return;
    await jalankan(tugas);
    setTeks('');
    // The form stays open so the next batch can be queued right away,
    // menutupnya memaksa satu klik tambahan tiap kali.
  };

  if (!buka && !selaluTerbuka) {
    return (
      <button
        className="sub-open"
        data-testid="sub-open"
        title={tr('Run several tasks at once (in parallel)')}
        onClick={() => setBuka(true)}
      >
        ⚡ {tr('Parallel tasks')}
        <span className="sub-open-maks">max {maks}</span>
      </button>
    );
  }

  return (
    <div className="sub-form" data-testid="sub-form">
      <div className="sub-form-head">
        <span className="sub-form-judul">⚡ {tr('Parallel tasks')}</span>
        <span className="sub-form-hint">
          {tr('One line = one subagent')} · max {maks}
        </span>
        {!selaluTerbuka && (
          <button
            className="sub-form-close"
            data-testid="sub-close"
            title={tr('Close')}
            onClick={() => setBuka(false)}
          >
            ✕
          </button>
        )}
      </div>
      <textarea
        className="sub-input"
        data-testid="sub-input"
        rows={2}
        value={teks}
        placeholder={tr('Find usages of function X\nCheck for bugs in module Y')}
        title={tr('Enter sends · Shift+Enter for a new line')}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {

          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void go();
          }
        }}
      />
      <div className="sub-form-foot">
        <span className={`sub-count${terlalu ? ' is-err' : ''}`}>
          {tugas.length}/{maks} {tr('subagent')}
        </span>
        <span className="sub-spacer" />
        <button
          className="btn btn-sm btn-primary"
          data-testid="sub-run"
          disabled={!bisaJalan}
          title={tr('Enter sends · Shift+Enter for a new line')}
          onClick={() => void go()}
        >
          {sibuk ? tr('Running…') : tr('Run')}
        </button>
      </div>
    </div>
  );
}
