/*
 * Code Review — how much of what the agent wrote the reader gets to review,
 * and what happens to the screen after they decide.
 *
 * ## The two settings, and why they are separate
 *
 * `reviewScope` answers "which turns can still be undone":
 *
 *   all     every turn keeps its checkpoint, so any turn in the transcript can
 *           be put back later. Undo is a history.
 *   latest  only the newest turn keeps one. Sending another message retires it,
 *           which is what TRAE describes as "once you send a new message, undo
 *           is no longer available". Undo is a single step back.
 *   none    no turn keeps one; changes are kept automatically. Undo is off.
 *
 * `reviewJump` answers a different question: after a keep/undo decision, does
 * the editor MOVE to the next file that changed? That is about reading flow, not
 * about what is undoable — so it is its own switch and does not change what the
 * checkpoints contain.
 *
 * ## Why this is a module and not two `if`s in the agent loop
 *
 * The policy is consulted from two places (attach-time and restore-time) and has
 * three values. Spreading that across the 900-line run function is how the
 * "latest" case silently keeps behaving like "all" the first time someone edits
 * the block. Here it is one pure function the harness can call.
 */
import { useStore } from './store';

export type CakupanReview = 'all' | 'latest' | 'none';

/** The scope currently configured. */
export function cakupanReview(): CakupanReview {
  const v = useStore.getState().settings.conversation?.reviewScope;
  return v === 'latest' ? 'latest' : v === 'none' ? 'none' : 'all';
}

/** Whether the jump-after-decision behaviour is on. Defaults to on. */
export function lompatSetelahReview(): boolean {
  return useStore.getState().settings.conversation?.reviewJump !== false;
}

/**
 * Should THIS turn keep a checkpoint?
 *
 * `none` is the only scope that refuses outright: with it there is no undo, so
 * storing a checkpoint would attach a button whose setting says it should not
 * exist. `all` and `latest` both store one; they differ in what happens to the
 * OTHER turns, which is `buangCheckpointLama`.
 */
export function simpanCheckpoint(): boolean {
  return cakupanReview() !== 'none';
}

/**
 * Which message ids should lose their checkpoint after a new turn stored one.
 *
 * Returns every id EXCEPT `pesanBaru` under `latest`, and nothing under the
 * other scopes. Keeping this as a pure function of (scope, ids) means the
 * "retire the old one" rule is one line that can be asserted, rather than an
 * emergent property of a `.map()` inside the run loop.
 */
export function checkpointYangDibuang(
  scope: CakupanReview,
  idSemua: readonly string[],
  pesanBaru: string,
): string[] {
  if (scope !== 'latest') return [];
  return idSemua.filter((id) => id !== pesanBaru);
}
