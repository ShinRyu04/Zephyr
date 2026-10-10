/*
 * The two job strips that sit between the transcript and the composer: the
 * running loop, and the standing goal.
 *
 * WHY they are strips and not messages: `/loop` and `/goal` used to expand into
 * a sentence that landed in the transcript as a bubble - a paragraph in place of
 * a running job. A loop is a SCHEDULE and a goal is a STANDING INSTRUCTION; both
 * describe the session rather than say something in it, so both belong in the
 * chrome around the composer, where they stay visible while you scroll the
 * conversation they are acting on.
 *
 * The shapes follow the reference: the loop is a green banner with a progress
 * bar and its own stop affordance, the goal is a slim strip with a target
 * glyph, the text, a live clock and pause/done/clear. Colours come from tokens,
 * never hex.
 */
import { useEffect, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useT, tx } from '../../lib/i18n';
import { formatInterval, menitSampai, MAX_LOOP_RUNS } from '../../lib/loopJadwal';
import AiIkon from './AiIkon';

/** `1h 04m`, `42s` - the same clock the goal strip shows. */
function durasi(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const d = total % 60;
  if (j > 0) return `${j}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(d).padStart(2, '0')}s`;
  return `${d}s`;
}

/*
 * A one-second tick, but only while something is actually counting.
 *
 * The alternative - a `setInterval` that always runs - wakes the component every
 * second in every chat, whether or not a loop or goal exists. The flag is
 * passed in by the caller, which is the component that knows whether there is
 * anything to count.
 */
function useDetik(aktif: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!aktif) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [aktif]);
  return now;
}

/* ── Loop banner ───────────────────────────────────────────────────────── */

export function LoopStrip({ composerId = '' }: { composerId?: string }) {
  /* This surface's chat, not the primary one. */
  const sessionId = useAi((s) => s.activeIds[composerId] ?? null);
  const loop = useAi((s) => (sessionId ? s.loops[sessionId] : undefined));
  const hentikanLoop = useAi((s) => s.hentikanLoop);
  const tr = useT();
  const now = useDetik(!!loop);

  if (!loop || !sessionId) return null;

  const sisa = menitSampai(loop.nextAt, now);
  const progres = Math.min(1, Math.max(0, (loop.runs + 1) / MAX_LOOP_RUNS));

  return (
    <div className="ai-loop-strip" data-testid="ai-loop-strip">
      <div className="ai-loop-row">
        <span className="ai-loop-dot" aria-hidden="true" />
        <span className="ai-loop-text">
          {tr('Looping every {interval}. /loop stop to end it.').replace(
            '{interval}',
            formatInterval(loop.everyMs),
          )}
        </span>
        <span className="ai-loop-meta" data-testid="ai-loop-next">
          {tr('next in {n}m').replace('{n}', String(sisa))}
        </span>
        <span className="ai-loop-meta">
          {loop.runs}/{MAX_LOOP_RUNS}
        </span>
        <button
          className="ai-loop-stop"
          data-testid="ai-loop-stop"
          title={tx('Stop loop')}
          onClick={() => hentikanLoop(sessionId)}
        >
          <AiIkon name="close" size={11} />
        </button>
      </div>
      {/* The bar drains as the loop spends its run budget, so a glance says how
          much of it is left without reading the counter. */}
      <div className="ai-loop-bar" aria-hidden="true">
        <span style={{ width: `${progres * 100}%` }} />
      </div>
      <div className="ai-loop-prompt" title={loop.prompt}>
        {loop.prompt}
      </div>
    </div>
  );
}

/* ── Goal strip ────────────────────────────────────────────────────────── */

export function GoalStrip({ composerId = '' }: { composerId?: string }) {
  /* This surface's chat, not the primary one. */
  const sessionId = useAi((s) => s.activeIds[composerId] ?? null);
  const goal = useAi((s) => (sessionId ? s.goals[sessionId] : undefined));
  const setGoal = useAi((s) => s.setGoal);
  const setToast = useAi((s) => s.setToast);
  const tr = useT();
  const terbuka = !!goal && goal.completedAt === null;
  const now = useDetik(!!goal);

  if (!goal || !sessionId) return null;

  return (
    <div className="ai-goal-strip" data-testid="ai-goal-strip">
      <span className="ai-goal-glyph" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="6" />
          <circle cx="8" cy="8" r="2.4" />
        </svg>
      </span>
      <span className="ai-goal-label">{tr('Goal')}</span>
      <span
        className={`ai-goal-text${terbuka ? '' : ' is-done'}`}
        title={goal.text}
        data-testid="ai-goal-text"
      >
        {goal.text}
      </span>
      <span className="ai-goal-clock" data-testid="ai-goal-clock">
        {durasi((goal.completedAt ?? now) - goal.startedAt)}
      </span>
      {terbuka && (
        <>
          <button
            className="ai-goal-act"
            data-testid="ai-goal-done"
            title={tr('Mark goal done')}
            onClick={() => {
              setGoal(sessionId, { ...goal, completedAt: Date.now() });
              setToast(tx('Goal marked done'));
            }}
          >
            <AiIkon name="check" size={11} />
          </button>
          <button
            className="ai-goal-act is-danger"
            data-testid="ai-goal-clear"
            title={tr('Clear goal')}
            onClick={() => {
              setGoal(sessionId, null);
              setToast(tx('Goal cleared'));
            }}
          >
            <AiIkon name="close" size={11} />
          </button>
        </>
      )}
    </div>
  );
}
