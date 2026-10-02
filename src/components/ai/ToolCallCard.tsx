import { useId, useMemo, useState } from 'react';
import { namaPolos } from '../../lib/labelAksi';
import '../../styles/ai-tool-cards.css';

export type ToolCategory = 'read' | 'write' | 'search' | 'command' | 'browser' | 'task' | 'other';

/** The public, structural subset understood without importing an agent-store type. */
export interface ToolCallLike {
  name?: string;
  args?: unknown;
  input?: unknown;
  result?: unknown;
  output?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  ok?: boolean;
  /**
   * Tool masih berjalan.
   *
   * Dipakai untuk pill keadaan. Dibedakan dari `ok === undefined`, karena
   * hasil yang belum ada dan hasil yang gagal adalah dua hal berbeda - dan
   * menampilkan "Gagal" untuk tool yang masih jalan itu menakutkan tanpa sebab.
   */
  running?: boolean;
  durationMs?: number;
  exitCode?: number | null;
  cwd?: string;
  category?: ToolCategory;
}

export interface ToolCallDetails {
  name: string;
  input?: unknown;
  output?: unknown;
  stdout?: string;
  stderr?: string;
  ok?: boolean;
  /** Tool masih berjalan; lihat catatan di ToolCallLike. */
  running?: boolean;
  durationMs?: number;
  exitCode?: number | null;
  cwd?: string;
  category?: ToolCategory;
}

export interface ToolCallCardProps<T extends ToolCallLike = ToolCallLike> {
  call: T;
  /** Allows a richer/private record to be converted at the integration boundary. */
  getDetails?: (call: T) => ToolCallDetails;
  defaultOpen?: boolean;
  className?: string;
  tr: (text: string) => string;
  tf: (template: string, values: Record<string, string | number>) => string;
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  const direct = recordOf(value);
  if (direct) return direct;
  if (typeof value !== 'string') return undefined;
  try {
    return recordOf(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function categoryOf(name: string, explicit?: ToolCategory): ToolCategory {
  if (explicit) return explicit;
  if (/write|edit|patch|create|delete|move|copy/i.test(name)) return 'write';
  if (/read|open|list|glob/i.test(name)) return 'read';
  if (/search|grep|find/i.test(name)) return 'search';
  if (/shell|bash|terminal|command|exec|run/i.test(name)) return 'command';
  if (/browser|web|url|navigate|fetch/i.test(name)) return 'browser';
  if (/task|agent|todo/i.test(name)) return 'task';
  return 'other';
}

/*
 * The tool glyph, drawn white on a filled rounded-square badge.
 *
 * The reference (terax-ai's `tool.tsx`) draws each row's icon as a small solid
 * blue chip with a white glyph inside, not as a bare outline. The chip is what
 * makes a column of rows scannable: the eye catches the coloured squares first
 * and reads the row's kind from the glyph without parsing the name, and every
 * row lines up on the same left edge because the chip has a fixed size.
 *
 * The glyphs are the same shapes as before, redrawn at 10px so they sit inside
 * the 18px chip with room to breathe.
 */
function ToolIcon({ category }: { category: ToolCategory }) {
  const common = {
    viewBox: '0 0 16 16',
    width: 10,
    height: 10,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (category === 'command') return <svg {...common}><path d="M3 4.5 6 8l-3 3.5M8.5 11.5h4.5" /></svg>;
  if (category === 'search') return <svg {...common}><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></svg>;
  if (category === 'browser') return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>;
  if (category === 'task') return <svg {...common}><path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h5" /></svg>;
  if (category === 'write') return <svg {...common}><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7M8 10l.5-2.5 4-4 1.5 1.5-4 4z" /></svg>;
  if (category === 'read') return <svg {...common}><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6zM9.5 2.5V6H13" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></svg>;
}

function defaultDetails(call: ToolCallLike): ToolCallDetails {
  const output = call.output ?? call.result;
  const result = parseRecord(output);
  const stdoutValue = call.stdout ?? result?.stdout;
  const stderrValue = result?.stderr;
  const exitValue = call.exitCode ?? numberOf(result?.exitCode) ?? numberOf(result?.exit_code);
  const cwdValue = call.cwd ?? (typeof result?.cwd === 'string' ? result.cwd : undefined);
  return {
    /*
     * Nama yang dipakai kartu ini HANYA untuk dibaca: judul, aria-label, dan
     * pemilihan kategori lewat regex. Tak satu pun membutuhkan awalan
     * `mcp__tedi__`, dan menampilkannya membuat tool TEDI sendiri terbaca
     * seperti milik pihak lain. Perbandingan yang butuh nama asli terjadi di
     * lapisan dispatch, bukan di sini.
     */
    name: namaPolos(call.name),
    input: call.input ?? call.args,
    output,
    stdout: typeof stdoutValue === 'string' ? stdoutValue : undefined,
    stderr: typeof stderrValue === 'string' ? stderrValue : undefined,
    ok: call.ok,
    /*
     * `running` has to be carried through explicitly.
     *
     * This projection lists every field by hand, and `running` was missing from
     * it - so `details.running` was always `undefined`, `isJalan` was always
     * false, and no call ever showed its running state: the pill said "Selesai"
     * while the tool was still executing and the glyph never animated. The
     * store and the card both had the flag; the copy in between dropped it.
     */
    running: call.running,
    durationMs: call.durationMs,
    exitCode: exitValue,
    cwd: cwdValue,
    category: call.category,
  };
}

function formatDuration(ms: number, tf: ToolCallCardProps['tf']): string {
  if (ms < 1000) return tf('{n} ms', { n: Math.max(0, Math.round(ms)) });
  return tf('{n} s', { n: (ms / 1000).toFixed(ms < 10000 ? 1 : 0) });
}

export default function ToolCallCard<T extends ToolCallLike = ToolCallLike>({
  call,
  getDetails,
  defaultOpen = false,
  className = '',
  tr,
  tf,
}: ToolCallCardProps<T>) {
  const [open, setOpen] = useState(defaultOpen);
  /*
   * Which output stream is on screen.
   *
   * A shell call can produce both: the command's own stdout and the errors it
   * wrote to stderr, and a single pre-block mashed them together so a warning
   * looked like part of the result. The reference (Hermes' tool card) gives the
   * two streams their own tabs with a line count on each, which is also how a
   * reader finds out that stderr exists at all - an empty stderr tab is
   * information, a silently absent one is not.
   */
  const [tabAliran, setTabAliran] = useState<'stdout' | 'stderr'>('stdout');
  const bodyId = useId();
  const details = useMemo(() => getDetails ? getDetails(call) : defaultDetails(call), [call, getDetails]);
  const input = textOf(details.input);
  const output = textOf(details.output);
  const stdout = details.stdout ?? output;
  const stderr = details.stderr ?? '';
  const bytes = new TextEncoder().encode(stdout).length;
  const lines = stdout ? stdout.replace(/\r?\n$/, '').split(/\r?\n/).length : 0;
  const failed = details.ok === false || (details.exitCode != null && details.exitCode !== 0);
  /* Gagal lebih dulu: tool yang sudah gagal tidak mungkin masih jalan, dan
     kalau kedua tanda itu bertentangan, yang lebih dipercaya adalah hasilnya. */
  const isJalan = !failed && details.running === true;
  const category = categoryOf(details.name, details.category);

  return (
    <article
      className={`w4-tool-card${failed ? ' is-failed' : ''}${isJalan ? ' is-running' : ''}${className ? ` ${className}` : ''}`}
      data-state={failed ? 'failed' : isJalan ? 'running' : 'done'}
      data-category={category}
    >
      <button
        type="button"
        className="w4-tool-head"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={tf(open ? 'Collapse {name} details' : 'Expand {name} details', { name: details.name })}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="w4-tool-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="w4-tool-icon"><ToolIcon category={category} /></span>
        <span className="w4-tool-name">{details.name}</span>
        {/*
          * Pill keadaan: jalan, selesai, atau gagal.
          *
          * `isJalan` dibaca dari hasil tool, bukan dari waktu. Tanpa itu, kartu
          * yang sudah selesai tapi belum sempat diperbarui akan terus terlihat
          * berjalan - dan model yang menunggu tool-nya tampak seperti belum
          * kembali padahal sudah.
          */}
        <span className={`w4-tool-pill is-${failed ? 'gagal' : isJalan ? 'jalan' : 'beres'}`}>
          {failed ? tr('Gagal') : isJalan ? tr('Berjalan') : tr('Selesai')}
        </span>
        {details.durationMs != null && <span className="w4-tool-duration">{formatDuration(details.durationMs, tf)}</span>}
      </button>
      {open && (
        <div className="w4-tool-body" id={bodyId}>
          {/*
            * INPUT, in capitals - the reference's section label.
            *
            * The label is small, spaced and dim on purpose: it names the block
            * without competing with the value under it, and the capitals are
            * what make it read as a field name rather than as a sentence. The
            * old sentence-case "Input" sat at the same weight as its content
            * and the two blurred together.
            */}
          {input && (
            <section className="w4-tool-io">
              <div className="w4-tool-label">{tr('INPUT')}</div>
              <pre className="w4-tool-pre">{input}</pre>
            </section>
          )}
          {/*
            * OUTPUT, with the streams split.
            *
            * A command that writes to both streams used to render one merged
            * block, so a stderr warning read as part of the command's result.
            * The two tabs carry their own line counts (the reference shows
            * `stdout 32 / stderr` badges for exactly this reason), which is how
            * the reader learns stderr has something in it - or that it is
            * empty, which is also worth knowing.
            */}
          {output && (
            <section className="w4-tool-io">
              <div className="w4-tool-iobar">
                <span className="w4-tool-label">{tr('OUTPUT')}</span>
                {stderr && (
                  <span className="w4-tool-streams" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabAliran === 'stdout'}
                      className={`w4-tool-stream${tabAliran === 'stdout' ? ' is-aktif' : ''}`}
                      onClick={() => setTabAliran('stdout')}
                    >
                      stdout <b>{lines}</b>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tabAliran === 'stderr'}
                      className={`w4-tool-stream${tabAliran === 'stderr' ? ' is-aktif' : ''}`}
                      onClick={() => setTabAliran('stderr')}
                    >
                      stderr <b>{stderr.split(/\r?\n/).length}</b>
                    </button>
                  </span>
                )}
              </div>
              <pre className={`w4-tool-pre${failed ? ' is-failed' : undefined}`}>
                {tabAliran === 'stderr' && stderr ? stderr : output}
              </pre>
            </section>
          )}
          {/*
            * The meta line, then the row of actions under a hairline - the
            * shape the reference closes every expanded card with (copy, copy
            * input, open in terminal).
            */}
          <dl className="w4-tool-meta">
            {details.exitCode != null && <><dt>{tr('Exit status')}</dt><dd>{details.exitCode}</dd></>}
            {stdout && <><dt>{tr('Standard output')}</dt><dd>{tf('{lines} lines · {bytes} bytes', { lines, bytes })}</dd></>}
            {details.cwd && <><dt>{tr('Working directory')}</dt><dd><code>{details.cwd}</code></dd></>}
          </dl>
          <div className="w4-tool-acts">
            <button
              type="button"
              className="w4-tool-act"
              onClick={() => void navigator.clipboard?.writeText(output || '')}
              title={tr('Copy output')}
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3H4.6a1 1 0 0 0-1 1v8.4a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H10" />
                <rect x="6" y="1.7" width="4" height="2.6" rx="0.9" />
              </svg>
              {tr('Copy')}
            </button>
            {input && (
              <button
                type="button"
                className="w4-tool-act"
                onClick={() => void navigator.clipboard?.writeText(input)}
                title={tr('Copy input')}
              >
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3H4.6a1 1 0 0 0-1 1v8.4a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H10" />
                  <rect x="6" y="1.7" width="4" height="2.6" rx="0.9" />
                </svg>
                {tr('Copy input')}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
