import { useEffect, useRef, useState } from 'react';
import { tx } from '../../lib/i18n';

/*
 * The model's reasoning, folded into one line.
 *
 * Reasoning is the noisiest thing in a transcript: long, written for the model
 * rather than for the reader, and worth reading only when you want to check HOW
 * an answer was reached. So it stays collapsed to a single row — a label, a
 * live indicator while tokens are still arriving, and a count — and opens on
 * demand.
 *
 * While streaming the row carries a running shimmer and the elapsed seconds
 * instead of a static count, which makes "the model is thinking right now"
 * visible without a spinner taking over the panel.
 */
export default function ReasonedBlock({
  text,
  streaming,
}: {
  text: string;
  /** True while tokens are still arriving. */
  streaming: boolean;
}) {
  /*
   * Collapsed by default, even while streaming. The old version auto-opened,
   * which pushed the answer being waited for down the panel and left the reader
   * scrolling past reasoning to see the reply.
   */
  const [terbuka, setTerbuka] = useState(false);
  const [detik, setDetik] = useState(0);
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!streaming) return;
    setDetik(0);
    const t = window.setInterval(() => setDetik((d) => d + 1), 1000);
    return () => window.clearInterval(t);
  }, [streaming]);

  useEffect(() => {
    if (terbuka && streaming && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, terbuka, streaming]);

  const baris = text.split('\n').length;
  const karakter = text.length;

  return (
    <div className={`ai-reasoned${streaming ? ' is-jalan' : ''}`} data-testid="ai-reasoned">
      <button
        className="ai-reasoned-head"
        data-testid="ai-reasoned-toggle"
        aria-expanded={terbuka}
        onClick={() => setTerbuka((v) => !v)}
      >
        <span className="ai-reasoned-caret" aria-hidden="true">
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={terbuka ? 'M4 6.4 8 10.4l4-4' : 'M6.4 4 10.4 8l-4 4'} />
          </svg>
        </span>

        {/* The robot, the same glyph the activity bar and the subagent rows
            use — one form for "this product's AI" across the whole app. */}
        <span className="ai-reasoned-ikon" aria-hidden="true">
          <svg
            viewBox="0 0 16 16"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          >
            <path d="M8 3.6V2.2" />
            <circle cx="8" cy="1.6" r="0.8" fill="currentColor" stroke="none" />
            <rect x="2.6" y="3.8" width="10.8" height="8.4" rx="2.2" />
            <circle cx="6" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="10" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
            <path d="M6.4 10.2h3.2" />
          </svg>
        </span>

        <span className="ai-reasoned-label">{streaming ? tx('Thinking…') : tx('Reasoning')}</span>

        {streaming && (
          <span className="ai-reasoned-shimmer" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}

        <span className="ai-reasoned-meta">
          {streaming ? (
            <span data-testid="ai-reasoned-detik">{detik}s</span>
          ) : (
            <>
              {baris > 1 ? `${baris} ${tx('lines')} · ` : ''}
              {karakter} {tx('characters')}
            </>
          )}
        </span>
      </button>

      {terbuka && (
        <pre className="ai-reasoned-body" ref={preRef}>
          {text}
        </pre>
      )}
    </div>
  );
}
