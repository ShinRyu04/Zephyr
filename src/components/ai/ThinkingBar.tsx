import { useEffect, useMemo, useState } from 'react';
import '../../styles/ai-tool-cards.css';

export interface ThinkingBarProps {
  active: boolean;
  /** Already-translated friendly messages. They rotate while active. */
  statuses: readonly string[];
  startedAt?: number;
  intervalMs?: number;
  className?: string;
  tr: (text: string) => string;
  tf: (template: string, values: Record<string, string | number>) => string;
}

export default function ThinkingBar({
  active,
  statuses,
  startedAt,
  intervalMs = 6000,
  className = '',
  tr,
  tf,
}: ThinkingBarProps) {
  const initialTime = useMemo(() => startedAt ?? Date.now(), [startedAt, active]);
  const [now, setNow] = useState(initialTime);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, initialTime]);

  if (!active) return null;
  const elapsedMs = Math.max(0, now - initialTime);
  const safeInterval = Math.max(1000, intervalMs);
  const statusIndex = statuses.length ? Math.floor(elapsedMs / safeInterval) % statuses.length : 0;
  const status = statuses[statusIndex] ?? tr('Working');
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className={`w4-thinking${className ? ` ${className}` : ''}`} role="status" aria-live="polite">
      <span className="w4-thinking-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </span>
      <span className="w4-thinking-status">{status}</span>
      <span className="w4-thinking-time">{tf('{n}s', { n: seconds })}</span>
    </div>
  );
}
