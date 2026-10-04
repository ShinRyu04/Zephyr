/*
 * `/loop <interval> <prompt>` — re-send a prompt to the agent on a fixed
 * interval.
 *
 * WHY this exists at all, and why it is not a prompt template: `/loop` used to
 * expand into a fixed sentence ("Keep working on this until it is actually
 * done…") and land in the transcript as a bubble. That is wrong twice over. A
 * loop is a SCHEDULE, not a message: the sentence said nothing about what to
 * repeat, and nothing repeated anything — the user got a paragraph where they
 * expected a running job. The reference (TEDI's `lib/loop.ts`, Hermes'
 * `/loop`) treats it as a real command that starts a timer and answers with a
 * toast, and never sends the command text to the model.
 *
 * Each tick goes through the message queue, so it waits behind a busy turn
 * instead of stacking a second request, and a tick is queued for its own chat
 * so it never fires into a different conversation.
 *
 * IN MEMORY: a restart ends every loop. Bounded by MAX_LOOP_RUNS so a loop left
 * running overnight cannot keep billing a key.
 */

export const MIN_LOOP_MS = 60_000;
export const MAX_LOOP_MS = 7 * 24 * 3_600_000;
export const MAX_LOOP_RUNS = 48;

export type LoopState = {
  prompt: string;
  everyMs: number;
  runs: number;
  startedAt: number;
  nextAt: number;
};

/** `90s`, `10m`, `1h30m`, `2d` -> ms, or null when unparseable or out of range. */
export function parseInterval(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!/^(\d+[smhd])+$/.test(s)) return null;
  let ms = 0;
  for (const [, n, u] of s.matchAll(/(\d+)([smhd])/g)) {
    ms += Number(n) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[u as 's' | 'm' | 'h' | 'd'];
  }
  return ms >= MIN_LOOP_MS && ms <= MAX_LOOP_MS ? ms : null;
}

/** Milliseconds back into the shortest label that still means the same thing. */
export function formatInterval(ms: number): string {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  return `${Math.round(ms / 60_000)}m`;
}

/** The whole-minute countdown shown on the banner, e.g. "next in 7m". */
export function menitSampai(target: number, now: number): number {
  return Math.max(0, Math.round((target - now) / 60_000));
}

/** A live loop, as the UI reads it. */
export type LoopInfo = LoopState & { remaining: number };

type LoopHost = {
  getLoop: () => LoopState | null;
  setLoop: (l: LoopState | null) => void;
  enqueue: (text: string) => void;
};

/*
 * The timer lives per chat id, in a module map rather than in React state: a
 * timer in a component is a timer that dies when the panel closes, and a loop
 * is supposed to keep going while the user works in another tab.
 */
const timers = new Map<string, ReturnType<typeof setInterval>>();

function tick(sessionId: string, host: LoopHost): void {
  const loop = host.getLoop();
  if (!loop) {
    stopLoop(sessionId);
    return;
  }
  const now = Date.now();
  host.enqueue(loop.prompt);
  const runs = loop.runs + 1;
  if (runs >= MAX_LOOP_RUNS) {
    stopLoop(sessionId);
    return;
  }
  host.setLoop({ ...loop, runs, nextAt: now + loop.everyMs });
}

/** Start (or replace) this chat's loop. Runs the first tick immediately. */
export function startLoop(sessionId: string, everyMs: number, prompt: string, host: LoopHost): void {
  stopLoop(sessionId);
  const now = Date.now();
  host.setLoop({ prompt, everyMs, runs: 0, startedAt: now, nextAt: now });
  tick(sessionId, host);
  const timer = setInterval(() => tick(sessionId, host), everyMs);
  timers.set(sessionId, timer);
}

export function stopLoop(sessionId: string): boolean {
  const timer = timers.get(sessionId);
  if (!timer) return false;
  clearInterval(timer);
  timers.delete(sessionId);
  return true;
}

/** Whether a timer is actually armed for this chat. */
export function loopRunning(sessionId: string): boolean {
  return timers.has(sessionId);
}
