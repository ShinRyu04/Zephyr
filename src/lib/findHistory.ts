/*
 * Search terms typed into the Find bar, newest first.
 *
 * Lives in memory rather than settings on purpose: it is a scratch list for one
 * debugging session ("I keep looking for the same symbol"), not a preference
 * worth writing to disk and syncing across machines.
 *
 * A module-level array instead of React state so the list survives the bar
 * being closed and reopened - that is the whole point, and closing the bar
 * unmounts nothing but does reset the input.
 */
const MAKS = 30;

let riwayat: string[] = [];

export function bacaRiwayat(): string[] {
  return riwayat;
}

export function catatRiwayat(teks: string): void {
  const t = teks.trim();
  if (!t) return;
  /* Re-searching the same term moves it to the top instead of adding a
     duplicate, so ↑ does not have to walk through repeats. */
  riwayat = [t, ...riwayat.filter((x) => x !== t)].slice(0, MAKS);
}

/**
 * The neighbour of `dari` in the history, walking away from the newest entry.
 *
 * Returns `null` when there is nothing that way, which the caller reads as
 * "keep what the user has typed". Deliberately index based rather than
 * "previous entry before the current text": the input is edited while walking,
 * and matching by text would lose the position as soon as a character changed.
 */
export function langkahRiwayat(dari: string, arah: -1 | 1): string | null {
  if (riwayat.length === 0) return null;
  const i = dari === '' ? -1 : riwayat.indexOf(dari);
  if (i === -1) return riwayat[0] ?? null;
  const j = i + arah;
  if (j < 0 || j >= riwayat.length) return null;
  return riwayat[j];
}
