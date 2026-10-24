import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { bagiHunk, barisDiff, terapkanHunk, type DiffRow } from '../../lib/simpleDiff';
import { useT, tf } from '../../lib/i18n';
import { ikonFile } from '../../lib/fileIcons';
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
  'grep', 'glob', 'fetch', 'websearch', 'codesearch', 'notesread', 'toolsearch',
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
  /*
   * A delegated agent gets `robot`, not `puzzle`.
   *
   * `puzzle` means "something to solve", which is not what a subagent call is —
   * it is work handed to another agent. AiIkon already made that call for
   * `run_subagent`, and this table was never brought in line, so the same act
   * wore two different glyphs depending on which panel drew it. Both spellings
   * are listed because the CLI renamed the tool: it was `Task` and is `Agent` as
   * of v2.1.290 (verified in a live session's tool list, which now offers both
   * names).
   */
  if (k === 'task' || k === 'agent' || k === 'runsubagent' || k === 'runsubagents') return 'robot';
  if (k === 'todowrite' || k === 'noteswrite' || k === 'managetodo') return 'check';
  /*
   * Zephyr's own tool catalogue, which the table above never covered.
   *
   * Everything unknown used to land on `terminal`, so the reading tools, the
   * app controls and the memory tool all wore a shell prompt — eleven different
   * jobs, one glyph. These are the families from `zephyrTools/catalog.ts`; a
   * name not listed here is genuinely unknown and keeps the shell mark.
   */
  if (k === 'readfile' || k === 'zephyrself') return 'doc';
  if (k === 'deletefile') return 'trash';
  if (k === 'movefile' || k === 'copyfile' || k === 'createdirectory') return 'folder';
  if (k === 'tunjuk' || k === 'kotak' || k === 'peta') return 'monitor';
  if (k === 'browseropen' || k === 'browsernavigate') return 'web';
  if (k === 'askuser' || k === 'ask') return 'comment';
  if (k === 'ingat' || k === 'memory' || k === 'memoryread') return 'brain';
  if (k === 'skillview' || k === 'skill') return 'bookmark';
  if (k === 'schedulecommand' || k === 'schedule') return 'clock';
  if (k === 'toolcall') return 'wrench';
  return 'terminal';
}

/** The kind class drives the icon colour (read / write / run). */
export function toolKind(name: string): 'baca' | 'tulis' | 'jalan' {
  const k = key(name);
  if (WRITE_KEYS.has(k)) return 'tulis';
  if (RUN_KEYS.has(k)) return 'jalan';
  return 'baca';
}

/**
 * The file's OWN icon, from the file-type theme.
 *
 * A tool row used to lead with a generic glyph for the ACTION (`doc-edit` for
 * every edit, `doc` for every read), so a transcript of ten edits in a
 * TypeScript project showed ten identical pencil-pages and the reader had to
 * read the path to know what kind of file moved. The reference product leads
 * with the language mark — the React atom for `.tsx`, the TS square for `.ts`,
 * the elephant for `.php` — and the action stays available in the row's kind
 * class (colour) and verb.
 *
 * Returns null when the target is not a file (a shell command, a pattern, an
 * MCP call), so the caller falls back to the action glyph.
 */
export function ikonSasaran(target: string | undefined): { id: string; svg: string | null; glyph?: string } | null {
  if (!target) return null;
  /* Only things that look like a path: a `.` in the last segment and no
     spaces, which excludes commands (`npm run dev`) and globs. */
  const base = target.split(/[\\/]/).pop() ?? '';
  if (!base || /\s/.test(base) || !base.includes('.')) return null;
  const ik = ikonFile(base);
  return { id: ik.id, svg: ik.svg, glyph: ik.glyph };
}

/** Draw a file-type icon inline. `size` keeps it in step with `AiIkon`. */
export function IkonBerkas({ ikon, size = 13 }: { ikon: { id: string; svg: string | null; glyph?: string }; size?: number }) {
  return (
    <span
      className="cli-tool-fileikon"
      data-ikon={ikon.id}
      aria-hidden="true"
      style={{ width: size, height: size }}
      {...(ikon.svg
        ? { dangerouslySetInnerHTML: { __html: ikon.svg } }
        : { children: ikon.glyph ?? '' })}
    />
  );
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
  path,
  onPickHunks,
  testidPrefix = 'cli',
}: {
  oldText?: string;
  newText?: string;
  /** Pre-computed rows, for callers that already hold a diff table. */
  rows?: DiffRow[];
  /**
   * The file this diff belongs to, shown in the head strip.
   *
   * Optional: the Source Control viewer already has the path in its own header
   * and a second copy would be noise, while the chat diff has nothing else
   * saying which file a box belongs to.
   */
  path?: string;
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
  /**
   * When present, each hunk gets a checkbox and the caller can apply a SUBSET.
   *
   * Absent for a pure diff view, which has nothing to apply to — so every
   * existing caller keeps exactly the component it had, and the checkboxes
   * appear only where a partial result is meaningful.
   *
   * Receives the rebuilt text rather than the selection, because the rebuild
   * rule (a rejected `del` keeps its line, a rejected `add` does not) lives in
   * `simpleDiff` and duplicating it in the caller is how the two would drift.
   */
  onPickHunks?: (teks: string, diterima: number) => void;
  /** Data-testid prefix, so the chat diff and the CLI diff stay distinguishable. */
  testidPrefix?: string;
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
  /* For the head strip. Counted over ALL rows, not the shown slice: the counts
     say how big the change is, and cutting them at the peek limit would report
     a 200-line change as "30 lines". */
  const adds = rows.reduce((n, r) => n + (r.kind === 'add' ? 1 : 0), 0);
  const dels = rows.reduce((n, r) => n + (r.kind === 'del' ? 1 : 0), 0);

  /*
   * Per-hunk selection.
   *
   * Only meaningful when the caller supplies a way to apply a partial result —
   * a pure diff VIEW has nothing to apply to. When `onPickHunks` is absent the
   * state is unused and no checkboxes render, so every existing caller keeps
   * exactly the component it had.
   *
   * Default is "all accepted", which is what the old single Apply button did.
   * Starting from none would make the common case (accept everything) take two
   * clicks.
   */
  const hunks = useMemo(() => bagiHunk(rows), [rows]);
  const [tolak, setTolak] = useState<ReadonlySet<number>>(new Set());
  const [wantSplit, setWantSplit] = useState<boolean | null>(
    mode === undefined ? null : mode === 'split',
  );

  /*
   * Which view — decided by the PANEL's width, not by a preference.
   *
   * The first version defaulted to unified and offered a button, which meant
   * the reader had to discover the button and click it every single time to get
   * the view that the available space already called for. The width is the
   * honest signal: a docked panel is ~440px and two text columns there wrap
   * into ribbons, while a maximised panel is ~1100px and a single column
   * wastes half of it. So the view follows the width, and the button becomes
   * an OVERRIDE for the reader who disagrees — not the way to reach it.
   *
   * `null` means "auto"; `true`/`false` is an explicit choice, which then
   * survives a resize instead of being silently overruled.
   */
  const SPLIT_MIN_PX = 720;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  /*
   * Measure the element itself rather than the viewport.
   *
   * The panel is resizable and can be docked to either side, so the window
   * width says nothing about the room this diff actually has — a 1920px window
   * with a 440px docked panel is the narrow case. ResizeObserver reports the
   * element's own box, which is the number the decision needs.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setWide(w >= SPLIT_MIN_PX);
    });
    ro.observe(el);
    setWide(el.clientWidth >= SPLIT_MIN_PX);
    return () => ro.disconnect();
  }, []);

  /* Auto until the reader overrides it. */
  const split = wantSplit ?? wide;

  /* Pairing lives in `pairForSplit` so it can be unit-checked directly; see
     its doc comment for why the pairing matters. */
  const pairs = useMemo(() => pairForSplit(shown), [shown]);

  return (
    <div
      ref={rootRef}
      className={`cli-diff${split ? ' is-split' : ''}`}
      data-testid="cli-tool-diff"
      data-mode={split ? 'split' : 'unified'}
      data-auto={wantSplit === null ? '1' : '0'}
    >
      {/*
        * The head: which file, and how much of it moved.
        *
        * A diff without a filename forces the reader to scroll back to the tool
        * row to find out what they are looking at - and on a turn that touched
        * three files, the boxes look identical. The counts use the same
        * `+n −n` badges as the collapsed tool row, so the two agree.
        */}
      {path && (
        <div className="cli-diff-head" data-testid="cli-diff-head">
          <span className="cli-diff-path" title={path}>
            {path.split(/[\\/]/).pop()}
          </span>
          <span className="cli-diff-dir">{path.split(/[\\/]/).slice(0, -1).join('/')}</span>
          <span className="cli-diff-counts">
            {adds > 0 && <span className="cli-diff-add">+{adds}</span>}
            {dels > 0 && <span className="cli-diff-del">-{dels}</span>}
          </span>
        </div>
      )}
      <div className="cli-diff-body">
        {split
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
          : shown.map((r, i) => {
              /*
               * The checkbox goes on the FIRST row of each hunk only.
               *
               * One box per row would let a reader uncheck half a change —
               * leaving `let x = 1` AND `let x = 2` in the file — which is the
               * incoherent state `bagiHunk` exists to prevent. One box per
               * hunk is the smallest unit that has a meaning.
               */
              const hunk = hunks.find((h) => h.id !== undefined && h.rows[0] === i);
              /* Which hunk this row belongs to, not just whether it STARTS one —
                 the dimming has to cover every row of a rejected change, and
                 the checkbox only sits on the first. */
              const milik = hunks.find((h) => h.rows.includes(i));
              return (
                <div
                  key={i}
                  className={`cli-diff-row is-${r.kind}`}
                  data-kind={r.kind}
                  data-hunk={hunk ? hunk.id : undefined}
                  data-hunk-first={hunk ? '1' : undefined}
                  data-rejected={milik && tolak.has(milik.id) ? '1' : undefined}
                >
                  {onPickHunks && (
                    <span className="cli-diff-pick">
                      {hunk ? (
                        <input
                          type="checkbox"
                          data-testid={`${testidPrefix}-hunk-${hunk.id}`}
                          aria-label={tf('Accept change {n}', { n: String(hunk.id + 1) })}
                          checked={!tolak.has(hunk.id)}
                          onChange={(e) =>
                            setTolak((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.delete(hunk.id);
                              else n.add(hunk.id);
                              return n;
                            })
                          }
                        />
                      ) : null}
                    </span>
                  )}
                  <span className="cli-diff-num">{r.a ?? ''}</span>
                  <span className="cli-diff-num">{r.b ?? ''}</span>
                  <span className="cli-diff-sign" aria-hidden="true">
                    {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ''}
                  </span>
                  <code className="cli-diff-text">{r.text || ' '}</code>
                </div>
              );
            })}
      </div>
      {onPickHunks && (
        <div className="cli-diff-foot cli-diff-foot-pick">
          <span className="cli-diff-pick-sum" data-testid={`${testidPrefix}-hunk-sum`}>
            {tf('{a} of {b} changes accepted', {
              a: String(hunks.length - tolak.size),
              b: String(hunks.length),
            })}
          </span>
          <button
            className="btn btn-sm"
            data-testid={`${testidPrefix}-hunk-apply`}
            disabled={hunks.length === 0}
            onClick={() => {
              const diterima = new Set(hunks.map((h) => h.id).filter((id) => !tolak.has(id)));
              onPickHunks(terapkanHunk(rows, diterima), diterima.size);
            }}
          >
            {tr('Apply selected')}
          </button>
        </div>
      )}
      <div className="cli-diff-foot">
        {long && (
          <button className="cli-diff-more" onClick={() => setExpand((v) => !v)}>
            {expand ? tr('Show less') : tf('Show {n} more lines', { n: hidden })}
          </button>
        )}
        {/*
          * The override, cycling auto -> split -> unified -> auto.
          *
          * Auto is a real state and has to be reachable again, or a reader who
          * once forced unified on a docked panel can never get the automatic
          * behaviour back after maximising — the setting would outlive the
          * reason for it. The label says which mode is in effect and, while
          * auto, marks itself as such so the reader knows why it changed on
          * its own.
          */}
        {mode === undefined && (
          <button
            className={`cli-diff-view${wantSplit === null ? ' is-auto' : ''}`}
            data-testid="cli-diff-view-toggle"
            data-auto={wantSplit === null ? '1' : '0'}
            title={
              wantSplit === null
                ? tr('Following panel width — click to force split')
                : wantSplit
                  ? tr('Split view — click to force unified')
                  : tr('Unified view — click to follow panel width')
            }
            onClick={() =>
              setWantSplit((v) => (v === null ? true : v === true ? false : null))
            }
          >
            {wantSplit === null ? tr('Auto') : split ? tr('Split') : tr('Unified')}
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
   * The call's own id, when the caller has one.
   *
   * Rendering does not need it — it is not shown anywhere. It is stamped onto
   * the row as `data-call-id` so another surface can FIND this exact row: the
   * agent map's "Open transcript" jumps to the call an agent came from, and
   * every Bash row carries the same `data-tool`, so the name cannot serve as a
   * target.
   */
  callId?: string;
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
  /**
   * Start expanded, without a diff to trigger it.
   *
   * The row opens itself when it has a diff, because the `+N -N` badge promises
   * something to see. A subagent's work is the same promise by another route:
   * the row says "4 steps · 1 running", and leaving that behind a click hides
   * the only evidence that the agent is alive. Used by the agent map; every
   * other caller leaves it false and keeps the old behaviour.
   */
  autoOpen?: boolean;
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
  callId,
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
  autoOpen,
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
  const [buka, setBuka] = useState(hasDiff || Boolean(autoOpen));
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
  /* The file's own language mark when the row targets a file; the action
     glyph otherwise. */
  const ikonTarget = ikonSasaran(title);

  return (
    <div
      className={`cli-tool${failed ? ' is-fail' : ''}${spin ? ' is-running' : ''}`}
      data-testid="cli-tool"
      data-tool={name}
      /*
       * The call id on the row, so a caller can find THIS row.
       *
       * `data-tool` names the kind and is shared by every Bash call in the
       * transcript — useless as a target when the agent map's "Open transcript"
       * needs the one row a specific agent came from. The id is stable and
       * unique per call.
       */
      data-call-id={callId ?? undefined}
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
          {ikonTarget ? (
            <IkonBerkas ikon={ikonTarget} size={13} />
          ) : (
            <AiIkon name={toolGlyph(name) as never} size={13} />
          )}
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
