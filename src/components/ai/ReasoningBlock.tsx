import { useState } from 'react';
import AiIkon from './AiIkon';
import { tx, tf } from '../../lib/i18n';

/*
 * The model's own reasoning, folded behind one line.
 *
 * The header states how long the thinking took, because that is the only number
 * a reader can act on: "Thought for 2s" says the model was sure, "Thought
 * briefly" says it had not much to work out. The glyph is a head in profile —
 * not a spinner, because nothing is happening here any more. A still thread
 * icon for work that has already stopped reads as a pause that will resume;
 * Hermes's wording says the same thing without the wrong promise.
 *
 * A stream that ends empty is not worth a row: "Thought briefly" above an empty
 * body is a line that says nothing and takes a click to dismiss.
 */
function durasi(ms: number | undefined): string {
  if (typeof ms !== 'number' || ms < 0) return tx('Thought briefly');
  const detik = Math.round(ms / 1000);
  if (detik >= 60) {
    const m = Math.floor(detik / 60);
    return tf('Thought for {m}m', { m });
  }
  if (detik >= 1) return tf('Thought for {s}s', { s: detik });
  return tx('Thought briefly');
}

export default function ReasoningBlock({ teks, ms }: { teks: string; ms?: number }) {
  const [buka, setBuka] = useState(false);
  const isi = teks.trim();
  if (!isi) return null;

  return (
    <div className="ai-reason" data-testid="ai-reason" data-open={buka ? '1' : '0'}>
      <button
        className="ai-reason-head"
        data-testid="ai-reason-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <AiIkon name="thought" size={13} />
        <span className="ai-reason-title">{durasi(ms)}</span>
        <span className="ai-reason-caret" aria-hidden="true">
          {buka ? '▾' : '▸'}
        </span>
      </button>
      {buka && (
        <div className="ai-reason-body" data-testid="ai-reason-body">
          {isi}
        </div>
      )}
    </div>
  );
}