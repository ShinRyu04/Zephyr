/**
 * Git blame, drawn at the end of each line.
 *
 * The Rust side (`git_blame`) and the store (`blameFile`) already existed and
 * had NO consumer — blame could be printed to the Output panel and nowhere
 * else, which means leaving the buffer to answer "who wrote this and when".
 * That is the question the line itself raises, so the answer belongs on the
 * line.
 *
 * Three decisions worth stating:
 *
 * 1. It is a WIDGET at the line end, not a gutter column. A gutter would need
 *    a width that fits the longest author name in the file, and reserving that
 *    space in every buffer would push the code right for a feature most
 *    buffers never turn on. A widget takes part in layout only where it is
 *    drawn.
 *
 * 2. The author is truncated, the summary is not. Author names are long
 *    identifiers ("Rizky Pratama") whose tail carries no information, while a
 *    commit summary is the part the reader is actually reading. Cutting the
 *    summary at a fixed width would cut the sentence that explains the line.
 *
 * 3. Ranges are COALESCED: consecutive lines from the same commit render once,
 *    on the first line of the run. Blame output printed per line is a wall of
 *    repeated text — forty identical rows for a forty-line function — and the
 *    repetition is what makes it unreadable.
 */
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import type { GitBlameLine } from './commands';

/** Author names longer than this are cut; the summary is left alone. */
const AUTHOR_MAX = 14;

class BlameWidget extends WidgetType {
  constructor(
    readonly teks: string,
    readonly umur: 'baru' | 'lama',
    readonly penuh: string,
  ) {
    super();
  }

  override eq(other: BlameWidget) {
    return other.teks === this.teks && other.umur === this.umur;
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-blame is-${this.umur}`;
    el.textContent = this.teks;
    el.title = this.penuh;
    /*
     * Not part of the document. Without this, dragging a selection down the
     * buffer copies author names into whatever the reader pastes into — the
     * same reason the diagnostics lens is aria-hidden.
     */
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

/** How old a commit is, on a coarse scale, for the colour. */
function umurDari(epochSeconds: number, sekarang: number): 'baru' | 'lama' {
  if (!epochSeconds) return 'lama';
  const hari = (sekarang - epochSeconds) / 86_400;
  /* A week is the line between "recent work, still being discussed" and
     "history". Finer bands would need a legend to be readable. */
  return hari <= 7 ? 'baru' : 'lama';
}

function teksBlame(b: GitBlameLine): string {
  const penulis = b.author.length > AUTHOR_MAX ? `${b.author.slice(0, AUTHOR_MAX - 1)}…` : b.author;
  const ringkas = (b.summary || '').trim();
  /* Date is not shown: it is in the tooltip, and in the line it would take the
     width the summary needs. `baru`/`lama` already carries the useful part. */
  return ringkas ? `  ${penulis} · ${ringkas}` : `  ${penulis}`;
}

/**
 * Build the decoration set for a blame result.
 *
 * `nowSeconds` is passed in rather than read from the clock so this function
 * stays pure and the same input always produces the same output — the test
 * harness depends on that.
 */
function blameRanges(
  list: GitBlameLine[],
  state: EditorState,
  nowSeconds: number,
  batas: number,
): DecorationSet {
  if (list.length === 0 || batas <= 0) return Decoration.none;

  const perBaris = new Map<number, GitBlameLine>();
  for (const b of list) {
    if (b.line < 1 || b.line > state.doc.lines) continue;
    perBaris.set(b.line, b);
  }

  const ranges: ReturnType<Decoration['range']>[] = [];
  let terakhirHash = '';
  let terakhirUmur: 'baru' | 'lama' = 'lama';

  for (let n = 1; n <= state.doc.lines; n += 1) {
    const b = perBaris.get(n);
    if (!b) continue;

    /*
     * Coalesce a run of lines from one commit.
     *
     * The marker is the COMMIT HASH and nothing else. Including the author or
     * the summary would split a run whenever two commits share them, which is
     * common (the same person committing twice in a row) and would print the
     * same attribution twice for one logical block.
     */
    if (b.hash === terakhirHash) continue;

    const epoch = Number(b.date) || 0;
    const umur = umurDari(epoch, nowSeconds);
    terakhirHash = b.hash;
    terakhirUmur = umur;

    if (ranges.length >= batas) break;

    const baris = state.doc.line(n);
    const kapan = epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : '';
    const penuh = `${b.author}${kapan ? ` · ${kapan}` : ''}${b.summary ? `\n${b.summary}` : ''}\n${b.hash.slice(0, 12)}`;

    ranges.push(
      Decoration.widget({
        widget: new BlameWidget(teksBlame(b), terakhirUmur, penuh),
        side: 1,
      }).range(baris.to),
    );
  }

  return Decoration.set(ranges, true);
}

/** Cap on how many blame markers are drawn in one buffer.
 *
 *  A 20,000-line file would otherwise build thousands of widgets the moment
 *  blame is switched on, for markers the reader will never scroll to. The cap
 *  is generous enough that a normal file is unaffected. */
const BLAME_MAX = 400;

const setBlame = StateEffect.define<GitBlameLine[]>();

export const blameField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const efek = tr.effects.find((e) => e.is(setBlame));
    if (efek) {
      /* `Date.now()` is read here, at dispatch time, and never inside
         `blameRanges` — which keeps that function pure. */
      return blameRanges(efek.value, tr.state, Math.floor(Date.now() / 1000), BLAME_MAX);
    }
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Set or clear the blame markers in one transaction. */
export function setBlameEffect(list: GitBlameLine[]) {
  return setBlame.of(list);
}

