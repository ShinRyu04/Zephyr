/**
 * Checkpoints — undoing everything one agent turn changed.
 *
 * ## The gap this closes
 *
 * The editor already keeps per-file history (`history.rs`): every save leaves a
 * snapshot, and the Timeline view can put one file back. What it could NOT do
 * is undo a TURN — an agent run that edited nine files across three folders left
 * nine separate histories, and putting them all back meant opening nine files
 * and picking the right snapshot in each.
 *
 * An agent turn is the unit a reader actually thinks in. "Undo what it just
 * did" is one intention, and it should be one action.
 *
 * ## Why it records paths rather than copying content
 *
 * The snapshots already exist on disk, written before each write. A checkpoint
 * is therefore a LIST of paths plus the snapshot id taken before the turn
 * touched each one — a few hundred bytes, not a copy of nine files. That keeps
 * a long conversation from filling the disk with duplicate trees, and it means
 * the restore path is the same one the Timeline view already uses, so a
 * checkpoint cannot restore something a manual restore could not.
 *
 * ## Why the FIRST snapshot per path wins
 *
 * A turn that edits `a.ts` three times must roll back to before the FIRST edit.
 * Recording the latest would leave the turn's own intermediate state behind —
 * the file would come back looking edited, which is the bug the feature exists
 * to prevent.
 */

import { kunciPath } from './pathKey';

/** One file a turn changed, with the snapshot taken before the first change. */
export interface BerkasCheckpoint {
  path: string;
  /** The history snapshot id to restore, or null when there was none (the file
   *  did not exist before this turn — restoring means deleting it). */
  snapshotId: string | null;
  /** True when the file did not exist before the turn. */
  baru: boolean;
}

export interface Checkpoint {
  /** Which conversation surface, so two chats do not share a checkpoint. */
  composerId: string;
  /** The assistant message this belongs to, so the button sits on the turn. */
  pesanId: string;
  at: number;
  berkas: BerkasCheckpoint[];
}

/**
 * The in-progress checkpoint for the running turn.
 *
 * Module state, not store state: it is written from the tool path (which is not
 * a React render) once per write, and reading it through a store would
 * re-render every panel on each edit. The RESULT is pushed to the store when
 * the turn ends, which is the only moment anything needs to display it.
 */
let aktif: Checkpoint | null = null;

/**
 * Begin a turn's checkpoint.
 *
 * Called by the agent loop when a run starts, so the write path does not have
 * to know which conversation or which message it is serving — it just reports
 * "this file is about to change". Keeping that knowledge in one place is what
 * lets `tulis` stay a two-line function.
 */
export function mulaiTurn(composerId: string, pesanId: string): void {
  aktif = { composerId, pesanId, at: Date.now(), berkas: [] };
}

/**
 * Record a file about to be written.
 *
 * Called from the write path, so it runs for EVERY write including the ones a
 * reader would not think of as "an edit" — a create, a rename target, a
 * multi-edit. Missing one would mean a checkpoint that silently skips a file.
 *
 * Does nothing when no turn is running: a file written outside an agent run is
 * the reader's own work, and rolling THAT back is not what a checkpoint is for.
 */
export async function catat(path: string): Promise<void> {
  if (!aktif) return;
  /*
   * First snapshot per path wins. A turn editing the same file three times must
   * roll back to before the FIRST edit; recording the latest would leave the
   * turn's own intermediate state in place.
   */
  /* Keyed compare: this list is fed by tool calls, and a turn can name the same
     file `src\a.ts` once and `src/a.ts` the next time. A raw compare let the
     second one through, so the snapshot taken for it OVERWROTE the "before"
     that rollback depends on. */
  const kunci = kunciPath(path);
  if (aktif.berkas.some((b) => kunciPath(b.path) === kunci)) return;

  const { useHistory } = await import('./historyStore');
  try {
    const id = await useHistory.getState().snapshotSave(path, 'manual');
    aktif.berkas.push({ path, snapshotId: id ?? null, baru: !id });
  } catch {
    /* The file may not exist yet (a create), which is not an error — it means
     * rolling back is a delete. Recorded as such. */
    aktif.berkas.push({ path, snapshotId: null, baru: true });
  }
}

/** The checkpoint built so far, or null when the turn changed nothing. */
function checkpointAktif(): Checkpoint | null {
  return aktif && aktif.berkas.length > 0 ? aktif : null;
}

/**
 * Close the turn's checkpoint and hand it to the caller to store.
 *
 * Returns null when the turn touched no files — a read-only turn has nothing to
 * undo, and offering a "restore" button on it would be offering an action that
 * does nothing.
 */
export function tutupCheckpoint(): Checkpoint | null {
  const c = checkpointAktif();
  aktif = null;
  return c;
}


export interface HasilRestore {
  dipulihkan: string[];
  dihapus: string[];
  gagal: { path: string; pesan: string }[];
}

/**
 * Put every file in a checkpoint back.
 *
 * Order is not incidental: restores and deletes are interleaved as recorded,
 * and a path that was created during the turn is DELETED rather than restored —
 * there is no earlier content to put back, and leaving the new file behind
 * would mean the turn is only half undone.
 */
export async function pulihkanCheckpoint(
  c: Checkpoint,
  hapusBerkas: (path: string) => Promise<void>,
): Promise<HasilRestore> {
  const { useHistory } = await import('./historyStore');
  const hasil: HasilRestore = { dipulihkan: [], dihapus: [], gagal: [] };

  for (const b of c.berkas) {
    try {
      if (b.baru || !b.snapshotId) {
        await hapusBerkas(b.path);
        hasil.dihapus.push(b.path);
        continue;
      }
      /*
       * `historyStore.restore(id)` reads the file it should act on from its own
       * `file` field rather than taking it as an argument — it was written for
       * the Timeline view, which has one file open. A checkpoint spans many, so
       * the field is set to each path in turn.
       *
       * The alternative was changing `restore` to take a path, which would mean
       * touching the Timeline view's only call site for a feature that is not
       * about the Timeline. Setting the field keeps the blast radius here.
       */
      useHistory.setState({ file: b.path });
      const ok = await useHistory.getState().restore(b.snapshotId);
      if (ok) hasil.dipulihkan.push(b.path);
      else hasil.gagal.push({ path: b.path, pesan: 'restore melaporkan gagal' });
    } catch (e) {
      hasil.gagal.push({ path: b.path, pesan: String((e as Error)?.message ?? e) });
    }
  }
  return hasil;
}
