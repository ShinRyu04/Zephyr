import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CliPart, CliTask } from '../../lib/aiCliStore';
import AiIkon from './AiIkon';
import { IsiSubagent, kelompokkanSubagent } from './AgentMap';
import { useT, useTf } from '../../lib/i18n';
import { useDragPopup } from '../../lib/useDragPopup';

/*
 * The agent map: one card per subagent the CLI reported, and the lines between
 * them.
 *
 * WHY a popup rather than another row in the transcript. A run can spawn three
 * agents that each produce dozens of rows, and the transcript is already the
 * place those rows live — repeating them here would double the scroll for no
 * new information. What the transcript CANNOT show is the shape of the run:
 * three cards side by side, each with its own duration and token count, answer
 * "what is working, and is it close to done" in one glance. That is the whole
 * job of this panel, which is why it is opened on demand from the agents chip
 * and never takes space in the conversation.
 *
 * The connector lines are drawn as CSS borders rather than an SVG. Each card
 * sits in a column of its own inside a grid, and the elbow between two cards is
 * a border on a spacer element — no measurement, no reflow on resize, and it
 * degrades to a plain stack when the panel is too narrow for columns (see the
 * container query in ai.css). An SVG would have to be re-laid-out whenever a
 * card grew, which is every second while a live agent streams.
 */

/** Format a duration the way the reference does: "16m 2s", "29m 55s", "8s". */
function durasi(
  ms: number,
  tf: (k: string, v: Record<string, string | number>) => string,
): string {
  if (!ms || ms < 0) return '';
  const detik = Math.round(ms / 1000);
  if (detik < 60) return tf('{s}s', { s: detik });
  const m = Math.floor(detik / 60);
  const s = detik % 60;
  /* Seconds are dropped past an hour: "1h 4m" is what a reader wants, and
     "1h 4m 12s" is a number nobody acts on. */
  if (m >= 60) return tf('{h}h {m}m', { h: Math.floor(m / 60), m: m % 60 });
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** "90.0k tokens" — one decimal, because whole thousands hide a 9k spread. */
function token(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/*
 * One card.
 *
 * The dot carries the state, the way it does on the chip: live agents pulse in
 * the accent, finished ones go flat. A finished card is still shown — the run's
 * shape is what the reader came for, and hiding completed agents would leave a
 * map that empties itself exactly when it becomes worth reading.
 */
const KartuAgen = memo(function KartuAgen({ t, onOpen }: { t: CliTask; onOpen: () => void }) {
  const tr = useT();
  const tf = useTf();
  const jalan = t.status === 'running';
  const gagal = t.status === 'failed' || t.status === 'cancelled';
  const umur = durasi(t.durationMs, tf);
  const bagian = [umur, t.tokens > 0 ? tf('{n} tokens', { n: token(t.tokens) }) : ''].filter(Boolean);

  return (
    <button
      type="button"
      className={`cli-agent-card${jalan ? ' is-live' : ''}${gagal ? ' is-fail' : ''}`}
      data-testid="cli-agent-card"
      data-task={t.id}
      data-status={t.status}
      onClick={onOpen}
    >
      <div className="cli-agent-card-head">
        <span className={`cli-agent-dot${jalan ? ' is-live' : ''}`} aria-hidden="true" />
        <span className="cli-agent-name" title={t.description}>
          {t.description || t.subagentType || tr('Agent')}
        </span>
      </div>
      <div className="cli-agent-meta">
        {/* The role, then what it is doing now, then the numbers — the order a
            reader asks them in: who, doing what, how much. */}
        {t.subagentType && <span className="cli-agent-role">{t.subagentType}</span>}
        {jalan && t.lastTool && <span className="cli-agent-tool">{t.lastTool}</span>}
        {bagian.length > 0 && <span className="cli-agent-facts">{bagian.join(' · ')}</span>}
      </div>
    </button>
  );
});

/*
 * The live elapsed time.
 *
 * A card whose duration only updated when the CLI sent a `task_progress` line
 * would sit frozen between them — on a slow agent that is tens of seconds of a
 * number that is visibly wrong. Ticking locally against the last reported
 * duration keeps it moving, and the CLI's next line corrects any drift.
 */
function useDetik(jalan: boolean): number {
  const [, paksa] = useState(0);
  useEffect(() => {
    if (!jalan) return;
    const t = window.setInterval(() => paksa((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [jalan]);
  return Date.now();
}

/*
 * One agent, opened.
 *
 * The map answers "what ran, and did it finish"; this answers "what was it
 * ASKED, and what did it do" — which is the question that follows immediately
 * when an agent comes back with something unexpected or wrong. The prompt is
 * the important half: a card saying "Explore · 29m · 93k tokens" tells you an
 * agent worked hard and nothing about whether it was working on the right
 * thing.
 *
 * Replaces the map in place (a back arrow, not a modal on a modal) so the
 * reader keeps the context of the tree they came from.
 */
const DetailAgen = memo(function DetailAgen({
  t,
  rows,
  onBack,
  onJump,
}: {
  t: CliTask;
  /** The agent's own transcript rows, already grouped by `parentId`. */
  rows: CliPart[];
  onBack: () => void;
  /** Swap the dialog body for this agent's transcript. */
  onJump: () => void;
}) {
  const tr = useT();
  const tf = useTf();
  const [bukaPrompt, setBukaPrompt] = useState(false);
  const [bukaAlat, setBukaAlat] = useState(false);

  const jalan = t.status === 'running';
  const alat = rows.filter((p) => p.type === 'tool');
  const gagal = alat.filter((p) => p.type === 'tool' && p.status === 'fail').length;
  const umur = durasi(t.durationMs, tf);

  /*
   * The subtitle reads like a sentence because it IS one: "Finished · Plan ·
   * mr-vip · background" is four facts about one run, and stacked as labels
   * they would read as four unrelated fields.
   */
  const fakta: string[] = [
    jalan ? tr('Running') : t.status === 'completed' ? tr('Finished') : tr('Stopped'),
  ];
  if (t.subagentType) fakta.push(t.subagentType);
  if (t.spawnDepth && t.spawnDepth > 1) fakta.push(tf('depth {n}', { n: t.spawnDepth }));
  if (t.background) fakta.push(tr('background'));

  return (
    <div className="cli-agent-detail" data-testid="cli-agent-detail">
      <button className="cli-agent-back" data-testid="cli-agent-back" onClick={onBack}>
        <AiIkon name="arrow-left" size={14} />
        <span className="cli-agent-detail-title">{t.description || t.subagentType || tr('Agent')}</span>
      </button>

      <p className="cli-agent-detail-facts">{fakta.join(' · ')}</p>
      {/* Where it came from, said plainly. A reader who did not know depth
          existed should not have to infer it from a number. */}
      {t.spawnDepth === 1 && <p className="cli-agent-detail-from">{tr('Spawned by the main agent')}</p>}
      {t.spawnDepth && t.spawnDepth > 1 && (
        <p className="cli-agent-detail-from">{tf('Spawned by a subagent at depth {n}', { n: t.spawnDepth - 1 })}</p>
      )}

      <p className="cli-agent-detail-stats">
        {[umur, t.tokens > 0 ? tf('{n} tokens', { n: token(t.tokens) }) : ''].filter(Boolean).join(' · ')}
      </p>

      {t.summary && <p className="cli-agent-detail-summary">{t.summary}</p>}

      {t.prompt && (
        <div className="cli-agent-fold">
          <button
            className="cli-agent-fold-head"
            data-testid="cli-agent-prompt-toggle"
            aria-expanded={bukaPrompt}
            onClick={() => setBukaPrompt((v) => !v)}
          >
            <span className="cli-agent-fold-caret" aria-hidden="true">{bukaPrompt ? '▾' : '▸'}</span>
            {tr('Prompt')}
          </button>
          {bukaPrompt && <pre className="cli-agent-prompt">{t.prompt}</pre>}
        </div>
      )}

      {/*
        * Tool calls are COUNTED here but not listed.
        *
        * The rows themselves are already in the transcript, with their output
        * and diffs — repeating them in a dialog means two renderers for one
        * thing, and the dialog's is the worse one. The count is the part the
        * transcript cannot show at a glance, and "Open transcript" is the way
        * to the rest.
        */}
      <div className="cli-agent-fold">
        <button
          className="cli-agent-fold-head"
          data-testid="cli-agent-tools-toggle"
          aria-expanded={bukaAlat}
          onClick={() => setBukaAlat((v) => !v)}
        >
          <span className="cli-agent-fold-caret" aria-hidden="true">{bukaAlat ? '▾' : '▸'}</span>
          {tf('Tool calls ({n})', { n: alat.length })}
        </button>
        {bukaAlat &&
          (alat.length === 0 ? (
            <p className="cli-agent-note">{tr('This agent called no tools.')}</p>
          ) : (
            <ul className="cli-agent-tool-list">
              {alat.map((p) =>
                p.type === 'tool' ? (
                  <li key={p.callId} className={`cli-agent-tool-item${p.status === 'fail' ? ' is-fail' : ''}`}>
                    <span className={`cli-agent-tool-dot is-${p.status}`} aria-hidden="true" />
                    <span className="cli-agent-tool-nama">{p.name}</span>
                    {p.title && <span className="cli-agent-tool-target">{p.title}</span>}
                  </li>
                ) : null,
              )}
            </ul>
          ))}
        {gagal > 0 && <p className="cli-agent-note">{tf('{n} of them failed.', { n: gagal })}</p>}
      </div>

      {t.toolUseId && (
        <button
          className="cli-agent-open-transcript"
          data-testid="cli-agent-open-transcript"
          onClick={onJump}
        >
          {tr('Open transcript')}
        </button>
      )}
    </div>
  );
});

/*
 * An agent's own transcript, inside the dialog.
 *
 * The third level: map -> detail -> this. It exists because "what did it
 * actually do" is not answerable from the detail view — the tool-call count
 * tells you ten calls happened and nothing about which files were read. The
 * reader should not have to close the dialog and hunt for the right moment in
 * the MAIN transcript either: this agent's rows are a bounded, self-contained
 * sequence, and the dialog that opened with them is the right place for them.
 *
 * Rendered with `IsiSubagent` — the very component the tree's rows use — so the
 * rows look identical wherever they are seen. A second renderer would drift.
 */
const TranscriptAgen = memo(function TranscriptAgen({
  t,
  rows,
  onBack,
}: {
  t: CliTask;
  rows: CliPart[];
  onBack: () => void;
}) {
  const tr = useT();
  const tf = useTf();

  return (
    <div className="cli-agent-transcript" data-testid="cli-agent-transcript">
      <button className="cli-agent-back" data-testid="cli-agent-transcript-back" onClick={onBack}>
        <AiIkon name="arrow-left" size={14} />
        <span className="cli-agent-detail-title">{t.description || t.subagentType || tr('Agent')}</span>
      </button>

      <p className="cli-agent-detail-facts">
        {[
          t.status === 'running' ? tr('Running') : t.status === 'completed' ? tr('Finished') : tr('Stopped'),
          t.subagentType,
          t.background ? tr('background') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="cli-agent-detail-stats">
        {[durasi(t.durationMs, tf), t.tokens > 0 ? tf('{n} tokens', { n: token(t.tokens) }) : '']
          .filter(Boolean)
          .join(' · ')}
      </p>

      {/* The instruction, as the agent received it: the one "user" turn of this
          transcript, drawn as a quoted block rather than a chat bubble — it is
          not something the reader typed. */}
      {t.prompt && (
        <div className="cli-agent-transcript-prompt" data-testid="cli-agent-transcript-prompt">
          {t.prompt}
        </div>
      )}

      {/*
        * The rows. When there are none the transcript is still worth showing:
        * an agent that returned its answer without touching a tool is a real
        * outcome, and a blank body would read as a bug.
        */}
      {rows.length > 0 ? (
        <IsiSubagent anak={rows} />
      ) : (
        <p className="cli-agent-note">{tr('This agent called no tools.')}</p>
      )}
    </div>
  );
});

export default function AgentMapPanel({
  tasks,
  messages,
  title,
  modelLabel,
  contextTokens,
  onClose,
}: {
  tasks: CliTask[];
  /** The conversation's messages, for the rows a subagent produced. */
  messages: readonly { parts?: CliPart[] }[];
  /** The conversation's own name — the trunk of the tree. */
  title: string;
  /** The model that spawned these agents, as the composer chip names it. */
  modelLabel: string;
  /** Tokens the session is holding, for the trunk's second line. */
  contextTokens: number;
  onClose: () => void;
}) {
  const tr = useT();
  const tf = useTf();
  const kotak = useRef<HTMLDivElement | null>(null);
  /** The agent whose detail view is open, by task id. */
  const [dibuka, setDibuka] = useState<string | null>(null);
  const adaJalan = tasks.some((t) => t.status === 'running');
  useDetik(adaJalan);

  /*
   * Escape closes, and the panel takes focus on open.
   *
   * Without the focus move a reader who opened this from the keyboard has to
   * Tab through the whole transcript to reach the close button, and without
   * Escape the only way out is a mouse — both were exactly the complaints the
   * other popovers in this app were fixed for.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const el = kotak.current;
    el?.focus();
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * Live work first, then newest-first among the finished.
   *
   * The card a reader wants is almost always the one still moving, and on a run
   * that spawned eight agents the live one can be anywhere in the list. Sorting
   * here rather than in the store keeps the store's order as the CLI reported
   * it — which is the order the transcript's rows are in, so the two agree.
   */
  const urut = useMemo(() => {
    const bobot = (t: CliTask) => (t.status === 'running' ? 0 : 1);
    return tasks.slice().sort((a, b) => bobot(a) - bobot(b) || b.durationMs - a.durationMs);
  }, [tasks]);

  /*
   * Every subagent's transcript rows, grouped once.
   *
   * Built here rather than inside the detail view so opening an agent does not
   * rescan the whole conversation on each render — and so the map and the
   * detail agree about which rows belong to whom, since both read this.
   */
  const barisPerAgen = useMemo(() => {
    const semua: CliPart[] = [];
    for (const m of messages) {
      for (const p of m.parts ?? []) {
        if (p.parentId) semua.push(p);
      }
    }
    return kelompokkanSubagent(semua);
  }, [messages]);

  /** The rows of one agent, looked up by the call id its CLI cards carry. */
  const barisSub = (t: CliTask): CliPart[] =>
    t.toolUseId ? barisPerAgen.get(t.toolUseId) ?? [] : [];

  /** The agent whose detail is open, resolved against the live task list so a
      running agent's numbers keep updating while its detail view is on screen. */
  const terbuka = dibuka ? tasks.find((t) => t.id === dibuka) ?? null : null;

  /*
   * Which of the dialog's three bodies is mounted: the map, one agent's
   * detail, or that agent's transcript. One state drives all three so the
   * dialog never shows two of them at once — and going back is always a single
   * assignment rather than a path to reconstruct.
   */
  const [tampilan, setTampilan] = useState<'peta' | 'detail' | 'transkrip'>('peta');
  const { popupRef, onPointerDown } = useDragPopup();

  return (
    <div
      className="cli-agent-map-backdrop"
      data-testid="cli-agent-map"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={(el) => { kotak.current = el; popupRef.current = el; }}
        className="cli-agent-map"
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={tr('Agent map')}
        /* The backdrop closes on click; the panel must not close itself when
           the reader clicks inside it — which is every click that is not a
           dismissal. */
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cli-agent-map-head" data-drag-handle onPointerDown={onPointerDown} style={{ cursor: 'grab' }}>
          <div>
            <h3 className="cli-agent-map-title">{tr('Agent map')}</h3>
            <p className="cli-agent-map-sub">
              {tasks.length === 0
                ? tr('No agent has run in this conversation.')
                : `${tf('{n} agents', { n: tasks.length })} · ${tr('click an agent for details')}`}
            </p>
          </div>
          <button
            className="cli-agent-map-x"
            data-testid="cli-agent-map-close"
            onClick={onClose}
            title={tr('Close')}
            aria-label={tr('Close')}
          >
            <AiIkon name="x" size={14} />
          </button>
        </div>

        {terbuka && tampilan === 'transkrip' ? (
          <TranscriptAgen
            t={terbuka}
            rows={barisSub(terbuka)}
            onBack={() => setTampilan('detail')}
          />
        ) : terbuka ? (
          <DetailAgen
            t={terbuka}
            rows={barisSub(terbuka)}
            onBack={() => { setDibuka(null); setTampilan('peta'); }}
            onJump={() => setTampilan('transkrip')}
          />
        ) : tasks.length === 0 ? null : (
          /*
           * A tree, not a row: the run sits on the left and the agents it
           * spawned stack to its right, joined by elbows.
           *
           * The shape is the information. A single row of cards says "these
           * things happened"; a trunk with branches says "this ONE run spawned
           * these", which is the only reason a map exists rather than a list.
           * The reference draws it this way for the same reason, and the
           * vertical stacking is what makes the count readable at a glance —
           * three branches off one trunk, not three siblings in a queue.
           */
          <div className="cli-agent-tree">
            {/* The run itself. Its facts are the model and how much context it
                is holding, not a duration — it is still going, and a running
                total on the root would be the whole session's clock. */}
            <div className="cli-agent-root" data-testid="cli-agent-root">
              <span className="cli-agent-dot is-live" aria-hidden="true" />
              <div className="cli-agent-root-text">
                <span className="cli-agent-name">{title}</span>
                <span className="cli-agent-meta">
                  {modelLabel}
                  {contextTokens > 0 && (
                    <> · {tf('{n} tokens in context', { n: token(contextTokens) })}</>
                  )}
                </span>
              </div>
            </div>
            <span className="cli-agent-trunk-arm" aria-hidden="true" />
            <div className="cli-agent-kids">
              {urut.map((t) => (
                <div key={t.id} className="cli-agent-kid">
                  <KartuAgen t={t} onOpen={() => { setDibuka(t.id); setTampilan('detail'); }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
