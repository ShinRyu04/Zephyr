import { memo, useEffect, useMemo, useState } from 'react';
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

/*
 * The verbs Claude Code uses while the model thinks.
 *
 * The real CLI does not print "Thinking" — it picks one whimsical `-ing` verb
 * per turn and holds it, which is what stops a long wait from reading as a
 * frozen label. The list is the reader's own; it is left in English in every
 * locale on purpose, because these are the words the Claude Code app itself
 * shows and a translated "Berpikir" would no longer be the thing being copied.
 */
const KATA_KERJA = [
  'Pondering',
  'Percolating',
  'Booping',
  'Flibbertigibbeting',
  'Ruminating',
  'Philosophizing',
  'Calibrating',
  'Synthesizing',
  'Noodling',
  'Conjuring',
] as const;

/** How long one verb stays on screen before the next fades in. */
const JEDA_KATA_MS = 2600;

/*
 * The "✻ Pondering…" line, while a run has nothing to show yet.
 *
 * The real desktop app opens every assistant turn with this: an animated
 * sparkle and a shimmering label, from the moment you press Enter until the
 * first token lands (and again after a tool finishes, while the model decides
 * what to do next). Without it the tab sits on an empty bubble for the CLI's
 * multi-second startup — silence that reads as "hung".
 *
 * The label ROTATES through `KATA_KERJA` rather than saying "Thinking". That is
 * the single most recognizable thing about the real thing: a fixed word stops
 * carrying information after the first glance, while a word that changes tells
 * the reader the process is still alive without needing a spinner.
 *
 * It must NOT appear once a thinking block exists: ReasoningBlock already
 * shows a live "Thinking" header there, and two indicators side by side read
 * as a duplicate. That is why the condition excludes `thinking` as the last
 * part — see the call site.
 *
 * EXPORTED because Chat AI shows the same wait and had a worse answer for it:
 * a static "Thinking about the next step" with three blinking dots. Sharing
 * one component is what keeps the two transcripts agreeing on what waiting
 * looks like — the colour is the only thing that differs, and it comes from
 * `--think-accent` in CSS rather than from a prop, so neither caller has to
 * know the other's palette.
 */
export function ThinkingLine({ label }: { label?: string }) {
  const tr = useT();
  const [idx, setIdx] = useState(0);

  /*
   * Rotate only while this line is MOUNTED, which is exactly the window it is
   * visible in — the parent renders it only while the run has nothing to show.
   * A timer that ran for the lifetime of the session would keep waking the
   * component up to change text nobody is looking at.
   *
   * The first verb is shown immediately and the first change waits a full
   * interval, so a short wait shows one stable word instead of flickering.
   */
  useEffect(() => {
    if (label) return; // An explicit label is a fixed message; do not rotate it.
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % KATA_KERJA.length);
    }, JEDA_KATA_MS);
    return () => window.clearInterval(t);
  }, [label]);

  const kata = label ?? KATA_KERJA[idx];

  return (
    <div className="cli-think-line" data-testid="cli-thinking" role="status" aria-live="polite">
      <span className="cli-think-star" aria-hidden="true">✻</span>
      {/*
        * `key` on the word is what makes the fade work: a changed key remounts
        * the span, and a CSS animation on mount replays for each new verb. The
        * alternative — toggling a class — needs a timer to remove it and can
        * desync from the interval that drives the text.
        */}
      <span key={kata} className="cli-think-text" data-testid="cli-think-verb">
        {label ? tr(label) : kata}
      </span>
    </div>
  );
}

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
          /* Nothing to show yet: this is the waiting state, and the shimmer
             line is what the real app shows here — the bare "…" dots read as
             a stall. */
          <ThinkingLine />
        ) : (
          ''
        )}
        {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      </div>
    );
  }

  /*
   * What, if anything, trails the last part while the run is live.
   *
   * Three states, mutually exclusive:
   *   tool/todo/error last -> the model is deciding what to do next ->
   *                           the shimmer line (same as the empty state);
   *   thinking last        -> ReasoningBlock's own live header already says
   *                           "Thinking" — a second indicator would read as a
   *                           duplicate;
   *   text last            -> tokens are landing; the trailing "…" says so.
   */
  const ujung = parts[parts.length - 1];
  const putuskan =
    streaming && (ujung.type === 'tool' || ujung.type === 'todo' || ujung.type === 'error');

  return (
    <div className="cli-timeline" data-timeline data-testid="cli-timeline">
      {parts.map((p, i) => {
        if (p.type === 'thinking') {
          return (
            <ReasoningBlock
              key={i}
              teks={p.text}
              ms={p.ms}
              berjalan={streaming && i === parts.length - 1}
            />
          );
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
      {putuskan ? (
        <ThinkingLine />
      ) : (
        streaming && ujung.type === 'text' && <span className="ai-dots" aria-hidden="true">…</span>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

const CliTimeline = memo(CliTimelineInner);
export default CliTimeline;
