import { useAi } from '../../lib/aiStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';

function BarisTodo({
  teks,
  status,
  n,
}: {
  teks: string;
  status: 'pending' | 'in_progress' | 'done';
  n: number;
}) {
  /*
   * Three circular status markers, no boxes.
   *
   * The list used to mark rows with text glyphs (✓ / ◔ / ○) that all rendered
   * at the same weight and size, so the one running task was no easier to find
   * than the seven already finished. These are the three shapes a glance can
   * sort without reading:
   *
   *   done         filled disc + white check   (success colour)
   *   in_progress  ring with a sweeping arc    (warning colour, spinning)
   *   pending      hollow ring, low contrast   (muted)
   *
   * The active row is deliberately the loudest: coloured, larger and spinning.
   * Drawn as inline SVG so they take their colour from the theme tokens and sit
   * on the text baseline without depending on a glyph existing in the font.
   */
  const isi =
    status === 'done' ? (
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M4.6 8.3l2.4 2.4 4.4-4.9"
          fill="none"
          stroke="var(--bg0, #0d1117)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ) : status === 'in_progress' ? (
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="todo-putar">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
        <path
          d="M8 1.8a6.2 6.2 0 016.2 6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );

  return (
    <div className={`todo-item is-${status}`} data-todo-status={status} data-testid={`todo-${n}`}>
      <span className="todo-ikon" aria-hidden="true">
        {isi}
      </span>
      <span className="todo-teks">{teks}</span>
    </div>
  );
}

export default function TodoPanel() {
  const tr = useT();
  const todos = useAi((s) => s.agentTodos);
  const agents = useSubAgent((s) => s.agents);
  const sibukSub = useSubAgent((s) => s.sibuk);
  const agentBusy = useAi((s) => s.agentBusy);

  const adaTodo = todos.length > 0;
  const adaSub = agents.length > 0;
  if (!adaTodo && !adaSub) return null;

  const selesai = todos.filter((t) => t.status === 'done').length;
  const persen = adaTodo ? Math.round((selesai / todos.length) * 100) : 0;

  return (
    <div className="todo-panel" data-testid="todo-panel">
      {adaTodo && (
        <div className="todo-blok">
          <div className="todo-head">
            <span className="todo-judul">{tr('Task list')}</span>
            <span className="todo-progress">
              {selesai}/{todos.length}
            </span>
            {(agentBusy || sibukSub) && <span className="todo-spin" aria-hidden="true">◔</span>}
          </div>
          {/* Progress bar: one glance is enough to know how far along it is. */}
          <div className="todo-bar" role="progressbar" aria-valuenow={persen}>
            <div className="todo-bar-isi" style={{ width: `${persen}%` }} />
          </div>
          <div className="todo-list" data-testid="ai-todos">
            {todos.map((t, i) => (
              <BarisTodo key={i} teks={t.content} status={t.status} n={i} />
            ))}
          </div>
        </div>
      )}

      {adaSub && (
        <div className="todo-blok">
          <div className="todo-head">
            <span className="todo-judul">
              {tr('Subagent')} · {agents.filter((a) => a.status === 'selesai').length}/
              {agents.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
