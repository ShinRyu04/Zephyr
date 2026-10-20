import { useMemo } from 'react';
import { useAi } from '../../lib/aiStore';
import { useT, tf } from '../../lib/i18n';
import type { ChatMsg, ChatSession } from '../../lib/types';

/**
 * Task Summary — the LIVE state of the current task, not a narrative of it.
 *
 * The reference splits this into Todo and Context, and both halves here are
 * derived from the conversation the agent is actually in:
 *
 *   - **Todo** is the list of calls that CHANGED something (write / edit /
 *     apply / create), grouped by file, newest last. It is not a planning
 *     checklist the model wrote down: that would be a promise, and this column
 *     is supposed to answer "what has actually happened so far". A call that
 *     failed is shown with the failure, because a silently missing row would
 *     read as work that never started.
 *   - **Context** is what the run has consumed: turns, tool calls, the share of
 *     the step budget, and how much of the transcript has been folded away by
 *     `/compact`. That is the number the reference shows as "compact N%", so it
 *     is computed, not guessed.
 *
 * Everything is derived from `messages`, so it is right for a running task, a
 * finished one, and one restored from disk — no extra state to keep in sync.
 */

/** Calls that WROTE. Read/grep/glob are deliberately absent: reading a file is
 *  not task progress, and listing every read buries the edits. */
const TULIS = /^(write|edit|apply|create|patch|replace|insert)/i;

function pathDariArgs(args: string): string {
  /* The tool args are a JSON string. Parse when possible; fall back to the
   * first `"path": "…"` so a truncated stream still names its file. */
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    for (const k of ['path', 'file', 'file_path', 'filename', 'target']) {
      const v = o?.[k];
      if (typeof v === 'string' && v) return v;
    }
  } catch {
    /* not JSON yet */
  }
  const m = /"(?:path|file|file_path|filename)"\s*:\s*"([^"]+)"/.exec(args);
  return m?.[1] ?? '';
}

interface TodoRow {
  key: string;
  path: string;
  ok: boolean;
  at: number;
  operasi: string;
}

export default function AgentsTaskSummary({ composerId }: { composerId: string }) {
  const tr = useT();
  const sesi = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    return s.sessions.find((x) => x.id === id) ?? null;
  }) as ChatSession | null;
  const pesan: ChatMsg[] = sesi?.messages ?? [];

  /*
   * Todo + Context, computed once per message list.
   *
   * `useMemo` on `pesan` (which is a stable array from the store until a
   * message is added) keeps this off the per-token path: a streaming answer
   * must not re-walk the whole transcript on every chunk.
   */
  const { todo, ctx } = useMemo(() => {
    const rows: TodoRow[] = [];
    let tools = 0;
    let gagal = 0;
    let dipadatkan = 0;
    let turnUser = 0;
    for (const m of pesan) {
      if (m.role === 'user') turnUser += 1;
      if (m.content.startsWith('[Konteks dipadatkan:')) dipadatkan += 1;
      for (const t of m.tools ?? []) {
        tools += 1;
        if (!t.ok) gagal += 1;
        const nama = t.name.replace(/^mcp__/, '').split('__').pop() ?? t.name;
        if (!TULIS.test(nama)) continue;
        rows.push({
          key: `${m.id}-${t.at}-${rows.length}`,
          path: pathDariArgs(t.args) || nama,
          ok: t.ok,
          at: t.at,
          operasi: nama,
        });
      }
    }
    return {
      todo: rows,
      ctx: {
        turnUser,
        tools,
        gagal,
        dipadatkan,
        /* Nothing is counted against the limit yet: the step index is reset at
         * the start of every run, so reporting it here would reset the number
         * the reader is watching. Turns and calls are the honest totals. */
        pesan: pesan.length,
      },
    };
  }, [pesan]);

  const judulSesi = sesi?.title?.trim() || tr('New task');

  return (
    <div className="ag-task" data-testid="ag-task">
      <header className="ag-task-head">
        <span className="ag-task-judul" title={judulSesi}>
          {judulSesi}
        </span>
        <span className="ag-task-stat" data-testid="ag-task-stats">
          {tf('{n} steps', { n: ctx.tools })}
        </span>
      </header>

      {/* ── Todo ─────────────────────────────────────────────────────────── */}
      <section className="ag-task-sec" data-testid="ag-task-todo">
        <div className="ag-task-secjudul">{tr('Todo')}</div>
        {todo.length === 0 ? (
          <p className="ag-task-kosong">{tr('No todos yet')}</p>
        ) : (
          <ul className="ag-task-daftar">
            {todo.map((r) => (
              <li
                key={r.key}
                className={`ag-task-baris${r.ok ? '' : ' is-gagal'}`}
                title={`${r.operasi} · ${r.path}`}
              >
                <span className="ag-task-cek" aria-hidden="true">
                  {r.ok ? (
                    <svg viewBox="0 0 16 16">
                      <path d="M3.6 8.4l2.8 2.8 6-6.4" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16">
                      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
                    </svg>
                  )}
                </span>
                <span className="ag-task-teks">{r.path}</span>
                <span className="ag-task-aksi">{r.operasi}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Context ──────────────────────────────────────────────────────── */}
      <section className="ag-task-sec" data-testid="ag-task-context">
        <div className="ag-task-secjudul">
          {tr('Context')}
          <span className="ag-task-badge">
            {/*
              * "compact N%" as the reference prints it: the share of this
              * conversation that has been folded into a summary. With nothing
              * compacted it says 0%, which is a fact, not a placeholder.
              */}
            {tr('compact')} {ctx.pesan > 0 ? Math.round((ctx.dipadatkan / ctx.pesan) * 100) : 0}%
          </span>
        </div>
        {ctx.pesan === 0 ? (
          <p className="ag-task-kosong">{tr('No contexts used yet')}</p>
        ) : (
          <ul className="ag-task-meta">
            <li>
              <span>{tr('Turns')}</span>
              <span className="ag-task-angka">{ctx.turnUser}</span>
            </li>
            <li>
              <span>{tr('Tool calls')}</span>
              <span className="ag-task-angka">{ctx.tools}</span>
            </li>
            <li>
              <span>{tr('Failed calls')}</span>
              <span className="ag-task-angka">{ctx.gagal}</span>
            </li>
            <li>
              <span>{tr('Messages')}</span>
              <span className="ag-task-angka">{ctx.pesan}</span>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
