import { listen } from '@tauri-apps/api/event';
import * as cmd from './commands';
import type { CronJob } from './commands';
import { useTerminal } from './terminalStore';
import { notifyError, notifyInfo, notifyWarn } from './notificationStore';
import { tandaiSesiBelumDibaca, useAi } from './aiStore';

/*
 * Cron job runner.
 *
 * The Rust timer in `cron.rs` has always been running: every 30 seconds it
 * picks the jobs whose time has come, stamps `last_run` and emits `cron-due`
 * with the job payload. What was missing was the other half — nothing in
 * `src/` ever listened for that event, so the command string was decided,
 * written to disk as "already run", and then thrown away. The job never
 * executed and the schedule list still showed a fresh `last_run`, which reads
 * as "it ran, it just did nothing".
 *
 * This module is that missing half. It deliberately does NOT re-derive due
 * times: Rust already made the decision, and computing it a second time here
 * would only produce two sources of truth that drift apart. The runner
 * executes exactly what arrives on the event and nothing else.
 */

let cronListenerBound = false;

/*
 * Send the job's command to a visible terminal pane.
 *
 * This is the strategy chosen over a hidden non-interactive exec: a scheduled
 * command is arbitrary user shell text, it may well be interactive (a REPL, a
 * watch, a server), and it must be honest about what happened. Writing it into
 * a real ConPTY pane shows the user the command and its output, and leaves the
 * process alive when it needs to keep running — which `agent_exec` cannot do,
 * since it waits for the process to finish and returns a string.
 *
 * A live non-browser, non-agent pane is reused when there is one, matching the
 * AI's own terminal tool; otherwise a fresh shell pane is created. `addPane`
 * is awaited and then the store is re-read, because the snapshot taken before
 * the await does not contain the pane that was just added.
 *
 * Returns false when no pane could be opened, so the caller can fall back.
 */
async function jalankanDiTerminal(command: string): Promise<boolean> {
  try {
    const t = useTerminal.getState();
    let pane = t
      .allPanes()
      .find((p) => p.status === 'live' && p.kind !== 'agent');
    if (!pane) {
      const id = await t.addPane('shell');
      if (!id) return false;
      await new Promise((r) => setTimeout(r, 700));
      pane = useTerminal.getState().findPane(id);
    }
    if (!pane) return false;

    useTerminal.getState().setVisible(true);
    const { writeChunked } = await import('./terminalClipboard');
    await writeChunked(pane.id, `${command.replace(/\r?\n/g, '\r')}\r`);
    return true;
  } catch {
    return false;
  }
}

/*
 * Fall back to the same non-interactive executor the AI agent uses.
 *
 * Reachable when the terminal store refuses the pane (the per-tab pane limit
 * is reached, or PTY spawn failed). The job still runs; the outcome is
 * surfaced as a toast with the exit code and a one-line output tail.
 */
async function jalankanDiLatar(command: string, nama: string): Promise<void> {
  const hasil = await cmd.agentExec(command, 120_000);
  const ringkas = (hasil.stdout || hasil.stderr || '').trim().split(/\r?\n/).slice(-3).join('\n');
  if (hasil.timedOut) {
    notifyWarn(`Scheduled job "${nama}" timed out`, {
      source: 'schedule',
      detail: ringkas || undefined,
    });
  } else if (hasil.exitCode !== 0) {
    notifyError(`Scheduled job "${nama}" exited with code ${hasil.exitCode}`, {
      source: 'schedule',
      detail: ringkas || undefined,
    });
  } else {
    notifyInfo(`Scheduled job "${nama}" finished`, { source: 'schedule', detail: ringkas || undefined });
  }
}

/*
 * Run one due job.
 *
 * Every path ends in a notification that names the job: a scheduled command
 * that fails must never disappear silently, or the user keeps a schedule that
 * "works" without doing anything. The order is always terminal first, then the
 * headless executor.
 */
async function jalankanJob(job: CronJob): Promise<void> {
  const nama = job.name?.trim() || job.id;
  const command = job.command?.trim() ?? '';
  if (!command) {
    notifyWarn(`Scheduled job "${nama}" has an empty command`, { source: 'schedule' });
    return;
  }

  /*
   * A schedule is created from a conversation (the scheduler tool is one of the
   * agent's tools), but the timer fires later, possibly with that chat closed.
   * The conversation is therefore the thing that has news, and it is marked the
   * same way a finished agent run marks it: skipped when the reader is already
   * looking at that chat. No session means no badge - a job created before the
   * chat existed has nowhere to point.
   */
  const sesi = useAi.getState().activeSession()?.id;

  const keTerminal = await jalankanDiTerminal(command);
  if (keTerminal) {
    notifyInfo(`Ran scheduled job "${nama}" in the terminal`, { source: 'schedule' });
    if (sesi) {
      useAi.getState().catatLatar(sesi, {
        id: `jadwal:${job.id}:${Date.now()}`,
        jenis: 'jadwal',
        nama,
        mulai: Date.now(),
        status: 'jalan',
      });
      tandaiSesiBelumDibaca(sesi);
    }
    return;
  }

  try {
    await jalankanDiLatar(command, nama);
    if (sesi) tandaiSesiBelumDibaca(sesi);
  } catch (e) {
    if (sesi) tandaiSesiBelumDibaca(sesi);
    notifyError(`Scheduled job "${nama}" failed to start`, {
      source: 'schedule',
      detail: cmd.asZephyrError(e).message,
    });
  }
}

/**
 * Bind the `cron-due` listener once per process.
 *
 * The module-level guard (not just an effect cleanup) is required: React
 * StrictMode in dev mounts the effect twice, and without it every due job
 * would be executed twice — running a user's arbitrary shell command twice is
 * far worse than duplicating a byte of output. A second call is a no-op and
 * returns a no-op unsubscribe, so the caller can always clean up safely.
 */
export async function pasangPendengarCron(): Promise<() => void> {
  if (cronListenerBound) return () => {};
  cronListenerBound = true;

  try {
    const un = await listen<CronJob>('cron-due', (event) => {
      void jalankanJob(event.payload);
    });
    return () => {
      un();
      cronListenerBound = false;
    };
  } catch (e) {
    /*
     * No backend to talk to (plain browser dev, or the Tauri event bus is not
     * up yet). Release the guard so a later call can retry, and say so once
     * instead of leaving the feature dead in silence.
     */
    cronListenerBound = false;
    notifyWarn('Scheduled jobs could not start', {
      source: 'schedule',
      detail: cmd.asZephyrError(e).message,
    });
    return () => {};
  }
}
