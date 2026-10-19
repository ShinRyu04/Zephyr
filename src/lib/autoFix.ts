/*
 * Auto Fix Lints — run the project's own fixer on what an agent turn changed.
 *
 * ## Where this sits
 *
 * The Rust side (`lint_fix.rs`) knows HOW to fix: it picks the toolchain from the
 * project's manifest and runs that tool. This module decides WHETHER to, and
 * what to do with the report. Keeping the two apart is what lets the Rust part be
 * tested with no settings store and the policy be read in one screen.
 *
 * ## Why the setting is per-surface
 *
 * `autoFixIde` and `autoFixSolo` are separate switches, and the split is real:
 * the EDITOR's AI panel (`composerId === ''`) and the Agents window
 * (`composerId === 'agents'`) are different execution paths. A reader who wants
 * their editor turn formatted is not thereby asking an external agent's pane to
 * rewrite the same files. One shared switch would be a promise this cannot keep.
 *
 * ## Why it runs AFTER the turn, never during
 *
 * A formatter rewrites the file the agent just wrote. Running it between the
 * agent's write and its next read would make the agent read text it did not
 * write — a `multi_edit` whose context no longer matches, failing for a reason
 * that is not in the transcript. After the turn, the agent is done reading and
 * the fixer can only touch the final state.
 *
 * ## Why failure is reported and not thrown
 *
 * A missing toolchain, a formatter that refuses, a project with no manifest: none
 * of these are a failed agent run. The answer is already there and correct. The
 * report is shown as a note; swallowing it entirely would leave a reader
 * believing the code was formatted when it was not.
 */
import * as cmd from './commands';
import { useStore } from './store';
import { useNotif } from './notificationStore';

/** One turn's fix report, kept for the harness and for the chat note. */
export interface LaporanAutoFix {
  /** `editor` or `agents` — which surface asked. */
  permukaan: 'editor' | 'agents';
  /** Files handed to the fixer. */
  diminta: number;
  /** Files the fixer rewrote. */
  berubah: string[];
  /** Tool that ran, or null when no toolchain matched. */
  alat: string | null;
  /** The fixer's own sentence, always populated. */
  pesan: string;
  /** Problems it could not fix. */
  sisa: string[];
  /** Set when the call itself failed (no root, backend refused, ...). */
  galat?: string;
  at: number;
}

/*
 * The last report, module state rather than store state.
 *
 * Written from the agent exit path, which is not a React render, and read by the
 * harness and by the composer's status area. Pushing it into the store would
 * re-render every panel for a note that only one place displays.
 */
let terakhir: LaporanAutoFix | null = null;
export const laporanAutoFixTerakhir = (): LaporanAutoFix | null => terakhir;

/** Which switch governs a surface. */
function saklarUntuk(composerId: string): boolean {
  const conv = useStore.getState().settings.conversation;
  if (composerId === 'agents') return conv?.autoFixSolo === true;
  return conv?.autoFixIde === true;
}

/** Absolute-path check, so a relative path is not silently resolved twice. */
const absolut = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');

/**
 * Run the fixer for one finished turn.
 *
 * `paths` is the turn's own change list (a checkpoint's files). It is EMPTY for
 * a read-only turn, and an empty list is not sent: the Rust side would run the
 * fixer over nothing and report "no change", which reads exactly like a success
 * and would train the reader to ignore the note.
 */
export async function autoFixGiliran(
  composerId: string,
  paths: string[],
): Promise<LaporanAutoFix | null> {
  if (!saklarUntuk(composerId)) return null;
  if (paths.length === 0) return null;

  const permukaan: 'editor' | 'agents' = composerId === 'agents' ? 'agents' : 'editor';
  const akar = useStore.getState().workspace;
  if (!akar) {
    /*
     * No folder open means no project root, and a fixer with no root would have
     * to guess which manifest governs these files. Saying so is better than
     * running `cargo fmt` in whatever directory the process happens to be in.
     */
    const laporan: LaporanAutoFix = {
      permukaan,
      diminta: paths.length,
      berubah: [],
      alat: null,
      pesan: 'No folder is open, so there is no project root to run a fixer from.',
      sisa: [],
      at: Date.now(),
    };
    terakhir = laporan;
    return laporan;
  }

  /*
   * The Rust side takes absolute paths and checks each one resolves inside the
   * root. A relative path from a tool argument is made absolute here, against
   * that same root, so the check compares the path the reader sees with the path
   * that is opened — not two different resolutions of the same string.
   */
  const daftar = paths.map((p) =>
    absolut(p) ? p : `${akar.replace(/[\\/]+$/, '')}\\${p.replace(/\//g, '\\')}`,
  );

  try {
    const r = await cmd.lintFixFiles(akar, daftar);
    const laporan: LaporanAutoFix = {
      permukaan,
      diminta: daftar.length,
      berubah: r.berubah ?? [],
      alat: r.alat ?? null,
      pesan: r.pesan || (r.alat ? `${r.alat}: nothing to change` : 'No fixer found for these files.'),
      sisa: r.sisa ?? [],
      at: Date.now(),
    };
    terakhir = laporan;

    /*
     * A formatter that REWROTE files is worth saying out loud, because the
     * reader's next `git diff` will show changes the agent did not write. A run
     * that changed nothing is not announced: it is the common case, and a toast
     * on every clean turn is noise that hides the one that matters.
     */
    if (laporan.berubah.length > 0) {
      useNotif.getState().notify({
        severity: 'info',
        message: `${laporan.alat ?? 'Fixer'} reformatted ${laporan.berubah.length} file${
          laporan.berubah.length === 1 ? '' : 's'
        }`,
        detail: laporan.berubah.join('\n'),
        source: 'Auto Fix Lints',
      });
    }
    return laporan;
  } catch (e) {
    /*
     * The agent's answer stands. This is a note about formatting, so it must not
     * turn a successful turn red — but it must not vanish either, or the reader
     * would believe the fixer ran.
     */
    const laporan: LaporanAutoFix = {
      permukaan,
      diminta: daftar.length,
      berubah: [],
      alat: null,
      pesan: 'Auto Fix Lints did not run.',
      sisa: [],
      galat: cmd.asZephyrError(e).message,
      at: Date.now(),
    };
    terakhir = laporan;
    return laporan;
  }
}
