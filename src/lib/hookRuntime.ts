import { asZephyrError, hookRun, type HookRunResult } from './commands';
import { useAgentExtras, type Hook, type HookEvent } from './agentExtrasStore';
import { useStore } from './store';

/*
 * Hook execution: which hooks run, when, and what happens to the result.
 *
 * ## The one rule this file exists to enforce
 *
 * A hook runs a command on the reader's machine, and it does so because the
 * AGENT reached a point — not because the reader asked at that moment. So this
 * module is deliberately conservative about what it will start:
 *
 *   - only hooks the reader has turned ON (`enabled`), never a draft;
 *   - only in a workspace that is actually open, because the working directory
 *     is checked against it;
 *   - only one run per hook at a time, so a hook cannot trigger itself;
 *   - `session-start` and `session-end` only, for now. See below.
 *
 * ## Why only two events, when five are listed
 *
 * `HOOK_EVENTS` offers five: session start, session end, before a tool, after a
 * tool, before a write. Only the two session events have a caller here, because
 * only they have a UNAMBIGUOUS trigger in this architecture:
 *
 *   - "session starts" is the moment a new chat begins — one place, one call.
 *   - "session ends" is the moment a run finishes — likewise.
 *
 * The other three would need to fire per tool call and per file write. Those
 * happen inside the agent loop, under an approval gate, and a hook firing there
 * would sit BETWEEN the reader's approval and the action it approved — running
 * an arbitrary command at the exact moment the reader expects the action they
 * authorised and nothing else. That is the one place in this app where a hook
 * could defeat the gate rather than complement it.
 *
 * So they are left unwired, and the UI says which are live. Offering an event
 * that never fires would be worse than not offering it: the reader would trust
 * a guard that does not exist.
 */

/** Events this runtime actually fires. Not the same list as HOOK_EVENTS. */
export const EVENT_AKTIF: HookEvent[] = ['session-start', 'session-end'];

/** Default per-hook timeout when a hook does not carry one. */
const TIMEOUT_DEFAULT_SEC = 30;

/*
 * One run per hook at a time.
 *
 * A hook whose command triggers another turn — a formatter that touches a file
 * the agent watches, say — would otherwise start itself again from inside its
 * own completion. The guard is per hook ID and lives outside React because the
 * decision has to be synchronous at the moment the event fires.
 */
const sedangJalan = new Set<string>();

export interface HasilHook {
  hook: Hook;
  hasil: HookRunResult;
}

/**
 * Run every enabled hook registered for one event.
 *
 * Returns the results so the caller can show them; a hook that fails does NOT
 * throw. A failing hook is a fact about the reader's setup, not a failure of the
 * agent run that happened to reach that point — breaking the turn because a
 * linter exited non-zero would punish the wrong thing.
 */
export async function jalankanHook(
  event: HookEvent,
  konteks: { sesi?: string } = {},
): Promise<HasilHook[]> {
  if (!EVENT_AKTIF.includes(event)) return [];

  const ws = useStore.getState().workspace;
  if (!ws) return [];

  const daftar = useAgentExtras.getState().hooks.filter((h) => h.enabled && h.event === event);
  if (daftar.length === 0) return [];

  const keluar: HasilHook[] = [];
  for (const h of daftar) {
    if (sedangJalan.has(h.id)) continue;
    if (!h.command.trim()) continue;
    sedangJalan.add(h.id);
    try {
      const hasil = await hookRun({
        command: h.command,
        /* Empty lets Rust default to the workspace root, which is what a hook
           almost always wants and what the dialog shows. */
        cwd: '',
        timeoutSec: TIMEOUT_DEFAULT_SEC,
      });
      keluar.push({ hook: h, hasil });
    } catch (e) {
      /*
       * A failure to START is reported as a result rather than thrown, so one
       * hook that cannot run does not stop the others in the same event.
       */
      keluar.push({
        hook: h,
        /*
         * `asZephyrError` rather than `String(e)`. Tauri rejects with a plain
         * object ({ code, message }), and `String` on that gives
         * "[object Object]" - so every rejection in this panel would read the
         * same, and the reason ("working directory does not exist", "command
         * must be a single line") would be thrown away at the last step.
         */
        hasil: {
          code: null,
          stdout: '',
          stderr: asZephyrError(e).message,
          truncated: false,
          timed_out: false,
          duration_ms: 0,
        },
      });
    } finally {
      sedangJalan.delete(h.id);
    }
  }

  void konteks;
  return keluar;
}

/** A one-line summary for the transcript, or null when nothing ran. */
export function ringkasHook(hasil: HasilHook[]): string | null {
  if (hasil.length === 0) return null;
  const baris = hasil.map(({ hook, hasil: r }) => {
    const status = r.timed_out
      ? 'timeout'
      : r.code === 0
        ? 'ok'
        : `exit ${r.code ?? '?'}`;
    const keluar = (r.stderr || r.stdout).trim().split('\n')[0]?.slice(0, 120) ?? '';
    return `- ${hook.name}: ${status}${keluar ? ` - ${keluar}` : ''}`;
  });
  return `Hooks (${hasil.length}):\n${baris.join('\n')}`;
}
