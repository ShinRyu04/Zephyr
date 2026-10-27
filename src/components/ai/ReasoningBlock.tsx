import { useState } from 'react';
import AiIkon from './AiIkon';
import { tx, tf } from '../../lib/i18n';

/*
 * The model's own reasoning, folded behind one line.
 *
 * The header states how long the thinking took, because that is the only number
 * a reader can act on: "Thought for 2s" says the model was sure, "Thought for
 * <1s" says it had not much to work out. The glyph is a filled sparkle — the
 * same ✻ the live line sweeps while the model works (see `thought` in AiIkon),
 * so the two states of one row read as a pair. A still thread icon for work that
 * has already stopped reads as a pause that will resume; Hermes's wording says
 * the same thing without the wrong promise.
 *
 * A stream that ends empty is not worth a row: "Thought for <1s" above an empty
 * body is a line that says nothing and takes a click to dismiss.
 */
/*
 * How long the model thought, in the words a reader can act on.
 *
 * `ms` is the ONE number that matters here: "Thought for 8s" says the model had
 * something to work out, "Thought briefly" says it did not. The header is the
 * whole UI for a folded block, so this line is often all the reader sees.
 *
 * WHY the missing case is separate from the short one:
 *
 * This used to return "Thought briefly" for BOTH — a sub-second run and a run
 * whose duration was never measured at all (`ms` undefined, which is what every
 * provider that does not report a reasoning clock produces). That made the app
 * state something it did not know: a model that thought for a minute, on a
 * provider with no clock, was described as having thought briefly. The two
 * cases are now told apart, and the unmeasured one admits it.
 */
function durasi(ms: number | undefined): string {
  /* Never measured — most providers do not report a reasoning clock. Saying
     "briefly" here would be inventing a fact; saying nothing leaves the block
     headerless. So it states the one thing that is true: the thinking happened. */
  if (typeof ms !== 'number' || ms < 0) return tx('Thought');
  const detik = Math.round(ms / 1000);
  if (detik >= 60) {
    const m = Math.floor(detik / 60);
    return tf('Thought for {m}m', { m });
  }
  if (detik >= 1) return tf('Thought for {s}s', { s: detik });
  /*
   * Sub-second, measured. It read "Thought briefly" — a vague word next to
   * three rows that all state a number, and one the reader cannot compare
   * against anything. The same sentence with a real figure keeps the header
   * doing its job: a line of "Thought for <1s" rows is visibly the cheap part
   * of a run, which is the whole reason the duration is on screen.
   */
  return tx('Thought for <1s');
}

export default function ReasoningBlock({
  teks,
  ms,
  berjalan,
  judul,
}: {
  teks: string;
  ms?: number;
  berjalan?: boolean;
  /*
   * Node TITLE, when the block is a child of the work tree rather than a
   * standalone row.
   *
   * The reference product labels the node "Thought" and keeps the number
   * beside it; a standalone block has no parent to say what it is, so it keeps
   * the old "Thought for 2s" sentence. Everything else about the block is
   * identical in both places.
   */
  judul?: string;
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

  /* Inside the work tree the node reads "Thought" with the clock beside it;
     standalone it keeps the sentence that names what the clock measures. */
  const labelKepala = judul
    ? berjalan
      ? tx('Thinking')
      : judul
    : berjalan
      ? tx('Thinking')
      : durasi(ms);

  return (
    <div
      className={`ai-reason${judul ? ' is-anak' : ''}`}
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
        <AiIkon name="brain" size={13} />
        {/* While it streams, the header must not claim a duration: the run is
            not over, and "Thought for 0s" is a number that will be wrong in a
            second. Say what is actually happening instead. */}
        <span className="ai-reason-title">{labelKepala}</span>
        {judul && !berjalan && typeof ms === 'number' && ms >= 1000 ? (
          <span className="ai-reason-durasi">
            {ms >= 60000
              ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
              : `${Math.round(ms / 1000)}s`}
          </span>
        ) : null}
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