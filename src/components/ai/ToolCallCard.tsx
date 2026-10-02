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

function ToolIcon({ category }: { category: ToolCategory }) {
  const common = {
    viewBox: '0 0 16 16',
    width: 15,
    height: 15,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (category === 'command') return <svg {...common}><path d="M2.5 3.5h11v9h-11zM4.5 6l2 2-2 2M8 10h3" /></svg>;
  if (category === 'search') return <svg {...common}><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></svg>;
  if (category === 'browser') return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>;
  if (category === 'task') return <svg {...common}><path d="M3 3h10v10H3zM5 6h6M5 8.5h6M5 11h4" /></svg>;
  if (category === 'write') return <svg {...common}><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7M8 10l.5-2.5 4-4 1.5 1.5-4 4z" /></svg>;
  if (category === 'read') return <svg {...common}><path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6zM9.5 2.5V6H13M5.5 9h5M5.5 11h4" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></svg>;
}

function defaultDetails(call: ToolCallLike): ToolCallDetails {
  const output = call.output ?? call.result;
  const result = parseRecord(output);
  const stdoutValue = call.stdout ?? result?.stdout;
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
    ok: call.ok,
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
  const bodyId = useId();
  const details = useMemo(() => getDetails ? getDetails(call) : defaultDetails(call), [call, getDetails]);
  const input = textOf(details.input);
  const output = textOf(details.output);
  const stdout = details.stdout ?? output;
  const bytes = new TextEncoder().encode(stdout).length;
  const lines = stdout ? stdout.replace(/\r?\n$/, '').split(/\r?\n/).length : 0;
  const failed = details.ok === false || (details.exitCode != null && details.exitCode !== 0);
  /* Gagal lebih dulu: tool yang sudah gagal tidak mungkin masih jalan, dan
     kalau kedua tanda itu bertentangan, yang lebih dipercaya adalah hasilnya. */
  const isJalan = !failed && details.running === true;
  const category = categoryOf(details.name, details.category);

  return (
    <article className={`w4-tool-card${failed ? ' is-failed' : ''}${className ? ` ${className}` : ''}`}>
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
          {input && <section className="w4-tool-io"><div className="w4-tool-label">{tr('Input')}</div><pre>{input}</pre></section>}
          {output && <section className="w4-tool-io"><div className="w4-tool-label">{tr('Output')}</div><pre className={failed ? 'is-failed' : undefined}>{output}</pre></section>}
          <dl className="w4-tool-meta">
            {details.exitCode != null && <><dt>{tr('Exit status')}</dt><dd>{details.exitCode}</dd></>}
            {stdout && <><dt>{tr('Standard output')}</dt><dd>{tf('{lines} lines · {bytes} bytes', { lines, bytes })}</dd></>}
            {details.cwd && <><dt>{tr('Working directory')}</dt><dd><code>{details.cwd}</code></dd></>}
          </dl>
        </div>
      )}
    </article>
  );
}
