import type { SesiLatar } from './types';

/**
 * Everything about "this conversation has news for you", in one place.
 *
 * Two different facts are easy to confuse and must not be:
 *
 *   unread  - a TURN finished while the reader was looking elsewhere. Cleared
 *             the moment the chat is selected. See `aiStore`.
 *   latar   - BACKGROUND WORK the chat started (subagents, schedules) that is
 *             either still running or finished unseen. Survives panel close,
 *             because it is stored on the session (`SesiLatar`).
 *
 * The list UI needs one badge and one ring, and the sidebar is one of several
 * surfaces that must agree - so the rules live here as pure functions over
 * plain data rather than as selectors inside a component. Zustand v5 compares
 * selector results with `===`, so a selector that built an object or array
 * would re-render forever; these functions take the array and return a
 * primitive.
 */

/** Work still running right now. */
export function latarBerjalan(latar: SesiLatar[] | undefined): number {
  if (!latar) return 0;
  let n = 0;
  for (const l of latar) if (l.status === 'jalan' || l.status === 'menunggu') n += 1;
  return n;
}

/** Finished but never seen. */
export function latarBelumDibaca(latar: SesiLatar[] | undefined): number {
  if (!latar) return 0;
  let n = 0;
  for (const l of latar) if (l.belumDibaca) n += 1;
  return n;
}

export interface RingkasSesi {
  /** Something the reader has not seen: a finished turn, or a finished job. */
  butuhPerhatian: boolean;
  /** A background job of this conversation is still running. */
  berjalan: boolean;
}

/**
 * What a session row should show, from the three fields that describe it.
 *
 * `streaming` (a message mid-flight) is NOT a reason to spin here: the run is
 * visible in the transcript, and the icon already says "working" while the
 * reader is watching it. This is only about a conversation the reader is not
 * currently reading.
 */
export function ringkasSesi(
  s: { unread?: boolean; latar?: SesiLatar[] },
): RingkasSesi {
  return {
    butuhPerhatian: s.unread === true || latarBelumDibaca(s.latar) > 0,
    berjalan: latarBerjalan(s.latar) > 0,
  };
}

/**
 * Did this session get news for any reason at all?
 *
 * A single boolean so the count badge ("3 unread chats") can be computed with
 * one pass over the array instead of building a filtered array in a selector.
 */
export function sesiPerluPerhatian(s: { unread?: boolean; latar?: SesiLatar[] }): boolean {
  return s.unread === true || latarBelumDibaca(s.latar) > 0;
}
