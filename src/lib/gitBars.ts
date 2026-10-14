/**
 * Git change bars in the gutter — added, modified and deleted lines.
 *
 * ## Why the gutter and not the panel
 *
 * The Source Control panel lists FILES. That tells the reader which files moved
 * but not where inside them, so reviewing your own work — or an agent's — means
 * opening the diff view file by file. The bars answer "where" directly, in the
 * buffer that is already open, and they keep answering as the file is edited.
 *
 * ## Why parse the patch rather than ask git again
 *
 * `git diff` already computed the whole answer. A second command that reported
 * line numbers would be a second implementation of the same diff, and the two
 * would eventually disagree about a rename, a whitespace-only change or a
 * binary file. One source is what keeps the bars and the diff view honest about
 * each other.
 *
 * ## The three states, and how they are told apart
 *
 * A unified diff marks a changed block as a run of `-` lines followed by a run
 * of `+` lines. From that:
 *
 *   * `+` with no `-` before it in the same hunk  -> ADDED
 *   * `+` paired with a `-` run                   -> MODIFIED
 *   * `-` with no `+` after it                    -> DELETED, and the bar goes
 *     on the line BELOW the gap, because there is no line to mark — the code
 *     that was there is gone.
 *
 * That last case is why a naive "mark every + line" pass is not enough: a pure
 * deletion would render nothing at all, and the reader would not know a line had
 * been removed.
 */
import { GutterMarker, gutter } from '@codemirror/view';
import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';

export type JenisBaris = 'added' | 'modified' | 'deleted';

export interface BarisUbah {
  /** 1-based line in the CURRENT buffer the bar is drawn on. */
  line: number;
  jenis: JenisBaris;
}

/**
 * Parse a unified diff into gutter positions.
 *
 * Only the NEW-file line numbers matter here — the bars are drawn on the
 * buffer as it is now, which is the new side of the patch. Old-side numbers are
 * read solely to know how many lines a `-` run removed.
 */
export function parseDiff(patch: string): BarisUbah[] {
  const keluar: BarisUbah[] = [];
  if (!patch) return keluar;

  const baris = patch.split('\n');
  /** Current line number on the new side, while inside a hunk. */
  let baru = 0;
  /** `-` lines seen since the last `+` line, within the current hunk. */
  let hapusSejakTambah = 0;
  /** True once a `-` has been seen with no `+` yet — makes the first `+` a
   *  modification rather than an addition. */
  let adaHapus = false;
  let dalamHunk = false;

  for (const l of baris) {
    if (l.startsWith('@@')) {
      /*
       * `@@ -a,b +c,d @@` — take c as the first new-side line.
       *
       * Also closes the previous hunk: a deletion left dangling at the end of
       * one hunk must not pair with an addition at the start of the next.
       */
      if (dalamHunk && hapusSejakTambah > 0) {
        keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });
      }
      hapusSejakTambah = 0;
      adaHapus = false;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
      if (!m) {
        dalamHunk = false;
        continue;
      }
      baru = Number(m[1]);
      dalamHunk = true;
      continue;
    }
    if (!dalamHunk) continue;
    /* `\ No newline at end of file` is a marker about the previous line, not a
       line of its own — counting it would shift every bar below it by one. */
    if (l.startsWith('\\')) continue;

    if (l.startsWith('+')) {
      keluar.push({ line: baru, jenis: adaHapus ? 'modified' : 'added' });
      baru += 1;
      /* The pairing is consumed: a second `+` after one `-` run is an addition
         again, not another modification of the same removed line. */
      hapusSejakTambah = 0;
      adaHapus = false;
    } else if (l.startsWith('-')) {
      hapusSejakTambah += 1;
      adaHapus = true;
    } else if (l.startsWith(' ') || l === '') {
      /* Context. A pending `-` run that never met a `+` is a pure deletion. */
      if (hapusSejakTambah > 0) {
        keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });
        hapusSejakTambah = 0;
        adaHapus = false;
      }
      baru += 1;
    }
  }
  /* A deletion at the very end of the last hunk. */
  if (dalamHunk && hapusSejakTambah > 0) keluar.push({ line: Math.max(1, baru), jenis: 'deleted' });

  return keluar;
}

class BarMarker extends GutterMarker {
  constructor(readonly jenis: JenisBaris) {
    super();
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-gitbar is-${this.jenis}`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const MARKER: Record<JenisBaris, BarMarker> = {
  added: new BarMarker('added'),
  modified: new BarMarker('modified'),
  deleted: new BarMarker('deleted'),
};

/** Cap on how many bars are drawn; a reindented file can touch every line. */
const BAR_MAX = 3000;

function barRanges(list: BarisUbah[], docLines: number): RangeSet<GutterMarker> {
  const ranges = [];
  /* One bar per line: a line that is both "deleted here" and "modified here"
     (a delete and an add landing on the same line number) takes the stronger
     signal, which is `modified` — something is still there to look at. */
  const perBaris = new Map<number, JenisBaris>();
  for (const b of list) {
    if (b.line < 1 || b.line > docLines) continue;
    const ada = perBaris.get(b.line);
    if (ada === 'modified') continue;
    perBaris.set(b.line, b.jenis === 'modified' ? 'modified' : (ada ?? b.jenis));
  }
  for (const [line, jenis] of [...perBaris.entries()].sort((a, b) => a[0] - b[0]).slice(0, BAR_MAX)) {
    ranges.push(MARKER[jenis].range(line));
  }
  return RangeSet.of(ranges, true);
}

const setBars = StateEffect.define<BarisUbah[]>();

export const barsField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(val, tr) {
    const efek = tr.effects.find((e) => e.is(setBars));
    if (efek) return barRanges(efek.value, tr.state.doc.lines);
    /*
     * A doc change drops the bars rather than shifting them.
     *
     * Mapping would keep them roughly in place, but "roughly" is the problem:
     * after an edit the stored line numbers describe a diff against HEAD that
     * no longer matches the buffer, so a mapped bar says "you changed this
     * line" about a line the reader did not touch. The caller re-fetches after
     * a save; until then, no bars is the honest state.
     */
    if (tr.docChanged) return RangeSet.empty;
    return val;
  },
});

export const gitBarGutter: Extension = [
  barsField,
  gutter({
    class: 'cm-gitbar-gutter',
    markers: (view) => view.state.field(barsField, false) ?? RangeSet.empty,
    initialSpacer: () => MARKER.added,
  }),
];

/** Replace the bars in one transaction. */
export function setBarsEffect(list: BarisUbah[]) {
  return setBars.of(list);
}
