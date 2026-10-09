import { memo, useMemo } from 'react';
import type { CliPart, CliTodo } from '../../lib/aiCliStore';
import { ToolRow } from './claudeCodeUi';
import ReasoningBlock from './ReasoningBlock';
import { useT } from '../../lib/i18n';

/*
 * The agent map: what a `Task` call actually did, nested under it.
 *
 * WHY this exists. A `Task` call runs a whole nested agent loop inside the CLI.
 * By default NONE of it reaches this panel: the transcript shows one `Task` row
 * that sits silent for minutes and then returns a summary. The reader cannot
 * tell a subagent that is working from one that is stuck, and the "agent map"
 * the desktop app draws — a card per agent, with its own rows underneath —
 * has nothing to draw from.
 *
 * `--forward-subagent-text` (see `build_args` in cli_chat.rs) makes the CLI
 * relay the subagent's own text, thinking and tool calls, each tagged with
 * `parent_tool_use_id` = the id of the `Task` call that spawned it. The store
 * keeps that tag on each part; this component is what groups by it.
 *
 * The grouping is derived, never stored. A map built once and kept would have to
 * be patched by every later event — a second source of truth that can drift
 * from `parts`, which is the only thing the transcript actually renders. Deriving
 * it on render costs one pass over a list that is already in memory, and it
 * cannot disagree with what is on screen.
 */

/** The parts a subagent produced, grouped by the `Task` call that owns them. */
export function kelompokkanSubagent(parts: CliPart[]): Map<string, CliPart[]> {
  const peta = new Map<string, CliPart[]>();
  for (const p of parts) {
    if (!p.parentId) continue;
    const daftar = peta.get(p.parentId);
    if (daftar) daftar.push(p);
    else peta.set(p.parentId, [p]);
  }
  return peta;
}

/**
 * How many of a subagent's own tool calls are still running.
 *
 * The count is what makes the parent row honest: a `Task` row that says
 * "running" while its children are finished, or the reverse, is the exact
 * confusion this whole feature exists to remove. Only tool parts are counted —
 * a subagent that is streaming prose has no tool in flight, and that is not the
 * same as being stuck.
 */
function hitungJalan(anak: CliPart[]): { jalan: number; total: number; gagal: number } {
  let jalan = 0;
  let total = 0;
  let gagal = 0;
  for (const p of anak) {
    if (p.type !== 'tool') continue;
    total++;
    if (p.status === 'running') jalan++;
    else if (p.status === 'fail') gagal++;
  }
  return { jalan, total, gagal };
}

/**
 * The nested rows of one subagent, in arrival order.
 *
 * Rendered with the SAME components the main transcript uses — `ToolRow`,
 * `ReasoningBlock` — so a subagent's Bash call looks like every other Bash
 * call. A second, thinner renderer here would drift from the main one and the
 * reader would have to learn two visual languages for the same thing.
 */
export function IsiSubagent({ anak, onImage }: { anak: CliPart[]; onImage?: (src: string) => void }) {
  return (
    <div className="cli-sub-body" data-testid="cli-subagent-body">
      {anak.map((p, i) => {
        if (p.type === 'thinking') {
          /* `berjalan` is false: this is relayed history, not a live stream.
             A shimmer here would claim work is happening in a block that has
             already been written. The parent row carries the live signal. */
          return <ReasoningBlock key={i} teks={p.text} ms={p.ms} berjalan={false} />;
        }
        if (p.type === 'tool') {
          return (
            <ToolRow
              key={p.callId || i}
              name={p.name}
              callId={p.callId}
              title={p.title}
              input={p.input}
              output={p.output}
              status={p.status}
              exitCode={p.exitCode ?? undefined}
              diffOld={p.diffOld}
              diffNew={p.diffNew}
              onImage={onImage}
            />
          );
        }
        if (p.type === 'error') {
          return (
            <div key={i} className="cli-timeline-error" role="alert">
              {p.text}
            </div>
          );
        }
        if (p.type === 'todo') {
          /* A subagent's own plan. Shown inline rather than lifted into the
             main checklist: it is that agent's plan, not the run's, and the two
             would overwrite each other in a single slot. */
          return <ChecklistKecil key={i} items={p.items} />;
        }
        return (
          <div key={i} className="cli-sub-text">
            {p.text}
          </div>
        );
      })}
    </div>
  );
}

/** A subagent's checklist — the same three states, one step smaller. */
function ChecklistKecil({ items }: { items: CliTodo[] }) {
  return (
    <ul className="cli-sub-todo">
      {items.map((t) => (
        <li key={t.id} className={`cli-sub-todo-item is-${t.status}`}>
          <span className="cli-sub-todo-mark" aria-hidden="true">
            {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '·'}
          </span>
          {t.status === 'in_progress' ? t.activeForm : t.content}
        </li>
      ))}
    </ul>
  );
}

/*
 * A `Task` row with its subagent's work folded underneath.
 *
 * Collapsed by default, like the tool row it replaces — a subagent can produce
 * hundreds of rows, and expanding them all would bury the rest of the transcript.
 * What is NOT hidden is the evidence that it is working: the summary line.
 */
export const AgentMap = memo(function AgentMap({
  part,
  anak,
  onImage,
}: {
  part: Extract<CliPart, { type: 'tool' }>;
  anak: CliPart[];
  onImage?: (src: string) => void;
}) {
  const tr = useT();
  const { jalan, total, gagal } = useMemo(() => hitungJalan(anak), [anak]);

  /*
   * The byline under the subagent's name.
   *
   * Built from what actually happened, never from the tool's `status` alone:
   * the parent `Task` row reports "running" until the whole nested loop ends, so
   * on its own it cannot say whether the subagent is making progress. The counts
   * can — "3 steps · 1 running" is a live agent; "3 steps · 0 running" on a
   * finished row is a done one.
   */
  const ringkas = useMemo(() => {
    const bagian: string[] = [];
    if (total > 0) bagian.push(tr(total === 1 ? '{n} step' : '{n} steps').replace('{n}', String(total)));
    if (jalan > 0) bagian.push(tr('{n} running').replace('{n}', String(jalan)));
    if (gagal > 0) bagian.push(tr('{n} failed').replace('{n}', String(gagal)));
    return bagian.join(' · ');
  }, [total, jalan, gagal, tr]);

  return (
    <ToolRow
      name={part.name}
      /* The spawning call's id. This row is the one "Open transcript" jumps to,
         and it is rendered HERE rather than by the plain tool-row branch — so
         without this the target row is the only tool row in the transcript with
         no `data-call-id`, which is exactly what made the jump do nothing. */
      callId={part.callId}
      labelName={part.name}
      title={part.title}
      status={part.status}
      exitCode={part.exitCode ?? undefined}
      stat={ringkas || undefined}
      /* Open from the start: the "4 steps · 1 running" line is a promise of
         something to watch, and the agent map is read WHILE the subagent works —
         behind a click it would report progress nobody sees. */
      autoOpen
    >
      {/* The subagent's own rows, nested. `children` is the slot ToolRow
          already reserves for extra content under the body, so the map reuses
          the row's expand/collapse, caret and timing instead of rebuilding
          them — one control to learn, not two. */}
      <IsiSubagent anak={anak} onImage={onImage} />
    </ToolRow>
  );
});

export default AgentMap;
