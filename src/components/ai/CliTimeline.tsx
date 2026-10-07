import { memo, useMemo, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CliMsg, CliTodo } from '../../lib/aiCliStore';
import ReasoningBlock from './ReasoningBlock';
import Lightbox from './Lightbox';
import { ToolRow, unifiedFromHalves } from './claudeCodeUi';
import { useT } from '../../lib/i18n';

/*
 * The structured timeline of one hosted-CLI assistant message.
 *
 * The real CLI (Claude Code via `--output-format stream-json`) does not just
 * emit answer text: it interleaves THINKING, TOOL CALLS (Bash / Read / Edit /
 * …) with their input, output and exit code, and FILE DIFFS. The backend relays
 * every one of those as a structured event and `aiCliStore` collects them, in
 * arrival order, into `msg.parts`. This component paints that timeline exactly
 * as it happened — a thinking block, a tool row you can expand, a diff, the
 * narration — instead of the old wall of plain text.
 *
 * A message with no `parts` (restored from an older version, or a plain-text
 * CLI like Codex today) falls back to rendering `content` as Markdown, so
 * nothing regresses.
 */

const MD_PLUGINS = [remarkGfm];
const MdPre: NonNullable<Components['pre']> = ({ children }) => <>{children}</>;

/* Build the Markdown component map, making any image clickable so it opens in
   the zoomable Lightbox — same gesture the real Claude Code desktop app gives
   screenshots and diagrams in an answer. */
function mdComponents(onImage: (src: string) => void): Components {
  return {
    pre: MdPre,
    img: ({ src, alt }) =>
      src ? (
        <img
          className="cli-native-img"
          src={String(src)}
          alt={alt ?? ''}
          loading="lazy"
          onClick={() => onImage(String(src))}
          title={alt || 'Click to zoom'}
        />
      ) : null,
  };
}

/*
 * The agent's plan, as a checklist.
 *
 * This is the one part of the transcript that is read BEFORE the work, not
 * after: it answers "what is it about to do" while the tools are still running.
 * So it is always expanded — collapsing the plan behind a click would defeat
 * the only reason it exists — and it marks the single step in progress with the
 * accent, so a glance finds the current one in a list of twenty.
 *
 * `activeForm` replaces `content` for the in-progress row on purpose: "Run the
 * tests" is a thing to do, "Running tests" is a thing happening. The tense is
 * the signal that the step started, and it costs nothing to show.
 */
const TodoChecklist = memo(function TodoChecklist({ items }: { items: CliTodo[] }) {
  const tr = useT();
  /* `deleted` is a removal instruction from TaskUpdate, not a state to show. */
  const shown = items.filter((t) => t.status !== 'deleted' && (t.content || t.activeForm));
  if (shown.length === 0) return null;
  const done = shown.filter((t) => t.status === 'completed').length;

  return (
    <div className="cli-todo" data-testid="cli-todo">
      <div className="cli-todo-head">
        <span className="cli-todo-title">{tr('Plan')}</span>
        <span className="cli-todo-count">{done}/{shown.length}</span>
      </div>
      <ul className="cli-todo-list">
        {shown.map((t, i) => {
          const jalan = t.status === 'in_progress';
          const beres = t.status === 'completed';
          const teks = jalan && t.activeForm ? t.activeForm : t.content;
          return (
            <li
              key={t.id || i}
              className={`cli-todo-item${beres ? ' is-done' : ''}${jalan ? ' is-now' : ''}`}
              data-status={t.status}
            >
              <span className="cli-todo-mark" aria-hidden="true">
                {beres ? '✓' : jalan ? '▸' : '○'}
              </span>
              <span className="cli-todo-text">{teks}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

/* Keep the unified-diff helper referenced for callers that want a plain string. */
export { unifiedFromHalves };

function CliTimelineInner({ msg, streaming }: { msg: CliMsg; streaming: boolean }) {
  const parts = msg.parts;
  /* One zoomable image at a time, opened from any image in the answer. */
  const [zoom, setZoom] = useState<string | null>(null);
  const MD = useMemo(() => mdComponents(setZoom), []);

  /* Back-compat: no structured timeline → render the plain answer. */
  if (!parts || parts.length === 0) {
    return (
      <div className="cli-native-text">
        {msg.content ? (
          <Markdown remarkPlugins={MD_PLUGINS} components={MD}>{msg.content}</Markdown>
        ) : streaming ? (
          <span className="ai-dots">…</span>
        ) : (
          ''
        )}
        {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      </div>
    );
  }

  return (
    <div className="cli-timeline" data-timeline data-testid="cli-timeline">
      {parts.map((p, i) => {
        if (p.type === 'thinking') {
          return <ReasoningBlock key={i} teks={p.text} berjalan={streaming && i === parts.length - 1} />;
        }
        if (p.type === 'tool') {
          return (
            <ToolRow
              key={p.callId || i}
              name={p.name}
              title={p.title}
              input={p.input}
              output={p.output}
              status={p.status}
              exitCode={p.exitCode ?? undefined}
              diffOld={p.diffOld}
              diffNew={p.diffNew}
              onImage={setZoom}
            />
          );
        }
        if (p.type === 'error') {
          return (
            <div key={i} className="cli-timeline-error" data-testid="cli-timeline-error" role="alert">
              {p.text}
            </div>
          );
        }
        if (p.type === 'todo') {
          return <TodoChecklist key={i} items={p.items} />;
        }
        /* text */
        return (
          <div key={i} className="cli-native-text">
            <Markdown remarkPlugins={MD_PLUGINS} components={MD}>{p.text}</Markdown>
          </div>
        );
      })}
      {streaming && <span className="ai-dots" aria-hidden="true">…</span>}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

const CliTimeline = memo(CliTimelineInner);
export default CliTimeline;
