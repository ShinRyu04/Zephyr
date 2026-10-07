import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { barisDiff, type DiffRow } from '../../lib/simpleDiff';
import { useT, tf } from '../../lib/i18n';
import AiIkon from './AiIkon';

/*
 * The Claude Code rendering kit, shared by BOTH transcripts in Zephyr.
 *
 * Zephyr hosts the real Claude Code CLI in one tab and has its own multi-provider
 * Chat AI in another. For a long time the two looked nothing alike while doing
 * the same job: the hosted tab painted the CLI's structured timeline (thinking,
 * tool rows, a VSCode-style edit diff), and Chat AI painted its own, older set
 * of boxes — `ai-toolrun-*` rows with INPUT/OUTPUT panels and a separate
 * `DiffViewer` card for file changes.
 *
 * The user's instruction was to take the look from the Claude Code we already
 * built and install it into Chat AI too — the second panel's work-time display
 * read as ugly next to the first, and most Zephyr users are on Chat AI rather
 * than the (expensive) CLI.
 *
 * So the pieces live here, once, and both callers import them:
 *   - `EditDiff`  — the VSCode-style split diff (numbered old|new gutters, +/-
 *                   sign column, green add / red delete, "show N more" collapse)
 *   - `ToolRow`   — the one-line tool row (caret, kind-coloured glyph, name,
 *                   target, +N/-N stat, elapsed, exit code) with a body that
 *                   shows the input, an image, a diff, or the raw output
 *   - `ReasoningRow` — the folded thinking block
 *
 * `unifiedFromHalves` converts a before/after pair into a unified-diff string,
 * so a caller holding a patch string (Chat AI's `DiffViewer` input) can still
 * reach the same renderer instead of keeping a second diff implementation.
 */

/*
 * Both spellings of every tool, in one table.
 *
 * Zephyr runs two agent loops and they do NOT name their tools the same way.
 * The hosted Claude Code CLI emits `Read` / `Edit` / `Bash` / `Task`; Zephyr's
 * own Chat AI loop emits `read_file` / `edit` / `bash_run` / `run_subagent`
 * (see `src/lib/zephyrTools/builtins.ts`). The kit was written against the CLI
 * names only, so the moment Chat AI adopted it every one of its rows fell
 * through to the default branch: one grey terminal glyph per row and a `edit`
 * row painted as a READ, not a write.
 *
 * That is the whole reason the two transcripts must share ONE table instead of
 * each testing for the names it happens to emit: a row that cannot recognise
 * its own tool cannot show the reader that a file changed.
 */

/** Normalise a tool name to a lowercase, separator-free key. */
function key(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

/** Tool keys that MUTATE a file — these get the write colour and the edit glyph. */
const WRITE_KEYS = new Set([
  // Claude Code CLI
  'write', 'edit', 'multiedit', 'notebookedit', 'filechange',
  // Zephyr Chat AI
  'writefile', 'edit', 'multiedit', 'replaceinfiles', 'createfile',
  'deletefile', 'movefile', 'copyfile', 'createdirectory',
]);

/** Tool keys that RUN a process. */
const RUN_KEYS = new Set([
  // Claude Code CLI
  'bash', 'powershell', 'commandexecution',
  // Zephyr Chat AI
  'bashrun', 'bashbackground', 'bashlogs', 'bashlist', 'bashkill',
  'runterminal', 'schedulecommand',
]);

/** Tool keys that LOOK something up. */
const FIND_KEYS = new Set([
  // Claude Code CLI
  'grep', 'glob', 'search', 'webfetch', 'websearch',
  // Zephyr Chat AI
  'grep', 'glob', 'fetch', 'websearch', 'codesearch', 'notesread',
]);

/** Tool keys that read a file or a directory listing. */
const READ_KEYS = new Set([
  // Claude Code CLI
  'read', 'notebookread', 'ls',
  // Zephyr Chat AI
  'readfile', 'listdirectory', 'listdir', 'readmanyfiles',
]);

/** Pick a glyph for a tool from its name. */
export function toolGlyph(name: string): string {
  const k = key(name);
  if (RUN_KEYS.has(k)) return 'terminal';
  if (WRITE_KEYS.has(k)) return 'doc-edit';
  if (k === 'fetch' || k === 'webfetch' || k === 'websearch') return 'globe';
  if (FIND_KEYS.has(k)) return 'search';
  if (READ_KEYS.has(k)) return 'doc';
  if (k === 'task' || k === 'agent' || k === 'runsubagent' || k === 'runsubagents') return 'puzzle';
  if (k === 'todowrite' || k === 'noteswrite' || k === 'managetodo') return 'check';
  return 'terminal';
}

/** The kind class drives the icon colour (read / write / run). */
export function toolKind(name: string): 'baca' | 'tulis' | 'jalan' {
  const k = key(name);
  if (WRITE_KEYS.has(k)) return 'tulis';
  if (RUN_KEYS.has(k)) return 'jalan';
  return 'baca';
}

/** An image tool output is a data/file URL; show it inline + zoomable. */
export function imageOutput(output: string | undefined): string | null {
  if (typeof output !== 'string') return null;
  const s = output.trim();
  return /^(data:image\/|https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$)/i.test(s) ? s : null;
}

/** Build a unified-diff string from the two halves of a file edit. */
export function unifiedFromHalves(oldText: string, newText: string): string {
  return barisDiff(oldText, newText)
    .map((r) => (r.kind === 'add' ? `+${r.text}` : r.kind === 'del' ? `-${r.text}` : ` ${r.text}`))
    .join('\n');
}

/**
 * Split a unified diff back into its before/after halves.
 *
 * Chat AI stores a tool result as a patch string, not as the two halves the CLI
 * stream carries. Rather than keep a second diff renderer for that shape, the
 * patch is folded back into halves here and handed to `EditDiff` — one diff
 * implementation, one set of styles, so both transcripts cannot drift apart.
 * Returns null when the text is not a unified diff.
 */
/**
 * Does this text carry diff hunks at all?
 *
 * It must accept BOTH shapes, because the two callers produce different ones:
 *   - a real `git diff` / CLI tool result, which opens with `diff --git` and
 *     `@@ -1,3 +1,4 @@` hunk headers, and
 *   - a bare hunk body — just ` `/`+`/`-` lines — which is exactly what
 *     `unifiedFromHalves` emits above.
 *
 * The first version of this guard only matched the headered form, so the kit's
 * own round trip (halves → unified → halves) returned null and Chat AI would
 * have dropped every edit diff it was handed as a patch string. A `+`/`-` line
 * mix with at least one context line is the honest signal for the bare form.
 */
export function looksLikeUnified(text: string): boolean {
  if (/(^|\n)(diff --git|@@ -\d+)/.test(text)) return true;
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) return false;
  /* Every line has to be a diff line — a stray paragraph of prose with one
     hyphenated word in it must not be read as an edit. */
  if (!lines.every((l) => /^[ +\-\\]/.test(l))) return false;
  return lines.some((l) => l.startsWith('+')) && lines.some((l) => l.startsWith('-'));
}

export function halvesFromUnified(text: string): { oldText: string; newText: string } | null {
  if (!looksLikeUnified(text)) return null;
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const body = text.split('\n');
  const pendingHunk: string[] = [];
  const flush = () => {
    if (!pendingHunk.length) return;
    /* Context lines close a hunk: anything held back as a possible duplicate
       '---'/'+++' header is real content once more of the hunk follows. */
    for (const l of pendingHunk) {
      oldLines.push(l);
      newLines.push(l);
    }
    pendingHunk.length = 0;
  };
  for (const line of body) {
    /* File headers carry metadata, not content: `diff --git`, index, mode, and
       the `--- a/x` / `+++ b/x` pair that precedes each hunk. */
    if (/^(diff --git|index |new file mode|deleted file mode|old mode|new mode|similarity index|rename )/.test(line)) {
      continue;
    }
    if (/^--- /.test(line)) {
      flush();
      pendingHunk.push(`--- ${line.slice(4)}`);
      continue;
    }
    if (/^\+\+\+ /.test(line)) {
      pendingHunk.push(`+++ ${line.slice(4)}`);
      continue;
    }
    if (/^@@/.test(line)) {
      flush();
      continue;
    }
    if (line.startsWith('+')) {
      flush();
      newLines.push(line.slice(1));
    } else if (line.startsWith('-')) {
      flush();
      oldLines.push(line.slice(1));
    } else if (line.startsWith('\\')) {
      /* "\ No newline at end of file" — a marker, not content. */
      continue;
    } else {
      flush();
      oldLines.push(line.startsWith(' ') ? line.slice(1) : line);
      newLines.push(line.startsWith(' ') ? line.slice(1) : line);
    }
  }
  flush();
  if (!oldLines.length && !newLines.length) return null;
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') };
}

/*
 * The VSCode-style diff for a file edit: numbered gutters (old | new), a +/-
 * sign column, green add / red delete rows, and a "show N more" collapse so a
 * big edit does not flood the thread.
 */
export const DIFF_PEEK = 24;
/**
 * Pair each deletion with the addition that replaced it, for side-by-side view.
 *
 * A unified diff is a flat list: `-old` then `+new`. Printing that straight into
 * two columns leaves the RIGHT column blank on every `-` row and the LEFT blank
 * on every `+`, so a three-line change becomes six staggered rows and the eye
 * cannot tell which line became which. Pairing a run of deletions with the run
 * of additions that follows it puts the change on ONE row, which is the whole
 * point of a side-by-side view.
 *
 * Exported because it is the part most likely to be wrong and the hardest to
 * see in a screenshot: a mispaired diff still LOOKS like a diff.
 */
export function pairForSplit(rows: DiffRow[]): { left: DiffRow | null; right: DiffRow | null }[] {
  const out: { left: DiffRow | null; right: DiffRow | null }[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.kind === 'same') {
      out.push({ left: r, right: r });
      i++;
      continue;
    }
    const dels: DiffRow[] = [];
    const adds: DiffRow[] = [];
    while (i < rows.length && rows[i].kind === 'del') dels.push(rows[i++]);
    while (i < rows.length && rows[i].kind === 'add') adds.push(rows[i++]);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      out.push({ left: dels[k] ?? null, right: adds[k] ?? null });
    }
  }
  return out;
}

export const EditDiff = memo(function EditDiff({
  oldText,
  newText,
  rows: given,
  mode,
}: {
  oldText?: string;
  newText?: string;
  /** Pre-computed rows, for callers that already hold a diff table. */
  rows?: DiffRow[];
  /**
   * `unified` (default) is one column with a sign gutter; `split` puts the
   * before and after side by side.
   *
   * Split is not always better: on a narrow panel two text columns of ~200px
   * each make a long line wrap into an unreadable ribbon, while a single
   * column still scrolls. So the caller decides, and the stylesheet flips to
   * split automatically when the container is wide enough (`@container`). The
   * prop is the explicit override for a caller that knows better.
   */
  mode?: 'unified' | 'split';
}) {
  const tr = useT();
  const computed = useMemo(
    () => (given ? given : barisDiff(oldText ?? '', newText ?? '')),
    [given, oldText, newText],
  );
  const rows = computed;
  const [expand, setExpand] = useState(false);
  const long = rows.length > DIFF_PEEK + 6;
  const shown = long && !expand ? rows.slice(0, DIFF_PEEK) : rows;
  const hidden = rows.length - shown.length;
  const [wantSplit, setWantSplit] = useState(mode === 'split');

  /* Pairing lives in `pairForSplit` so it can be unit-checked directly; see
     its doc comment for why the pairing matters. */
  const pairs = useMemo(() => pairForSplit(shown), [shown]);

  return (
    <div className={`cli-diff${wantSplit ? ' is-split' : ''}`} data-testid="cli-tool-diff" data-mode={wantSplit ? 'split' : 'unified'}>
      <div className="cli-diff-body">
        {wantSplit
          ? pairs.map((p, i) => (
              <div key={i} className="cli-diff-pair">
                {/* LEFT: the old file. A row that only exists on the right
                    (an insertion) leaves this half empty rather than shifting
                    the columns out of alignment. */}
                <div className={`cli-diff-half${p.left ? ` is-${p.left.kind}` : ' is-void'}`}>
                  <span className="cli-diff-num">{p.left?.a ?? ''}</span>
                  <span className="cli-diff-sign" aria-hidden="true">
                    {p.left?.kind === 'del' ? '-' : p.left?.kind === 'add' ? '+' : ''}
                  </span>
                  <code className="cli-diff-text">{p.left ? p.left.text || ' ' : ''}</code>
                </div>
                <div className={`cli-diff-half${p.right ? ` is-${p.right.kind}` : ' is-void'}`}>
                  <span className="cli-diff-num">{p.right?.b ?? ''}</span>
                  <span className="cli-diff-sign" aria-hidden="true">
                    {p.right?.kind === 'add' ? '+' : p.right?.kind === 'del' ? '-' : ''}
                  </span>
                  <code className="cli-diff-text">{p.right ? p.right.text || ' ' : ''}</code>
                </div>
              </div>
            ))
          : shown.map((r, i) => (
              <div key={i} className={`cli-diff-row is-${r.kind}`} data-kind={r.kind}>
                <span className="cli-diff-num">{r.a ?? ''}</span>
                <span className="cli-diff-num">{r.b ?? ''}</span>
                <span className="cli-diff-sign" aria-hidden="true">
                  {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ''}
                </span>
                <code className="cli-diff-text">{r.text || ' '}</code>
              </div>
            ))}
      </div>
      <div className="cli-diff-foot">
        {long && (
          <button className="cli-diff-more" onClick={() => setExpand((v) => !v)}>
            {expand ? tr('Show less') : tf('Show {n} more lines', { n: hidden })}
          </button>
        )}
        {/* The manual override. The container query picks a sensible default by
            width; this is for the reader who wants the other one anyway. */}
        {mode === undefined && (
          <button
            className="cli-diff-view"
            data-testid="cli-diff-view-toggle"
            title={wantSplit ? tr('Unified view') : tr('Split view')}
            onClick={() => setWantSplit((v) => !v)}
          >
            {wantSplit ? tr('Unified') : tr('Split')}
          </button>
        )}
      </div>
    </div>
  );
});

/** How many add/del rows a pair of halves produces. */
export function diffStat(oldText: string, newText: string): { adds: number; dels: number } {
  const rows = barisDiff(oldText, newText);
  let adds = 0;
  let dels = 0;
  for (const r of rows) {
    if (r.kind === 'add') adds++;
    else if (r.kind === 'del') dels++;
  }
  return { adds, dels };
}

export type ToolRowProps = {
  name: string;
  /**
   * The human word for the tool, when it differs from `name`.
   *
   * `name` is the tool's IDENTITY — the glyph and the colour are looked up from
   * it — but an identity is not always what belongs on screen. Chat AI names
   * its shell tool `bash_run` and wants the row to read "Run npm test"; the CLI
   * names the same tool `Bash` and is happy with that word. Callers that want a
   * nicer word pass it here, and the row stays scannable without the icon
   * lookup having to guess what `Run` is.
   */
  labelName?: string;
  /** The resolved target — a file path or the shell command — shown after the name. */
  title?: string;
  /** Raw tool input, shown in the body when there is no diff. */
  input?: string;
  /** Raw tool output, shown in the body when there is no diff or image. */
  output?: string;
  status?: 'running' | 'ok' | 'fail';
  exitCode?: number;
  /** The before/after halves of a file edit, when the caller has them. */
  diffOld?: string;
  diffNew?: string;
  /** A unified-diff patch, for callers that only have the patch string. */
  diffPatch?: string;
  /** Extra facts for the collapsed row, e.g. "12 lines · 1.2KB". */
  stat?: string;
  /** Elapsed time in ms; under 10ms prints nothing. */
  ms?: number;
  onImage?: (src: string) => void;
  /** Rendered under the row's body — Chat AI's copy/open-in-terminal actions. */
  children?: React.ReactNode;
};

/*
 * One tool call, as a single scannable line.
 *
 * This is the whole point of the shared kit: the CLI tab and Chat AI now draw
 * the SAME row — caret, kind-coloured glyph, tool name, the target it acted on,
 * a +N/-N stat when it edited a file, elapsed time, exit code. A file edit opens
 * expanded so its diff is visible without a click, the way the VSCode extension
 * shows it; a read or a command stays collapsed until asked.
 */
export const ToolRow = memo(function ToolRow({
  name,
  labelName,
  title,
  input,
  output,
  status = 'ok',
  exitCode,
  diffOld,
  diffNew,
  diffPatch,
  stat,
  ms,
  onImage,
  children,
}: ToolRowProps) {
  const tr = useT();
  /* The patch form is folded into halves so every caller reaches one renderer. */
  const halves = useMemo(() => {
    if (diffOld !== undefined || diffNew !== undefined) {
      return { oldText: diffOld ?? '', newText: diffNew ?? '' };
    }
    if (diffPatch) return halvesFromUnified(diffPatch);
    return null;
  }, [diffOld, diffNew, diffPatch]);

  const hasDiff = Boolean(halves && (halves.oldText || halves.newText));
  /*
   * Open when there is a diff to see — but keep watching, because the diff
   * usually arrives AFTER the first paint.
   *
   * This was `useState(hasDiff)`, and that is a trap: `useState` reads its
   * initial value exactly once. A tool row mounts the moment the call STARTS,
   * with `result` still empty, so `hasDiff` is false at mount and `buka` is
   * frozen false — the row then stays shut even when the edit's diff streams in
   * a second later. The reader saw a `+2 -1` badge on a closed row and had to
   * click to reveal the very thing the badge promised, which is exactly the
   * behaviour the CLI tab was built to avoid.
   *
   * The effect opens the row when a diff appears and never closes it again, so
   * a click that collapses the row is respected rather than fought.
   */
  const [buka, setBuka] = useState(hasDiff);
  const autoOpened = useRef(false);
  useEffect(() => {
    if (hasDiff && !autoOpened.current) {
      autoOpened.current = true;
      setBuka(true);
    }
  }, [hasDiff]);
  const spin = status === 'running';
  const failed = status === 'fail';
  const { adds, dels } = useMemo(
    () => (hasDiff && halves ? diffStat(halves.oldText, halves.newText) : { adds: 0, dels: 0 }),
    [hasDiff, halves],
  );
  const imgOut = imageOutput(output);

  return (
    <div
      className={`cli-tool${failed ? ' is-fail' : ''}${spin ? ' is-running' : ''}`}
      data-testid="cli-tool"
      data-tool={name}
      data-status={status}
    >
      <button
        className="cli-tool-head"
        data-testid="cli-tool-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="cli-tool-caret" aria-hidden="true">{buka ? '▾' : '▸'}</span>
        <span className={`cli-tool-ikon is-${toolKind(name)}`} aria-hidden="true">
          <AiIkon name={toolGlyph(name) as never} size={13} />
        </span>
        <span className="cli-tool-name" title={labelName && labelName !== name ? name : undefined}>
          {labelName || name || tr('Tool')}
        </span>
        {title && <code className="cli-tool-title" title={title}>{title}</code>}
        {hasDiff && (adds > 0 || dels > 0) && (
          <span className="cli-tool-stat" aria-hidden="true">
            {adds > 0 && <span className="cli-tool-add">+{adds}</span>}
            {dels > 0 && <span className="cli-tool-del">-{dels}</span>}
          </span>
        )}
        {/* Extra facts the caller measured — line/byte counts, not a false zero. */}
        {stat && <span className="cli-tool-facts" data-testid="cli-tool-facts">{stat}</span>}
        {typeof ms === 'number' && ms >= 10 && (
          <span className="cli-tool-ms" data-testid="cli-tool-ms">
            {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}
          </span>
        )}
        {spin && <span className="cli-tool-spin" aria-hidden="true">…</span>}
        {failed && <span className="cli-tool-fail">{tr('failed')}</span>}
        {typeof exitCode === 'number' && exitCode !== 0 && (
          <span className="cli-tool-exit">exit {exitCode}</span>
        )}
      </button>
      {buka && (
        <div className="cli-tool-body">
          {hasDiff ? (
            <EditDiff oldText={halves!.oldText} newText={halves!.newText} />
          ) : imgOut ? (
            <img
              className="cli-native-img"
              src={imgOut}
              alt=""
              loading="lazy"
              onClick={() => onImage?.(imgOut)}
              title={tr('Click to zoom')}
            />
          ) : (
            <>
              {input && <pre className="cli-tool-input"><code>{input}</code></pre>}
              {output && <pre className="cli-tool-output"><code>{output}</code></pre>}
            </>
          )}
          {children}
        </div>
      )}
    </div>
  );
});

export default ToolRow;
