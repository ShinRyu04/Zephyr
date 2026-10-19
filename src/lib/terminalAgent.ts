/*
 * Terminal Tool Preferences — which terminal an agent command runs in, and
 * whether that terminal is brought to the front while it runs.
 *
 * ## What the two settings actually mean here
 *
 * TRAE offers "Efficient Terminal" versus "System Terminal", and "Auto Open
 * Original Terminal on Command Execution". They sound like two independent
 * toggles but they answer one question between them: WHERE does the reader see
 * the command, and DO they see it at all.
 *
 *   efficient  runs in a pipe, nothing appears on screen. Fast, no window to
 *              manage, and the output comes back as text the agent reads.
 *   system     runs in a real terminal pane the reader can type into, which is
 *              the point when the command needs a password or an interactive
 *              prompt.
 *
 * Auto Open then decides whether that pane is raised while the command runs:
 *   always      raise it for every command
 *   background  raise it only for commands that keep running (servers,
 *               watchers) — the ones the reader will need to look at later
 *   never       never raise it; the pane exists but stays behind
 *
 * ## Why this lives in one module
 *
 * `bash_run` is the only caller, but the DECISION is three settings read
 * together. Putting it in the tool would bury a policy in a 300-line handler and
 * make it impossible to assert on its own. Here it is one pure function that the
 * harness can call without running an agent.
 */
import { useStore } from './store';

export type LingkunganTerminal = 'efficient' | 'system';
export type KapanBukaTerminal = 'always' | 'background' | 'never';

/** The resolved decision for one command. */
export interface KeputusanTerminal {
  /** Which environment the command should run in. */
  lingkungan: LingkunganTerminal;
  /** Whether to raise the terminal pane while it runs. */
  buka: boolean;
  /**
   * Whether the command looks like it keeps running (a server, a watcher).
   *
   * Only consulted for `background`: that setting exists precisely to
   * distinguish "runs and returns" from "starts something that stays up".
   */
  latar: boolean;
}

/*
 * Commands that keep running after they start.
 *
 * This is a HINT, not a gate: getting it wrong only means the pane is or is not
 * raised, never that a command is blocked or misrouted. So a plain pattern is
 * enough — a parser would be more precise about something that does not need
 * precision, and would break on the first shell construct it did not know.
 */
const POLA_LATAR =
  /(\bwatch\b|\bdev\b|\bserve\b|\bserver\b|\bstart\b|\bnodemon\b|\b--watch\b|\b-d\b|vite|webpack|next\s+dev|cargo\s+run|npm\s+(run\s+)?dev|pnpm\s+dev|yarn\s+dev|uvicorn|gunicorn|flask\s+run|python\s+-m\s+http\.server)/i;

/** True when a command looks like it starts something long-lived. */
export const tampakLatar = (perintah: string): boolean => POLA_LATAR.test(String(perintah ?? ''));

/**
 * Resolve the three settings for one command.
 *
 * `perintah` is passed in rather than read from the tool so this stays a pure
 * function of its inputs — the harness can exercise every combination without a
 * running agent, and the caller cannot accidentally use a different command than
 * the one it is about to run.
 */
export function keputusanTerminal(perintah: string): KeputusanTerminal {
  const conv = useStore.getState().settings.conversation;
  const lingkungan: LingkunganTerminal = conv?.terminalEnv === 'system' ? 'system' : 'efficient';
  const kapan: KapanBukaTerminal =
    conv?.terminalAutoOpen === 'always'
      ? 'always'
      : conv?.terminalAutoOpen === 'background'
        ? 'background'
        : 'never';

  const latar = tampakLatar(perintah);
  const buka =
    kapan === 'always' ? true : kapan === 'background' ? latar : false;

  return { lingkungan, buka, latar };
}
