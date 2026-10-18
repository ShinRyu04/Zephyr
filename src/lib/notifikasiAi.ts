/*
 * Notify when a long AI run finishes while the reader is looking elsewhere.
 *
 * ## The problem this solves
 *
 * An agent run can take minutes. The reader starts it, switches to another
 * application, and has no way to know it is done - so they either sit watching a
 * spinner or come back much later to a result they could have acted on at once.
 *
 * ## Why it only fires when the window is NOT focused
 *
 * A notification for something already on screen is noise. If Zephyr has focus,
 * the finished bubble is right there; a toast on top of it is the kind of
 * "helpfulness" that makes people turn notifications off entirely. So the gate is
 * `document.hasFocus()`, not a timer or a preference.
 *
 * ## Why failures are silent
 *
 * The OS may refuse (permission, focus assist, no notification daemon on a bare
 * Linux box). That is not an error in Zephyr and must never be reported as one -
 * the run still finished and the transcript still says so. The notification is a
 * courtesy, never the source of truth.
 */
import { notifyShow } from './commands';

/** Runs shorter than this are not worth a notification - they are over before
 *  the reader has looked away, and the toast would arrive after they are back. */
const AMBANG_MS = 20_000;

/** One run in flight, tracked per composer so parallel chats do not collide. */
const mulai = new Map<string, number>();

/**
 * Mark the start of a run.
 *
 * Called where `agentBusy` becomes true. Cheap: one Map write, no timers.
 */
export function catatMulaiRun(id: string, ms = Date.now()): void {
  mulai.set(id, ms);
}

/**
 * Mark the end of a run, and notify if it qualifies.
 *
 * Qualifies when the run was long enough AND the window is not focused. The
 * title/body are short on purpose: a notification is read at a glance from
 * another application, and a paragraph there is unreadable.
 */
export function catatSelesaiRun(id: string, judul: string, ringkas: string): void {
  const awal = mulai.get(id);
  mulai.delete(id);
  if (awal === undefined) return;

  const lama = Date.now() - awal;
  const fokus = typeof document !== 'undefined' && document.hasFocus();

  /*
   * Record the decision BEFORE the length/focus gate so the harness can tell
   * "skipped because short" from "skipped because focused" - and so a probe can
   * prove the gate runs at all.
   */
  catatRiwayat(judul.trim().slice(0, 80) || 'Zephyr', ringkas.trim().slice(0, 140), fokus, lama);

  if (lama < AMBANG_MS) return;

  /* Already looking at it: the transcript is the notification. */
  if (fokus) return;

  const menit = Math.round(lama / 60_000);
  const isi = ringkas.trim().slice(0, 140);
  const badan = [isi, menit >= 1 ? `(${menit}m)` : ''].filter(Boolean).join(' ');

  void notifyShow(judul.trim().slice(0, 80) || 'Zephyr', badan);
}

/** Forget a run that was cancelled before it finished. */
export function lupakanRun(id: string): void {
  mulai.delete(id);
}

/** How many runs are being tracked - for the harness, and for honesty. */
export const jumlahRunDilacak = (): number => mulai.size;

/**
 * The last notification this module decided to send, for the harness.
 *
 * A toast is drawn by the OS, so nothing inside the page can observe it. Without
 * a record the only testable statement would be "the code ran", which is exactly
 * the kind of claim that passes while the feature does nothing. Recording the
 * DECISION - title, body, and whether the window was focused - lets a probe
 * assert the gate itself: short runs produce nothing, long runs produce one, and
 * a focused window produces none.
 *
 * Bounded to the last few entries so a long session cannot grow it.
 */
const riwayat: Array<{ judul: string; isi: string; fokus: boolean; lama: number }> = [];
export const riwayatNotifikasi = () => riwayat.slice();

function catatRiwayat(judul: string, isi: string, fokus: boolean, lama: number): void {
  riwayat.push({ judul, isi, fokus, lama });
  if (riwayat.length > 10) riwayat.shift();
}
