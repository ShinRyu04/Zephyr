import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const depthOf = (text: string, tabSize: number): number => {
  let kolom = 0;
  for (const ch of text) {
    if (ch === ' ') kolom += 1;
    else if (ch === '\t') kolom += tabSize - (kolom % tabSize);
    else return Math.floor(kolom / tabSize);
  }
  return -1; // empty line / whitespace only
};

const indentPlugin = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    constructor(view: EditorView) {
      this.deco = this.build(view);
    }
    update(u: ViewUpdate) {
      /*
       * Rebuild on every update.
       *
       * Both decorations here derive from the text plus the syntax tree, and
       * neither is versioned the way CodeMirror's own decorations are — so any
       * update can invalidate them. The previous guard only rebuilt on document
       * or viewport change, which meant a scroll that reused already-measured
       * ranges kept the first paint's decorations: the whole file rendered at
       * depth 0 and rainbow brackets appeared broken. The work is one pass over
       * the bracket characters of the visible text, which is cheap enough to
       * simply redo.
       */
      this.deco = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      const tabSize = view.state.tabSize;
      const step = view.defaultCharacterWidth * tabSize;
      const doc = view.state.doc;

      const barisKursor = doc.lineAt(view.state.selection.main.head);
      let depthAktif = depthOf(barisKursor.text, tabSize);
      if (depthAktif < 0) {
        
        for (let n = barisKursor.number - 1; n >= 1; n--) {
          const d = depthOf(doc.line(n).text, tabSize);
          if (d >= 0) {
            depthAktif = d;
            break;
          }
        }
      }

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          let d = depthOf(line.text, tabSize);
          if (d < 0) {
            
            const atas = line.number > 1 ? depthOf(doc.line(line.number - 1).text, tabSize) : 0;
            const bawah =
              line.number < doc.lines ? depthOf(doc.line(line.number + 1).text, tabSize) : 0;
            d = Math.min(Math.max(atas, 0), Math.max(bawah, 0));
          }
          if (d > 0) {
            const sorot = depthAktif > 0 && depthAktif <= d ? depthAktif : 0;
            b.add(
              line.from,
              line.from,
              Decoration.line({
                class: 'cm-zig',
                attributes: {
                  style: `--zig-n:${d};--zig-step:${step.toFixed(2)}px;--zig-act:${sorot}`,
                },
              }),
            );
          }
          if (line.to + 1 > to) break;
          pos = line.to + 1;
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.deco },
);

export const indentGuides = (): import('@codemirror/state').Extension => indentPlugin;

const PASANGAN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const BUKA = new Set(['(', '[', '{']);

const TINGKAT = 6;

const kelasKedalaman = Array.from({ length: TINGKAT }, (_, i) =>
  Decoration.mark({ class: `cm-zbr cm-zbr-${i}` }),
);
const kelasSalah = Decoration.mark({ class: 'cm-zbr cm-zbr-bad' });

const bracketPlugin = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    constructor(view: EditorView) {
      this.deco = this.build(view);
    }
    update(u: ViewUpdate) {
      /*
       * Rebuild on every update, for the same reason the indent guides do: this
       * decoration depends on text plus syntax tree, and a scroll that reuses
       * measured ranges would otherwise keep the first paint's depths.
       */
      this.deco = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(view.state);
      const doc = view.state.doc;
      /*
       * Walk from the start of the document, not from the first visible line.
       *
       * The stack was reset for every visible range, so opening a file scrolled
       * to line 700 began with an empty stack: every closing bracket had nothing
       * to match and every opening one landed at depth 0, which is why the whole
       * file rendered in a single colour and rainbow brackets looked broken.
       * Scanning from line 1 first (cheap — bracket characters only) carries the
       * real nesting depth into the viewport, then only the visible tokens are
       * decorated.
       */
      const tumpukan: string[] = [];
      const rangeAtas = view.visibleRanges.length ? view.visibleRanges[0].from : 0;

      const prosesChar = (pos: number, ch: string, catat: boolean) => {
        const nama = tree.resolveInner(pos, 1).name;
        if (/String|Comment|Literal/.test(nama)) return;
        if (BUKA.has(ch)) {
          if (catat) b.add(pos, pos + 1, kelasKedalaman[tumpukan.length % TINGKAT]);
          tumpukan.push(ch);
          return;
        }
        const harus = PASANGAN[ch];
        if (tumpukan.length > 0 && tumpukan[tumpukan.length - 1] === harus) {
          tumpukan.pop();
          if (catat) b.add(pos, pos + 1, kelasKedalaman[tumpukan.length % TINGKAT]);
        } else if (catat) {
          b.add(pos, pos + 1, kelasSalah);
        }
      };

      /* Pass one: depth bookkeeping only, up to the first visible line. */
      if (rangeAtas > 0) {
        const awal = doc.sliceString(0, rangeAtas);
        for (let i = 0; i < awal.length; i++) {
          const ch = awal[i];
          if (BUKA.has(ch) || ch in PASANGAN) prosesChar(i, ch, false);
        }
      }

      /* Pass two: decorate what is actually on screen. */
      for (const { from, to } of view.visibleRanges) {
        const teks = doc.sliceString(from, to);
        for (let i = 0; i < teks.length; i++) {
          const ch = teks[i];
          if (!BUKA.has(ch) && !(ch in PASANGAN)) continue;
          prosesChar(from + i, ch, true);
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.deco },
);

export const bracketPairColors = (): import('@codemirror/state').Extension => bracketPlugin;
