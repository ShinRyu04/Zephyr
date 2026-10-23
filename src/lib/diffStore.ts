/**
 * What the AI changed this turn - the data behind the "files changed" card and
 * the DiffView tab.
 *
 * ## Why a snapshot instead of `git diff`
 *
 * `git diff` only answers inside a repository, and only for the working tree
 * against the index. The AI also writes into folders that are not repos, and a
 * turn can touch a file the user had already modified before the run - neither
 * shows up honestly in `git diff`. So this records the file's content as it was
 * BEFORE the first write of this turn, then compares that against the content
 * after the write finished. The result is the AI's own change, with nothing
 * else mixed in.
 *
 * ## Scope
 *
 * One snapshot per turn. The turn resets the list, so the DiffView tab always
 * describes the run that just finished, not a pile of runs from the whole
 * session. (The transcript's "files changed" card is wider - it covers the
 * whole chat - but it reads the tool rows for that, and only borrows the
 * numbers here for the files the store actually captured.)
 *
 * Snapshots live in memory only: they mirror files the user already owns, they
 * are worthless after a restart, and writing them to `%APPDATA%` would leave
 * copies of source code behind.
 */
import { create } from 'zustand';

/** One file the turn changed, with both sides captured. */
export interface DiffBerkas {
  /** Absolute path, as the tool named it. */
  path: string;
  /** Content before the first write this turn; null for a file that did not exist. */
  sebelum: string | null;
  /** Content after the last write this turn; null when the file was deleted. */
  sesudah: string | null;
  tambah: number;
  hapus: number;
  /** The write that produced this entry failed - kept so the card can say so. */
  gagal?: boolean;
}

interface DiffState {
  turnId: string;
  berkas: DiffBerkas[];
  /** Paths already captured this turn - the "before" is the FIRST state seen. */
  sudah: Set<string>;

  mulaiTurn: (turnId: string) => void;
  /** Record the pre-write content, once per path per turn. */
  catatSebelum: (path: string, isi: string | null) => void;
  /** Record the post-write content and the numbers that follow from it. */
  catatSesudah: (path: string, isi: string | null, gagal?: boolean) => void;
  /**
   * The file the DiffView tab should select, when the card was opened from a
   * specific row. Empty means "no preference - show the first file".
   */
  sorot: string;
  pilih: (path: string) => void;
  /**
   * Drop one file from the list. Used by the Diff View's AI Changes tab after
   * the reader either keeps the change as it is or reverts it to `sebelum` -
   * in both cases there is nothing left to review for that path.
   */
  buang: (path: string) => void;
  reset: () => void;
}

function splitBaris(isi: string): string[] {
  const baris = isi.split('\n');
  if (baris.length > 0 && baris[baris.length - 1] === '') baris.pop();
  return baris;
}

/**
 * Line counts in the shape the diff shows them.
 *
 * Compared from a common prefix and a common suffix, which is what a reader
 * means by "these lines were added": everything between the two is the changed
 * block. Not a minimal edit script (that needs an LCS and buys nothing on file
 * edits), but the block is what a diff would draw anyway.
 */
export function hitungBaris(
  sebelum: string | null,
  sesudah: string | null,
): { tambah: number; hapus: number } {
  const a = sebelum === null ? [] : splitBaris(sebelum);
  const b = sesudah === null ? [] : splitBaris(sesudah);
  let depan = 0;
  while (depan < a.length && depan < b.length && a[depan] === b[depan]) depan++;
  let belakang = 0;
  while (
    belakang < a.length - depan &&
    belakang < b.length - depan &&
    a[a.length - 1 - belakang] === b[b.length - 1 - belakang]
  )
    belakang++;
  return { hapus: a.length - depan - belakang, tambah: b.length - depan - belakang };
}

/**
 * The file paths one tool call was responsible for.
 *
 * Needed because the numbers shown on a tool row must be that call's own, not
 * the turn's running total - otherwise the tenth edit of a file reports all
 * ten edits and the rows stop adding up to the card at the bottom.
 *
 * `replace_in_files` is the awkward one: its targets are only known after it
 * has searched, so they are read from the result rows (`  <path>  (N penggantian)`).
 */
export function pathDariPanggilan(
  nama: string,
  args: Record<string, unknown>,
  hasil: string,
): string[] {
  if (nama === 'replace_in_files') {
    const out: string[] = [];
    const pola = /^ {2}(.+?) {2}\(\d+ penggantian\)$/gm;
    for (let m = pola.exec(hasil); m; m = pola.exec(hasil)) out.push(m[1]);
    return out;
  }
  const satu = (k: string): string[] => (typeof args[k] === 'string' ? [args[k] as string] : []);
  if (nama === 'move_file' || nama === 'copy_file') return [...satu('from'), ...satu('to')];
  if (nama === 'apply_patch') {
    const patch = typeof args.patch === 'string' ? args.patch : '';
    const out: string[] = [];
    for (const pola of [
      /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm,
      /^\*\*\* Move to: (.+)$/gm,
    ]) {
      for (let m = pola.exec(patch); m; m = pola.exec(patch)) out.push(m[1].trim());
    }
    return out;
  }
  return satu('path');
}

export const useDiff = create<DiffState>()((set, get) => ({
  turnId: '',
  berkas: [],
  sudah: new Set<string>(),
  sorot: '',

  mulaiTurn: (turnId) => set({ turnId, berkas: [], sudah: new Set<string>() }),

  pilih: (path) => set({ sorot: path }),

  catatSebelum: (path, isi) => {
    const { sudah, berkas } = get();
    if (sudah.has(path)) return;
    const berikut = new Set(sudah);
    berikut.add(path);
    set({
      sudah: berikut,
      berkas: [...berkas, { path, sebelum: isi, sesudah: null, tambah: 0, hapus: 0 }],
    });
  },

  catatSesudah: (path, isi, gagal) => {
    const ada = get().berkas.find((b) => b.path === path);
    if (!ada) return;
    const { tambah, hapus } = hitungBaris(ada.sebelum, isi);
    set((s) => ({
      berkas: s.berkas.map((b) =>
        b.path === path ? { ...b, sesudah: isi, tambah, hapus, gagal } : b,
      ),
    }));
  },

  buang: (path) =>
    set((s) => ({
      berkas: s.berkas.filter((b) => b.path !== path),
      /* `sudah` sengaja TIDAK dihapus: kalau agen menulis berkas yang sama
         lagi di giliran ini, "sebelum" tetap harus isi sebelum tulisan
         pertama, bukan isi hasil revert. */
    })),

  reset: () => set({ turnId: '', berkas: [], sudah: new Set<string>() }),
}));

/**
 * The snapshot list, for components that only read it.
 *
 * Selecting `berkas` directly is safe here ONLY because the store replaces the
 * array on every write instead of mutating it, so the reference changes exactly
 * when the contents do. A selector that built a new array (`.map`, `.filter`)
 * would re-render forever under zustand v5 - the lesson from the AI panel.
 */
export const useDiffBerkas = (): DiffBerkas[] => useDiff((s) => s.berkas);
