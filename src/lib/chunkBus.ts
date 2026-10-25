import type { AiChunk } from './types';

/*
 * A SECOND stream listener, for the model comparison.
 *
 * WHY NOT `useAi.getState().onChunk`: that function owns the chat contract —
 * it looks up a message by request id inside a session and drops anything it
 * cannot find. Comparison answers belong to no session (they are one prompt
 * asked twice, in their own column), so routing them through it would both
 * lose the text and risk a stray `pending` flip. This bus is a plain fan-out:
 * whoever claims a request id gets its frames, everyone else ignores them.
 */

type Pendengar = (c: AiChunk) => void;

const pendengar = new Set<Pendengar>();

export function onChunkBanding(f: Pendengar): () => void {
  pendengar.add(f);
  return () => pendengar.delete(f);
}

/** Called from the single `ai-chunk` Tauri listener in App.tsx. */
export function sebarkanChunkBanding(c: AiChunk): void {
  if (pendengar.size === 0) return;
  for (const f of pendengar) f(c);
}
