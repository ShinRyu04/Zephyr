// cmIndent.ts — garis panduan indentasi + pewarnaan pasangan bracket (fase 24).
//
// Dua-duanya ditulis sendiri, BUKAN memakai paket pihak ketiga, karena:
//   * @replit/codemirror-indentation-markers menambah ~40KB dan menggambar satu
//     widget DOM per level per baris — pada file 5000 baris itu puluhan ribu
//     node. Versi di sini memakai SATU line-decoration per baris terlihat dan
//     menggambar guide-nya lewat background-image, jadi 0 node tambahan.
//   * Bracket colorization butuh syntax tree untuk membedakan bracket asli dari
//     bracket di dalam string/komentar; itu hanya beberapa baris dengan
//     `syntaxTree`, tidak perlu dependensi.
//
// Keduanya hanya memproses `view.visibleRanges` — biaya tidak tumbuh dengan
// ukuran file (pelajaran fase 15: apa pun yang berjalan per dokumen membekukan
// editor pada JSON 5MB).

import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

/** Kedalaman indentasi sebuah baris; baris kosong mewarisi dari baris berisi
 *  terdekat supaya guide tidak putus di tengah blok. */
const depthOf = (text: string, tabSize: number): number => {
  let kolom = 0;
  for (const ch of text) {
    if (ch === ' ') kolom += 1;
    else if (ch === '\t') kolom += tabSize - (kolom % tabSize);
    else return Math.floor(kolom / tabSize);
  }
  return -1; // baris kosong / hanya whitespace
};

/**
 * Garis indentasi. Satu `Decoration.line` per baris terlihat; jumlah guide
 * disampaikan ke CSS lewat custom property `--zig-n` dan `--zig-step`
 * (lihat `.cm-zig` di editor-extras.css).
 */
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

      // Kedalaman baris kursor menentukan guide mana yang disorot.
      const barisKursor = doc.lineAt(view.state.selection.main.head);
      let depthAktif = depthOf(barisKursor.text, tabSize);
      if (depthAktif < 0) {
        // Baris kosong: cari baris berisi terdekat di atas.
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
            // Baris kosong mewarisi kedalaman tetangga terdalam supaya guide
            // menyambung — ini yang membedakan indent guide dari sekadar
            // menghitung spasi.
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

/* ══════════════ Bracket pair colorization ══════════════ */

const PASANGAN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const BUKA = new Set(['(', '[', '{']);
/** 6 tingkat warna lalu berulang — sama seperti VS Code. */
const TINGKAT = 6;

const kelasKedalaman = Array.from({ length: TINGKAT }, (_, i) =>
  Decoration.mark({ class: `cm-zbr cm-zbr-${i}` }),
);
const kelasSalah = Decoration.mark({ class: 'cm-zbr cm-zbr-bad' });

/**
 * Warnai bracket menurut kedalaman.
 *
 * Bracket di dalam string/komentar DILEWATI lewat syntax tree — tanpa itu
 * `"emoji :)"` menggeser semua warna sesudahnya. Kedalaman dihitung dari awal
 * baris pertama yang terlihat, jadi warna di viewport bisa bergeser relatif
 * terhadap file penuh; itu kompromi sadar supaya biayanya tetap O(viewport).
 */
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
