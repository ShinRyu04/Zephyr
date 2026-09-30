import { useEffect, useMemo } from 'react';
import { useT, tf } from '../../lib/i18n';
import { useAiDebug, type ReqLog } from '../../lib/aiDebugStore';
import AiIkon from './AiIkon';

/*
 * Debug drawer for the AI panel.
 *
 * Lists the requests the panel has sent, newest first, with the numbers that
 * explain a bad answer: provider, model id, message count, duration, chunks and
 * characters received, and the error text when one arrived. A wrong or empty
 * reply is nearly always a request that was assembled differently than the
 * reader assumes, and none of this was visible before.
 *
 * It floats like the tool gate rather than docking, so it can be opened over a
 * conversation without resizing the dock and losing the message being read.
 */

/** "820ms" under a second, "3.4s" above — durations here are rarely minutes. */
function durasi(ms: number | null): string {
  if (ms === null) return '…';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function jam(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** One row, plus its expanded detail. */
function Baris({ r, buka, onToggle }: { r: ReqLog; buka: boolean; onToggle: () => void }) {
  const tr = useT();
  return (
    <div className={`dbg-row is-${r.status}`} data-testid={`dbg-${r.id}`} data-status={r.status}>
      <button className="dbg-head" onClick={onToggle} aria-expanded={buka}>
        <span className={`dbg-titik is-${r.status}`} aria-hidden="true" />
        <span className="dbg-jam">{jam(r.at)}</span>
        <span className="dbg-model" title={`${r.provider} · ${r.model}`}>
          {r.model}
        </span>
        <span className="dbg-prov">{r.provider}</span>
        <span className="dbg-stat">
          {r.pesan} {tr('msgs')} · {durasi(r.ms)} · {r.chunk}× · {r.balas}B
        </span>
        <AiIkon name="chev-down" size={11} />
      </button>

      {buka && (
        <dl className="dbg-detail">
          <div>
            <dt>{tr('Kind')}</dt>
            <dd>{r.kind}</dd>
          </div>
          <div>
            <dt>{tr('Provider')}</dt>
            <dd>{r.provider}</dd>
          </div>
          <div>
            <dt>{tr('Model')}</dt>
            <dd className="dbg-mono">{r.model}</dd>
          </div>
          <div>
            <dt>{tr('Messages sent')}</dt>
            <dd>{r.pesan}</dd>
          </div>
          <div>
            <dt>{tr('Characters sent')}</dt>
            <dd>{r.chars.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{tr('Duration')}</dt>
            <dd>{durasi(r.ms)}</dd>
          </div>
          <div>
            <dt>{tr('Chunks')}</dt>
            <dd>{r.chunk}</dd>
          </div>
          <div>
            <dt>{tr('Characters received')}</dt>
            <dd>{r.balas.toLocaleString()}</dd>
          </div>
          {r.error && (
            <div className="dbg-err">
              <dt>{tr('Error')}</dt>
              <dd>{r.error}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default function DebugPanel() {
  const tr = useT();
  const buka = useAiDebug((s) => s.buka);
  const setBuka = useAiDebug((s) => s.setBuka);
  const log = useAiDebug((s) => s.log);
  const pilih = useAiDebug((s) => s.pilih);
  const setPilih = useAiDebug((s) => s.setPilih);
  const bersih = useAiDebug((s) => s.bersih);

  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setBuka(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, setBuka]);

  /* Totals for the header: a glance should say "was anything wrong". */
  const ringkas = useMemo(() => {
    const err = log.filter((r) => r.status === 'error').length;
    const jalan = log.filter((r) => r.status === 'jalan').length;
    return { err, jalan, total: log.length };
  }, [log]);

  if (!buka) return null;

  return (
    <>
      <div className="dbg-scrim" data-testid="dbg-scrim" onClick={() => setBuka(false)} />

      <div className="dbg-panel" data-testid="dbg-panel" role="dialog" aria-label={tr('Debug requests')}>
        <div className="dbg-top">
          <AiIkon name="bug" size={14} />
          <span className="dbg-judul">{tr('Debug requests')}</span>
          <span className="dbg-count" data-testid="dbg-count">
            {ringkas.total === 0
              ? tr('No requests yet')
              : tf('{n} logged', { n: ringkas.total }) +
                (ringkas.err > 0 ? ` · ${ringkas.err} ${tr('failed')}` : '') +
                (ringkas.jalan > 0 ? ` · ${ringkas.jalan} ${tr('running')}` : '')}
          </span>
          <button className="dbg-btn" data-testid="dbg-bersih" onClick={bersih} disabled={log.length === 0}>
            {tr('Clear')}
          </button>
          <button className="dbg-x" data-testid="dbg-tutup" title={tr('Close')} onClick={() => setBuka(false)}>
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="dbg-list" data-testid="dbg-list">
          {log.length === 0 ? (
            <p className="dbg-kosong">{tr('Send a message and its request shows up here.')}</p>
          ) : (
            log.map((r) => (
              <Baris key={r.id} r={r} buka={pilih === r.id} onToggle={() => setPilih(pilih === r.id ? null : r.id)} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
