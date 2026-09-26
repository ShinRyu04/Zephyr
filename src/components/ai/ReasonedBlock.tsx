import { useEffect, useRef, useState } from 'react';
import { tx } from '../../lib/i18n';

export default function ReasonedBlock({
  text,
  streaming,
}: {
  text: string;

  streaming: boolean;
}) {

  const [terbuka, setTerbuka] = useState(streaming);
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (streaming) setTerbuka(true);
  }, [streaming]);

  useEffect(() => {
    if (terbuka && streaming && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, terbuka, streaming]);

  const baris = text.split('\n').length;
  const karakter = text.length;

  return (
    <div className="ai-reasoned" data-testid="ai-reasoned">
      <button
        className="ai-reasoned-head"
        data-testid="ai-reasoned-toggle"
        aria-expanded={terbuka}
        onClick={() => setTerbuka((v) => !v)}
      >
        <span className="ai-reasoned-caret">{terbuka ? '▾' : '▸'}</span>
        <span className="ai-reasoned-label">
          {streaming ? tx('Thinking…') : tx('Reasoning')}
        </span>
        <span className="ai-reasoned-meta">
          {baris > 1 ? `${baris} ${tx('lines')} · ` : ''}
          {karakter} {tx('characters')}
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
