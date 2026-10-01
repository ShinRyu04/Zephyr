/*
 * Context budget: one place for the token estimate and the window size.
 *
 * Both the usage meter and the agent loop's automatic compaction have to agree
 * on how full the context is. Two separate formulas would drift, and a meter
 * that reads 50% while the loop compacts at 30% is worse than no meter at all.
 * Everything imports from here.
 */
import { findModel } from './modelCatalog';

/**
 * Rough token count for a piece of text.
 *
 * ~4 characters per token. It is an estimate, not a tokenizer: the providers
 * differ, and running the real BPE here would cost more than it is worth for a
 * number the reader only uses to judge "am I near the edge".
 */
export function kiraToken(teks: string): number {
  return Math.ceil((teks ?? '').length / 4);
}

/**
 * The model's context window in tokens.
 *
 * Falls back to 128k for an unknown model, which is the smallest window Zephyr
 * ships. Guessing low is the safe direction: it compacts earlier rather than
 * overflowing a provider that would reject the request.
 */
export function jendelaKonteks(modelId: string): number {
  const m = findModel(modelId);
  return m?.ctx && m.ctx > 0 ? m.ctx : 128_000;
}

/**
 * Estimated tokens used by a list of messages.
 *
 * Sums over the message text exactly the way the meter does. Structurally typed
 * so it accepts both ChatMsg[] and AgentMsg[] — the meter reads the session's
 * ChatMsgs, the agent loop reads its outgoing AgentMsgs, and both have `content`.
 */
export function perkiraanKonteks(messages: { content?: string }[]): number {
  let n = 0;
  for (const m of messages) n += kiraToken(m.content ?? '');
  return n;
}

/**
 * Fraction of the window at which automatic compaction fires.
 *
 * 0.8 leaves room for the next step's tool results and the answer itself: a
 * step can add tens of thousands of characters of file contents, and compacting
 * at 0.99 would mean the request that trips the limit is the one that overflows.
 */
export const AUTO_COMPACT_AT = 0.8;

/** How many tail messages auto-compaction always leaves untouched. */
export const AUTO_COMPACT_KEEP = 6;

/**
 * Minimum steps between two automatic compactions in one run.
 *
 * Compaction costs a model call and rewrites the history; doing it on every
 * step once the window is near the line would spend more tokens on summaries
 * than it saves. A cooldown lets the window refill with real work in between.
 */
export const AUTO_COMPACT_COOLDOWN_STEPS = 6;
