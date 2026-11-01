/**
 * Per-tool write tracking for the DiffView surface.
 *
 * ## Why it hooks the dispatch and not each tool
 *
 * The turn already has SEVEN write paths (`write_file`, `multi_edit`,
 * `replace_in_files`, `delete_file`, `move_file`, `copy_file`, `apply_patch`),
 * and every one of them goes through `jalankanAgentTool`. Recording at each call
 * site would mean remembering to add it to the next one - the exact failure
 * `checkpoint.ts` documents. So this wraps the dispatch instead: read the file
 * before the tool runs, read it again after, and let the diff store compute the
 * numbers.
 *
 * ## The "before" is read HERE, not taken from the tool
 *
 * `write_file` and `multi_edit` do read the old content for their own result
 * text, but they keep it locally. Reading it again from disk costs one file read
 * per write and guarantees the snapshot is the state the tool actually saw.
 *
 * Reads and every other tool are ignored: `TOOL_TULIS` is the list of names
 * that can change a file, and a hit on a directory path simply fails to read
 * and is skipped.
 */
import { hitungBaris, useDiff } from '../diffStore';

/**
 * Tool names that can change a file on disk.
 *
 * `apply_patch` is here once, because it covers add/update/delete/move for any
 * number of paths; the paths it touched are recovered from its argument, not
 * from its result text.
 */
const TOOL_TULIS = new Set([
  'write_file',
  'multi_edit',
  'edit',
  'replace_in_files',
  'delete_file',
  'move_file',
  'copy_file',
  'apply_patch',
]);

/** Paths a call will write, best-effort, before it runs. */
/** Diekspor: `pathDitulis` di subagentStore mendelegasikan ke sini supaya
    daftar nama tool penulis hanya hidup di SATU tempat — dulu subagent
    memegang salinannya sendiri dan kehilangan `edit` + `apply_patch`, sehingga
    dua worker bisa saling menimpa berkas yang sama tanpa klaim. */
export function pathTersentuh(nama: string, args: Record<string, unknown>): string[] {
  const satu = (k: string): string[] => (typeof args[k] === 'string' ? [args[k] as string] : []);

  if (nama === 'multi_edit' || nama === 'edit' || nama === 'write_file' || nama === 'delete_file')
    return satu('path');
  if (nama === 'move_file' || nama === 'copy_file') return [...satu('from'), ...satu('to')];
  /*
   * `replace_in_files` searches for its own matches, so its target set is not
   * known until it has run. It is handled by the AFTER side only: the paths come
   * from the result's file list, and their "before" is taken from the read cache
   * the search already filled... which is not exposed. Instead the before side
   * is skipped for this tool and the entry is created after the fact with a
   * null before - honest ("we did not capture it") rather than invented.
   */
  if (nama === 'replace_in_files') return [];
  if (nama === 'apply_patch') {
    const patch = typeof args.patch === 'string' ? args.patch : '';
    const hasil: string[] = [];
    const pola = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
    for (let m = pola.exec(patch); m; m = pola.exec(patch)) hasil.push(m[1].trim());
    const pindah = /^\*\*\* Move to: (.+)$/gm;
    for (let m = pindah.exec(patch); m; m = pindah.exec(patch)) hasil.push(m[1].trim());
    return hasil;
  }
  return [];
}

/** Paths a call DID write, read back from its result text. */
function pathDariHasil(nama: string, hasil: string): string[] {
  if (nama !== 'replace_in_files') return [];
  /*
   * The result is a header line followed by one `  <path>  (N penggantian)`
   * row per file. Only the rows count: the header and the failure footer do
   * not start with two spaces followed by a path and a count.
   */
  const out: string[] = [];
  const pola = /^ {2}(.+?) {2}\((\d+) penggantian\)$/gm;
  for (let m = pola.exec(hasil); m; m = pola.exec(hasil)) out.push(m[1]);
  return out;
}

export interface PerubahanTool {
  /**
   * Wrap one tool dispatch. Returns the result unchanged; the snapshot is a
   * side effect.
   */
  jalankan: (
    nama: string,
    args: Record<string, unknown>,
    eksekusi: () => Promise<string>,
  ) => Promise<string>;
}

let jembatan: { baca: (p: string) => Promise<string | null> } | null = null;

/**
 * Reads queued behind each other, one file at a time.
 *
 * The tracker reads a file before a tool and again after it. Those reads use
 * the same `fsRead` command as everything else, so on a fast model a `write_file`
 * arrives while the "before" read of the NEXT file is still in flight; two
 * overlapping reads of the same path can then return the post-write content for
 * the "before" snapshot, and the file shows up as unchanged.
 *
 * Serialising the reads costs one extra round trip per write and removes the
 * the race entirely. It does not serialise the TOOLS - each tool still runs as
 * soon as its own snapshot is in hand.
 */
let antrean: Promise<unknown> = Promise.resolve();

function antre<T>(kerja: () => Promise<T>): Promise<T> {
  const berikut = antrean.then(kerja, kerja);
  /* Keep the chain alive even when this link rejects, or every later read
     would inherit the rejection. */
  antrean = berikut.catch(() => undefined);
  return berikut;
}

/**
 * The reader is injected rather than imported so this module stays usable from
 * a test harness that has no Tauri bridge (see `scripts/uji-diff.mjs`).
 */
export function pasangJembatanBacaDiff(baca: (p: string) => Promise<string | null>): void {
  jembatan = { baca };
}

function baca(p: string): Promise<string | null> {
  return antre(async () => {
    if (!jembatan) return null;
    try {
      return await jembatan.baca(p);
    } catch {
      return null;
    }
  });
}

/**
 * Angka diff SATU tulisan terakhir per path (+n/−n), untuk kartu berkas di
 * transkrip tab "Task N" (acuan 022709: "# aim-models.css +1 -1 M Applied").
 *
 * Dihitung dari isi sebelum vs sesudah yang sudah dibaca di sini — bukan dari
 * klaim tool. Path yang tidak bisa dibaca (direktori, hapus berkas yang memang
 * sudah tidak ada) TIDAK punya entri, jadi kartunya tidak menampilkan angka
 * karangan.
 */
const statTerkini = new Map<string, { tambah: number; hapus: number }>();

export function ambilStatTerkini(path: string): { tambah: number; hapus: number } | null {
  return statTerkini.get(path) ?? null;
}

export const perubahanTool: PerubahanTool = {
  jalankan: async (nama, args, eksekusi) => {
    if (!TOOL_TULIS.has(nama)) return eksekusi();

    const sebelum = new Map<string, string | null>();
    for (const p of pathTersentuh(nama, args)) {
      const isi = await baca(p);
      sebelum.set(p, isi);
      useDiff.getState().catatSebelum(p, isi);
    }

    let hasil: string;
    let gagal = false;
    try {
      hasil = await eksekusi();
    } catch (e) {
      gagal = true;
      throw e;
    } finally {
      /*
       * The AFTER side runs even on failure: a tool that threw halfway may
       * still have written a file (a patch writes before it verifies the next
       * one), and a card that claims nothing changed would be wrong.
       */
      const kini = new Map<string, string | null>();
      for (const p of sebelum.keys()) kini.set(p, gagal ? null : await baca(p));
      for (const p of pathDariHasil(nama, gagal ? '' : (hasil ?? ''))) {
        if (!sebelum.has(p)) sebelum.set(p, null);
        kini.set(p, await baca(p));
      }
      for (const [p] of sebelum) {
        /*
         * A path that could not be read before and cannot be read now (a
         * directory, or a delete of a file that was already gone) carries no
         * information - leave it out rather than draw an empty row.
         */
        const isiSekarang = kini.get(p) ?? null;
        if (sebelum.get(p) === null && isiSekarang === null) continue;
        /* Angka diff per-tulisan. Salah satu sisi `null` = tidak ada
           perbandingan yang jujur, jadi entri lama dibuang alih-alih dipertahankan
           (angka langkah sebelumnya akan terbaca sebagai hasil langkah ini). */
        const isiSebelum = sebelum.get(p) ?? null;
        if (isiSebelum !== null && isiSekarang !== null) {
          statTerkini.set(p, hitungBaris(isiSebelum, isiSekarang));
        } else {
          statTerkini.delete(p);
        }
        useDiff.getState().catatSesudah(p, isiSekarang, gagal);
      }
    }
    return hasil;
  },
};
