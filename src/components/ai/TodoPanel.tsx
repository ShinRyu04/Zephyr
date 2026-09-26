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
  const ikon = status === 'done' ? '✓' : status === 'in_progress' ? '◔' : '○';
  return (
    <div className={`todo-item is-${status}`} data-todo-status={status} data-testid={`todo-${n}`}>
      <span className="todo-ikon" aria-hidden="true">
        {ikon}
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
          {/* Bar progres: satu pandangan cukup untuk tahu sejauh mana. */}
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
