/**
 * `apply_patch` — many file edits in ONE call, in OpenCode's own patch format.
 *
 * ## Why this exists
 *
 * Writing a feature means touching several files. With only `write_file` and
 * `multi_edit`, that is one tool call per file: the agent spends its step budget
 * on plumbing, and a single failure halfway through leaves the workspace in a
 * state nobody described. OpenCode solves this with `apply_patch`, and the
 * format below is deliberately THEIRS - `*** Begin Patch` / `*** Update File:` /
 * `*** Add File:` / `*** Delete File:` / `*** Move to:` - so an agent that has
 * used either tool can move between them without relearning the grammar.
 *
 * ## The format
 *
 *   *** Begin Patch
 *   *** Add File: src/baru.ts
 *   +baris pertama
 *   +baris kedua
 *   *** Update File: src/lama.ts
 *   @@ fungsiYangBerubah
 *    konteks yang tidak berubah
 *   -baris lama
 *   +baris baru
 *   *** Delete File: src/basi.ts
 *   *** Move to: src/pindah.ts
 *   *** End Patch
 *
 * Hunk `@@` carries a CONTEXT LABEL, not line numbers. Line numbers go stale the
 * moment an earlier hunk in the same patch changes the file; a label plus the
 * surrounding context lines is what the file actually still looks like. If the
 * context does not match, the whole patch is refused - see "atomic" below.
 *
 * ## Atomic, and honest about it
 *
 * Every file is validated BEFORE anything is written: parse, guard, read, apply,
 * verify the result. Only when all of them succeed does the write phase start.
 * A patch that touches four files and fails on the third therefore writes
 * NOTHING - the alternative is a half-applied change that the agent then
 * describes as if it were complete.
 *
 * ## What it will not do
 *
 * It never invents a file that the patch does not name, never creates a
 * directory outside the workspace, and never "fixes" a context mismatch by
 * guessing where the hunk was meant to go. A mismatch is reported with the
 * label and the first differing line, because that is the information needed to
 * write a correct patch.
 */
import type { AgentTool } from '../agentTools';
import { periksaTulis } from '../agentGuard.ts';

/** One hunk: a context label plus the lines to replace. */
interface Hunk {
  /** The text after `@@`, used only for the error message and as a hint. */
  label: string;
  /** Context lines (unchanged), `-` removals, `+` additions - in patch order. */
  baris: { jenis: ' ' | '-' | '+'; teks: string }[];
}

type Operasi =
  | { jenis: 'add'; path: string; isi: string[] }
  | { jenis: 'update'; path: string; hunks: Hunk[] }
  | { jenis: 'delete'; path: string }
  | { jenis: 'move'; dari: string; ke: string; hunks: Hunk[] };

export interface PatchBridge {
  /** Read a file; returns null when it does not exist. */
  baca: (path: string) => Promise<string | null>;
  /** Write a file, creating parent folders. */
  tulis: (path: string, isi: string) => Promise<void>;
  /** Delete a file. */
  hapus: (path: string) => Promise<void>;
  /** Whether a path exists (used to refuse `Add` over an existing file). */
  ada: (path: string) => Promise<boolean>;
}

/** Parse failure, with the line number that caused it. */
class PatchError extends Error {
  readonly baris: number;
  constructor(message: string, baris: number) {
    super(message);
    this.baris = baris;
  }
}

/**
 * Parse a patch into operations.
 *
 * Strict on purpose: an unknown directive is an ERROR, not a line to skip. A
 * lenient parser turns a typo (`*** UpdateFile:`) into a silently empty patch,
 * and the agent then reports success for work it never did.
 */
export function parsePatch(teks: string): Operasi[] {
  const baris = teks.split(/\r?\n/);
  const ops: Operasi[] = [];
  let i = 0;

  const mulai = baris.findIndex((b) => b.trim() === '*** Begin Patch');
  if (mulai < 0) throw new PatchError('patch tidak dibuka dengan "*** Begin Patch"', 1);
  i = mulai + 1;

  let sekarang: Operasi | null = null;
  let hunkAktif: Hunk | null = null;
  let pindahKe: string | null = null;

  const tutupHunk = () => {
    if (hunkAktif && sekarang && sekarang.jenis === 'update') sekarang.hunks.push(hunkAktif);
    if (hunkAktif && sekarang && sekarang.jenis === 'move') sekarang.hunks.push(hunkAktif);
    hunkAktif = null;
  };
  const tutupOperasi = () => {
    tutupHunk();
    if (sekarang) {
      if (sekarang.jenis === 'move') {
        if (!pindahKe) throw new PatchError('"*** Move to:" tanpa tujuan', i + 1);
        sekarang.ke = pindahKe;
      }
      ops.push(sekarang);
    }
    sekarang = null;
    pindahKe = null;
  };

  for (; i < baris.length; i++) {
    const b = baris[i];
    const t = b.trimEnd();

    if (t.trim() === '*** End Patch') {
      tutupOperasi();
      return ops;
    }
    if (t.startsWith('*** Add File: ')) {
      tutupOperasi();
      sekarang = { jenis: 'add', path: t.slice('*** Add File: '.length).trim(), isi: [] };
      continue;
    }
    if (t.startsWith('*** Update File: ')) {
      tutupOperasi();
      sekarang = { jenis: 'update', path: t.slice('*** Update File: '.length).trim(), hunks: [] };
      continue;
    }
    if (t.startsWith('*** Delete File: ')) {
      tutupOperasi();
      sekarang = { jenis: 'delete', path: t.slice('*** Delete File: '.length).trim() };
      continue;
    }
    if (t.startsWith('*** Move to: ')) {
      if (!sekarang) throw new PatchError('"*** Move to:" tanpa "*** Update File:" di atasnya', i + 1);
      if (sekarang.jenis !== 'update') {
        throw new PatchError('"*** Move to:" hanya sah setelah "*** Update File:"', i + 1);
      }
      pindahKe = t.slice('*** Move to: '.length).trim();
      /* Re-tag the operation: a move is an update with a destination. */
      sekarang = { jenis: 'move', dari: sekarang.path, ke: '', hunks: sekarang.hunks };
      continue;
    }
    if (t.startsWith('@@')) {
      tutupHunk();
      hunkAktif = { label: t.slice(2).trim(), baris: [] };
      continue;
    }

    /* Body lines. */
    if (!sekarang) {
      if (!t.trim()) continue;
      throw new PatchError(`baris di luar operasi: ${t.slice(0, 40)}`, i + 1);
    }
    if (sekarang.jenis === 'add') {
      if (!t.startsWith('+')) {
        if (!t.trim()) continue;
        throw new PatchError('baris berkas baru harus dimulai dengan "+"', i + 1);
      }
      sekarang.isi.push(t.slice(1));
      continue;
    }
    if (sekarang.jenis === 'delete') {
      if (!t.trim()) continue;
      throw new PatchError('"*** Delete File:" tidak menerima isi', i + 1);
    }

    /* update / move: hunk body. */
    if (!hunkAktif) {
      if (!t.trim()) continue;
      throw new PatchError('baris perubahan tanpa "@@" di atasnya', i + 1);
    }
    const tanda = t[0];
    if (tanda === ' ' || tanda === '+' || tanda === '-') {
      hunkAktif.baris.push({ jenis: tanda, teks: t.slice(1) });
      continue;
    }
    if (!t.trim()) {
      /* An empty line inside a hunk is a context line with no content. */
      hunkAktif.baris.push({ jenis: ' ', teks: '' });
      continue;
    }
    throw new PatchError(`baris hunk harus dimulai spasi, "+", atau "-": ${t.slice(0, 40)}`, i + 1);
  }

  throw new PatchError('patch tidak ditutup dengan "*** End Patch"', baris.length);
}

/**
 * Apply one hunk to file content.
 *
 * The hunk's CONTEXT and REMOVED lines must appear consecutively, in order,
 * exactly once. Anything else is refused:
 *   - not found      -> the file changed since the patch was written
 *   - found twice    -> the patch is ambiguous; guessing would edit the wrong one
 */
export function terapkanHunk(isi: string[], hunk: Hunk): string[] {
  const cari = hunk.baris.filter((b) => b.jenis !== '+').map((b) => b.teks);
  if (cari.length === 0) {
    throw new Error(`hunk "@@ ${hunk.label}" tidak punya baris konteks atau penghapusan - tidak bisa diposisikan`);
  }

  const cocok: number[] = [];
  for (let i = 0; i + cari.length <= isi.length; i++) {
    let sama = true;
    for (let j = 0; j < cari.length; j++) {
      if (isi[i + j] !== cari[j]) {
        sama = false;
        break;
      }
    }
    if (sama) cocok.push(i);
  }

  if (cocok.length === 0) {
    throw new Error(
      `hunk "@@ ${hunk.label}" tidak cocok dengan isi berkas - baris konteksnya tidak ditemukan. ` +
        `Berkas mungkin sudah berubah sejak patch ditulis; baca ulang lalu tulis patch baru.`,
    );
  }
  if (cocok.length > 1) {
    throw new Error(
      `hunk "@@ ${hunk.label}" cocok di ${cocok.length} tempat (baris ${cocok.map((n) => n + 1).join(', ')}) - ` +
        `ambigu. Tambahkan baris konteks di sekitarnya supaya tepat satu yang cocok.`,
    );
  }

  const mulai = cocok[0];
  const baru = hunk.baris.filter((b) => b.jenis !== '-').map((b) => b.teks);
  const salinan = [...isi];
  salinan.splice(mulai, cari.length, ...baru);
  return salinan;
}

export function buatApplyPatchTool(bridge: PatchBridge): AgentTool {
  return {
    spec: {
      name: 'apply_patch',
      description:
        'Ubah BANYAK berkas dalam SATU panggilan, memakai format patch OpenCode. ' +
        'Direktif: "*** Begin Patch" lalu satu atau lebih dari "*** Add File: <path>" (tiap baris isi diawali "+"), "*** Update File: <path>" (hunks dengan "@@ label" lalu baris konteks diawali spasi, "-" untuk hapus, "+" untuk tambah), "*** Delete File: <path>", dan "*** Move to: <path>" setelah Update File untuk memindahkan. Ditutup "*** End Patch". ' +
        'ATOMIK: semua berkas divalidasi dulu; kalau satu gagal, TIDAK ADA yang ditulis. ' +
        'Konteks hunk harus cocok tepat satu tempat - kalau tidak, patch ditolak dan tidak ada yang berubah. ' +
        'Pakai ini untuk perubahan yang menyentuh beberapa berkas sekaligus; untuk satu berkas kecil, multi_edit lebih ringkas.',
      parameters: {
        type: 'object',
        properties: {
          patch: {
            type: 'string',
            description: 'Isi patch lengkap, dari "*** Begin Patch" sampai "*** End Patch".',
          },
        },
        required: ['patch'],
      },
    },
    run: async (a) => {
      const teks = String(a.patch ?? '');
      if (!teks.trim()) throw new Error('ERROR: apply_patch butuh "patch".');

      let ops: Operasi[];
      try {
        ops = parsePatch(teks);
      } catch (e) {
        const p = e as PatchError;
        throw new Error(`ERROR: patch tidak bisa dibaca di baris ${p.baris}: ${p.message}`);
      }
      if (ops.length === 0) throw new Error('ERROR: patch tidak memuat satu pun operasi.');

      /*
       * PHASE 1 - validate everything, write nothing.
       *
       * Each entry holds the final content for one path. A failure here means
       * the workspace is still exactly as it was.
       */
      const rencana: { path: string; isi: string[] | null; hapus: boolean; dari?: string }[] = [];

      for (const op of ops) {
        const path = op.jenis === 'move' ? op.dari : op.path;

        /* Guard every path the patch touches, before any read or write. */
        const cek = periksaTulis(path);
        if (!cek.ok) throw new Error(`ERROR: ${cek.alasan} (${path})`);
        if (op.jenis === 'move') {
          const cekTujuan = periksaTulis(op.ke);
          if (!cekTujuan.ok) throw new Error(`ERROR: ${cekTujuan.alasan} (${op.ke})`);
        }

        if (op.jenis === 'add') {
          if (await bridge.ada(path)) {
            throw new Error(
              `ERROR: "${path}" sudah ada. "*** Add File:" hanya untuk berkas baru - ` +
                `pakai "*** Update File:" kalau maksudnya mengubah.`,
            );
          }
          rencana.push({ path, isi: op.isi, hapus: false });
          continue;
        }

        if (op.jenis === 'delete') {
          if (!(await bridge.ada(path))) {
            throw new Error(`ERROR: "${path}" tidak ada, jadi tidak bisa dihapus.`);
          }
          rencana.push({ path, isi: null, hapus: true });
          continue;
        }

        const isiAsli = await bridge.baca(path);
        if (isiAsli === null) {
          throw new Error(`ERROR: "${path}" tidak ada, jadi tidak bisa diubah.`);
        }
        let baris = isiAsli.split(/\r?\n/);
        for (const h of op.hunks) baris = terapkanHunk(baris, h);

        if (op.jenis === 'move') {
          rencana.push({ path: op.ke, isi: baris, hapus: false, dari: path });
          rencana.push({ path, isi: null, hapus: true });
        } else {
          rencana.push({ path, isi: baris, hapus: false });
        }
      }

      /*
       * PHASE 2 - write. Ordered so a move writes its destination BEFORE
       * deleting its source: a crash between the two leaves a copy, which is
       * recoverable, instead of no file at all.
       */
      const tulisDulu = rencana.filter((r) => !r.hapus);
      const hapusKemudian = rencana.filter((r) => r.hapus);
      for (const r of tulisDulu) await bridge.tulis(r.path, (r.isi ?? []).join('\n'));
      for (const r of hapusKemudian) await bridge.hapus(r.path);

      const ringkas = rencana.map((r) =>
        r.hapus ? `hapus ${r.path}${r.dari ? ` (pindah dari ${r.dari})` : ''}` : `tulis ${r.path}`,
      );
      return (
        `Patch diterapkan: ${ops.length} operasi, ${ringkas.length} perubahan berkas.\n` +
        ringkas.map((s) => `- ${s}`).join('\n')
      );
    },
  };
}
