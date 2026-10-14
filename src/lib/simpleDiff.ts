export type DiffKind = 'same' | 'add' | 'del';

export interface DiffRow {
  kind: DiffKind;
  text: string;

  a: number | null;

  b: number | null;
}

const AMBANG = 4000;

export function barisDiff(lama: string, baru: string): DiffRow[] {
  const a = lama.split('\n');
  const b = baru.split('\n');
  const out: DiffRow[] = [];

  if (a.length > AMBANG || b.length > AMBANG) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) out.push({ kind: 'same', text: a[i] ?? '', a: i + 1, b: i + 1 });
      else {
        if (a[i] !== undefined) out.push({ kind: 'del', text: a[i], a: i + 1, b: null });
        if (b[i] !== undefined) out.push({ kind: 'add', text: b[i], a: null, b: i + 1 });
      }
    }
    return out;
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i], a: i + 1, b: null });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j], a: null, b: j + 1 });
      j++;
    }
  }
  while (i < m) out.push({ kind: 'del', text: a[i], a: i + 1, b: null }), i++;
  while (j < n) out.push({ kind: 'add', text: b[j], a: null, b: j + 1 }), j++;
  return out;
}

export function ringkasDiff(rows: DiffRow[]): { tambah: number; hapus: number } {
  let tambah = 0;
  let hapus = 0;
  for (const r of rows) {
    if (r.kind === 'add') tambah++;
    else if (r.kind === 'del') hapus++;
  }
  return { tambah, hapus };
}

/* ── Per-hunk accept / reject ─────────────────────────────────────────────
 *
 * ## Why hunks and not lines
 *
 * A line is too small to decide on. `del "let x = 1"` / `add "let x = 2"` is
 * ONE change written as two rows; accepting the addition while rejecting the
 * deletion would leave both lines in the file. A hunk — a run of adjacent
 * changed rows with the unchanged lines around it — is the smallest unit whose
 * accept/reject has a coherent meaning.
 *
 * ## Why the unchanged rows between hunks are not part of one
 *
 * They carry no decision. Grouping them in would make two changes separated by
 * a single unchanged line into one hunk, so a reader wanting the first and not
 * the second would have no way to say so.
 */

export interface Hunk {
  /** Stable index, used as the selection key. */
  id: number;
  /** Indices into the `rows` array this hunk covers. */
  rows: number[];
  tambah: number;
  hapus: number;
}

/**
 * Group a diff into hunks.
 *
 * A hunk is a maximal run of consecutive non-`same` rows. Two changed runs
 * separated by even one unchanged line are separate hunks, so they can be
 * decided independently.
 */
export function bagiHunk(rows: DiffRow[]): Hunk[] {
  const out: Hunk[] = [];
  let kini: Hunk | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.kind === 'same') {
      kini = null;
      continue;
    }
    if (!kini) {
      kini = { id: out.length, rows: [], tambah: 0, hapus: 0 };
      out.push(kini);
    }
    kini.rows.push(i);
    if (r.kind === 'add') kini.tambah += 1;
    else kini.hapus += 1;
  }
  return out;
}

/**
 * Rebuild the text with only the accepted hunks applied.
 *
 * The rule is one line per row kind, and each is the whole semantics:
 *
 *   * `same`  — always emitted; it is not part of any decision.
 *   * `add`   — emitted only when its hunk is accepted. A rejected addition is
 *               simply not there, which is what "reject" means for new text.
 *   * `del`   — emitted only when its hunk is REJECTED. The old line stays
 *               because the change that would have removed it was refused.
 *
 * That inversion on `del` is the part that is easy to get backwards, and
 * getting it backwards produces a file that is missing lines the reader never
 * agreed to lose.
 */
export function terapkanHunk(rows: DiffRow[], diterima: ReadonlySet<number>): string {
  const pemilik = new Map<number, number>();
  for (const h of bagiHunk(rows)) {
    for (const i of h.rows) pemilik.set(i, h.id);
  }

  const keluar: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.kind === 'same') {
      keluar.push(r.text);
      continue;
    }
    const punya = pemilik.get(i);
    const ok = punya !== undefined && diterima.has(punya);
    if (r.kind === 'add' ? ok : !ok) keluar.push(r.text);
  }
  return keluar.join('\n');
}

/** Which hunks a full-accept set contains, for the default state. */
export function semuaHunk(hunks: Hunk[]): Set<number> {
  return new Set(hunks.map((h) => h.id));
}
