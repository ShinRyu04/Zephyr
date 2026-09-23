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
  return -1; // baris kosong / hanya whitespace
};

const indentPlugin = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    constructor(view: EditorView) {
      this.deco = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.deco = this.build(u.view);
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
      if (u.docChanged || u.viewportChanged) this.deco = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        const teks = view.state.doc.sliceString(from, to);
        const tumpukan: string[] = [];
        for (let i = 0; i < teks.length; i++) {
          const ch = teks[i];
          if (!BUKA.has(ch) && !(ch in PASANGAN)) continue;
          const pos = from + i;
          const nama = tree.resolveInner(pos, 1).name;
          if (/String|Comment|Literal/.test(nama)) continue;

          if (BUKA.has(ch)) {
            b.add(pos, pos + 1, kelasKedalaman[tumpukan.length % TINGKAT]);
            tumpukan.push(ch);
          } else {
            const harus = PASANGAN[ch];
            if (tumpukan.length > 0 && tumpukan[tumpukan.length - 1] === harus) {
              tumpukan.pop();
              b.add(pos, pos + 1, kelasKedalaman[tumpukan.length % TINGKAT]);
            } else {
              b.add(pos, pos + 1, kelasSalah);
            }
          }
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.deco },
);

export const bracketPairColors = (): import('@codemirror/state').Extension => bracketPlugin;
