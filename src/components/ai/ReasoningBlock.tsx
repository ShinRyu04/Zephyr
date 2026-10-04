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

export default function ReasoningBlock({
  teks,
  ms,
  berjalan,
}: {
  teks: string;
  ms?: number;
  berjalan?: boolean;
}) {
  /*
   * The block is only useful while it is being written. Waiting for
   * !msg.streaming meant the reasoning arrived and was paid for, then stayed
   * hidden until the answer was already finished - which is exactly when the
   * reader no longer needs it. Worse, on runs that end in an error the
   * reasoning was never shown at all: the whole point of seeing "it was still
   * reasoning about X" is lost precisely when the run fails.
   *
   * So: open while it streams (auto), closed once it is done. The reader who
   * wants to re-read it clicks once - the same contract as before for a
   * finished answer, and no click at all for the live one.
   */
  /* A person who has clicked is done being surprised: after that, the open
     state is theirs. `null` means "nobody has decided yet", which is what lets
     the live/done default apply. */
  const [pilihan, setPilihan] = useState<boolean | null>(null);
  const terbuka = pilihan ?? Boolean(berjalan);
  const isi = teks.trim();
  if (!isi) return null;

  return (
    <div
      className="ai-reason"
      data-testid="ai-reason"
      data-open={terbuka ? '1' : '0'}
      data-live={berjalan ? '1' : '0'}
    >
      <button
        className="ai-reason-head"
        data-testid="ai-reason-toggle"
        aria-expanded={terbuka}
        onClick={() => setPilihan((v) => !(v ?? Boolean(berjalan)))}
      >
        <AiIkon name="thought" size={13} />
        {/* While it streams, the header must not claim a duration: the run is
            not over, and "Thought for 0s" is a number that will be wrong in a
            second. Say what is actually happening instead. */}
        <span className="ai-reason-title">{berjalan ? tx('Thinking') : durasi(ms)}</span>
        <span className="ai-reason-caret" aria-hidden="true">
          {terbuka ? '▾' : '▸'}
        </span>
      </button>
      {terbuka && (
        <div className="ai-reason-body" data-testid="ai-reason-body">
          {isi}
        </div>
      )}
    </div>
  );
}