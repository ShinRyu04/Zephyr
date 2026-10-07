import { memo, useMemo } from 'react';
import type { CliMsg, CliTodo } from '../../lib/aiCliStore';

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
    <div className="cli-todo-float" data-testid="cli-todo-float" data-running={running ? '1' : '0'}>
      {/*
        * No title row.
        *
        * The real CLI prints the list and nothing else — no "Plan", no heading.
        * A label above three checkboxes is a word the reader has to skip on
        * every glance, and the checklist already says what it is. The progress
        * counter is kept but moved to the end of the last line's row, where the
        * real client shows it, so the block reads as one list rather than a
        * titled card.
        */}
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
      <div className="cli-todo-float-foot">
        <span className={`cli-todo-float-dot${running ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="cli-todo-float-count" data-testid="cli-todo-float-count">
          {done}/{shown.length}
        </span>
      </div>
    </div>
  );
});

export default CliTodoFloat;
