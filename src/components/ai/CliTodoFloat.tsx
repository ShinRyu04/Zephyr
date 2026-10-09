import { memo, useEffect, useMemo, useState } from 'react';
import type { CliMsg, CliTodo } from '../../lib/aiCliStore';
import AiIkon from './AiIkon';
import { useT } from '../../lib/i18n';

/*
 * Whether the reader has folded the plan away.
 *
 * PERSISTED, unlike most panel state in this app. The card is pinned above the
 * composer for the whole run, and someone who does not want it there wants it
 * gone for every run — asking again on each new turn would be a control that
 * forgets the answer it was just given. localStorage because it is a
 * per-viewer preference about chrome, not shared state, and because it must
 * survive a reload without a round trip.
 */
const KUNCI_TODO_TUTUP = 'zephyr.cli.todoHidden';

function awalTutup(): boolean {
  try {
    return localStorage.getItem(KUNCI_TODO_TUTUP) === '1';
  } catch {
    /* Storage blocked: the card shows, which is the safe default — the plan is
       information, and hiding it by accident loses it. */
    return false;
  }
}

/*
 * The agent's plan, floating above the composer.
 *
 * This is the same information the timeline already draws as a checklist, and
 * deliberately so — but it answers a different question by living here.
 * A checklist inside the transcript scrolls away as the run produces output,
 * which is exactly when the reader wants to know how far along it is. Pinned to
 * the composer it stays in view for the whole run, which is what the real CLI
 * does and what was asked for: the plan appears above the input box, not in the
 * middle of the messages.
 *
 * The two renderings are not redundant in practice: the timeline copy is a
 * record of what the plan WAS at that point, and this one is the current state.
 * Showing only this would lose the history; showing only that would lose the
 * glance.
 */
const CliTodoFloat = memo(function CliTodoFloat({ messages }: { messages: readonly CliMsg[] }) {
  const tr = useT();
  const [tutup, setTutup] = useState(awalTutup);

  /* Written on every change rather than at unmount: a run can end abruptly
     (Stop, a provider error, the window closing) and an unmount handler would
     simply never fire, silently losing the reader's choice. */
  useEffect(() => {
    try {
      localStorage.setItem(KUNCI_TODO_TUTUP, tutup ? '1' : '0');
    } catch {
      /* Storage unavailable: the choice holds for this session only. */
    }
  }, [tutup]);
  /* The LAST todo part is the current plan — TodoWrite replaces the whole list
     each time, so an earlier part is a superseded snapshot. Scanning backwards
     from the newest message finds it without walking the whole transcript. */
  const items = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = messages[i].parts;
      if (!parts) continue;
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        if (p.type === 'todo') return p.items as CliTodo[];
      }
    }
    return [];
  }, [messages]);

  if (items.length === 0) return null;
  /* `deleted` is a removal instruction from TaskUpdate, not a state to show. */
  const shown = items.filter((t) => t.status !== 'deleted' && (t.content || t.activeForm));
  if (shown.length === 0) return null;

  const done = shown.filter((t) => t.status === 'completed').length;
  const running = shown.some((t) => t.status === 'in_progress');

  return (
    <div className="cli-todo-float" data-testid="cli-todo-float" data-running={running ? '1' : '0'} data-hidden={tutup ? '1' : '0'}>
      {/*
        * The fold control.
        *
        * The real CLI keeps this card pinned for the whole run, and on a long
        * run it is a standing block of screen above the box you type in. A
        * reader who already knows the plan should be able to put it away — and
        * the counter stays visible while folded, so "how far along" is still
        * answerable without unfolding.
        */}
      <button
        className="cli-todo-float-fold"
        data-testid="cli-todo-float-fold"
        aria-expanded={!tutup}
        title={tutup ? tr('Show the plan') : tr('Hide the plan')}
        onClick={() => setTutup((v) => !v)}
      >
        <span className="cli-todo-float-caret" aria-hidden="true">{tutup ? '▸' : '▾'}</span>
        <span className="cli-todo-float-fold-text">{tr('Plan')}</span>
        <span className="cli-todo-float-fold-count">
          {done}/{shown.length}
        </span>
        <span className={`cli-todo-float-dot${running ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="cli-todo-float-fold-ikon" aria-hidden="true">
          <AiIkon name={tutup ? 'eye' : 'collapse'} size={12} />
        </span>
      </button>
      {!tutup && (
      <>
      <ul className="cli-todo-float-list">
        {shown.map((t, i) => {
          const jalan = t.status === 'in_progress';
          const beres = t.status === 'completed';
          /* `activeForm` while running: "Creating x1.txt" is what is happening,
             "Create x1.txt" is what is to be done. The real CLI switches tense
             the same way, and the tense is what says the step started. */
          const teks = jalan && t.activeForm ? t.activeForm : t.content;
          return (
            <li
              key={t.id || i}
              className={`cli-todo-float-item${beres ? ' is-done' : ''}${jalan ? ' is-now' : ''}`}
              data-status={t.status}
            >
              {/* A square checkbox, as the real CLI draws it — not a circle, not
                  a checkmark glyph. Filled when done, hollow when not. */}
              <span className="cli-todo-float-box" aria-hidden="true">
                {beres ? '☒' : '☐'}
              </span>
              <span className="cli-todo-float-text">{teks}</span>
            </li>
          );
        })}
      </ul>
      </>
      )}
    </div>
  );
});

export default CliTodoFloat;
