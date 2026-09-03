// cmColor.ts — swatch warna inline + sorot unicode ambigu (fase 24).
//
// Color decorator: setiap #hex / rgb() / hsl() / nama CSS di viewport dapat
// kotak kecil sebelum teksnya. Klik kotak = buka <input type="color"> asli;
// perubahan MENULIS ULANG teks di dokumen (jadi terlihat di undo history).
//
// Dipakai MatchDecorator dari @codemirror/view supaya pencocokan regex hanya
// jalan di viewport dan di-update inkremental — bukan memindai seluruh dokumen
// tiap ketikan.

import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';

/* ══════════════ Color decorators ══════════════ */

/** Nama warna CSS yang sering muncul di kode. Daftar penuh CSS ada 148 nama;
 *  yang jarang dipakai sengaja tidak dimuat agar regex tetap pendek. */
const NAMA_WARNA: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  maroon: '#800000',
  olive: '#808000',
  green: '#008000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  gold: '#ffd700',
  transparent: '#00000000',
};

const RE_WARNA = new RegExp(
  [
    // #rgb #rgba #rrggbb #rrggbbaa
    String.raw`#[0-9a-fA-F]{3,8}\b`,
    // rgb(…) / rgba(…)
    String.raw`\brgba?\(\s*[^)\n]{1,60}\)`,
    // hsl(…) / hsla(…)
    String.raw`\bhsla?\(\s*[^)\n]{1,60}\)`,
    // nama warna sebagai kata utuh
    String.raw`\b(?:${Object.keys(NAMA_WARNA).join('|')})\b`,
  ].join('|'),
  'g',
);

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const dua = (n: number) => clamp255(n).toString(16).padStart(2, '0');

/** hsl → rgb (h derajat, s/l persen 0..1). */
const hslKeRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
};

/**
 * Teks warna → `#rrggbb` untuk dipasang ke `<input type="color">`.
 * Mengembalikan null kalau tidak bisa diurai (mis. `rgb(var(--x))`) — swatch
 * tidak ditampilkan daripada menampilkan warna yang salah.
 */
export const keHex6 = (raw: string): string | null => {
  const s = raw.trim().toLowerCase();

  if (s in NAMA_WARNA) return NAMA_WARNA[s].slice(0, 7);

  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    if (h.length === 6 || h.length === 8) return `#${h.slice(0, 6)}`;
    return null;
  }

  const angka = (t: string): number[] | null => {
    const isi = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
    const bagian = isi.split(/[,\s/]+/).filter(Boolean);
    const out: number[] = [];
    for (const p of bagian) {
      const persen = p.endsWith('%');
      const n = Number.parseFloat(persen ? p.slice(0, -1) : p);
      if (!Number.isFinite(n)) return null;
      out.push(persen ? n / 100 : n);
    }
    return out;
  };

  if (s.startsWith('rgb')) {
    const v = angka(s);
    if (!v || v.length < 3) return null;
    // Nilai persen sudah dibagi 100 di atas; kalikan balik ke 0..255.
    const conv = (x: number) => (x <= 1 && !Number.isInteger(x) ? x * 255 : x);
    return `#${dua(conv(v[0]))}${dua(conv(v[1]))}${dua(conv(v[2]))}`;
  }

  if (s.startsWith('hsl')) {
    const v = angka(s);
    if (!v || v.length < 3) return null;
    const [r, g, b] = hslKeRgb(v[0], Math.min(v[1], 1), Math.min(v[2], 1));
    return `#${dua(r)}${dua(g)}${dua(b)}`;
  }

  return null;
};

class SwatchWidget extends WidgetType {
  constructor(
    readonly warna: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  // Widget dengan nilai sama tidak dibuat ulang saat scroll.
  eq(other: SwatchWidget) {
    return other.warna === this.warna && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-zcolor';
    el.setAttribute('data-testid', 'color-swatch');
    el.setAttribute('data-color', this.warna);
    el.title = `${this.warna} — klik untuk mengubah`;
    el.style.backgroundColor = this.warna;

    // <input type="color"> asli disembunyikan di dalam swatch: dialog picker
    // OS-nya gratis, tidak perlu menulis color picker sendiri.
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = this.warna;
    inp.className = 'cm-zcolor-input';
    inp.setAttribute('data-testid', 'color-input');
    inp.setAttribute('aria-label', `Ubah warna ${this.warna}`);

    const terapkan = (nilai: string) => {
      // Posisi dibaca ulang dari widget: dokumen bisa berubah sejak widget
      // dibuat, dan menulis ke offset basi akan merusak teks lain.
      const panjang = this.to - this.from;
      if (this.to > view.state.doc.length) return;
      const sekarang = view.state.doc.sliceString(this.from, this.to);
      if (keHex6(sekarang) === null) return;
      view.dispatch({
        changes: { from: this.from, to: this.from + panjang, insert: nilai },
        userEvent: 'input.color',
      });
    };

    inp.addEventListener('input', () => terapkan(inp.value));
    inp.addEventListener('change', () => terapkan(inp.value));
    el.appendChild(inp);
    return el;
  }

  ignoreEvent() {
    return false; // klik harus sampai ke <input>
  }
}

const swatchDecorator = new MatchDecorator({
  regexp: RE_WARNA,
  decorate: (add, from, to, match) => {
    const hex = keHex6(match[0]);
    if (!hex) return;
    add(from, from, Decoration.widget({ widget: new SwatchWidget(hex, from, to), side: -1 }));
  },
});

export const colorDecorators = (): Extension =>
  ViewPlugin.fromClass(
    class {
      deco: DecorationSet;
      constructor(view: EditorView) {
        this.deco = swatchDecorator.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.deco = swatchDecorator.updateDeco(u, this.deco);
      }
    },
    { decorations: (v) => v.deco },
  );

/* ══════════════ Unicode highlight ══════════════ */

/**
 * Karakter yang MIRIP ASCII tapi bukan ASCII — sumber bug yang sangat sulit
 * dilihat mata (mis. tanda kutip cerdas hasil copy dari Word, atau titik dua
 * Yunani di nama variabel). Plus karakter tak terlihat (zero-width, NBSP).
 *
 * Pasangan `char → yang disangka` dipakai untuk pesan tooltip, karena
 * "karakter ambigu" saja tidak memberi tahu user apa yang harus diperbaiki.
 */
const AMBIGU: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2212': '-',
  '\u00A0': 'spasi',
  '\u2007': 'spasi',
  '\u202F': 'spasi',
  '\u200B': '(zero-width)',
  '\u200C': '(zero-width)',
  '\u200D': '(zero-width)',
  '\uFEFF': '(BOM)',
  '\u037E': ';',
  '\u0387': ':',
  '\u2044': '/',
  '\u00B4': '`',
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043E': 'o',
  '\u0440': 'p',
  '\u0441': 'c',
  '\u0445': 'x',
  '\u0455': 's',
  '\u0456': 'i',
};

const RE_AMBIGU = new RegExp(`[${Object.keys(AMBIGU).join('')}]`, 'g');

export const unicodeHighlight = (): Extension =>
  ViewPlugin.fromClass(
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
        for (const { from, to } of view.visibleRanges) {
          const teks = view.state.doc.sliceString(from, to);
          RE_AMBIGU.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = RE_AMBIGU.exec(teks)) !== null) {
            const ch = m[0];
            const kode = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
            b.add(
              from + m.index,
              from + m.index + ch.length,
              Decoration.mark({
                class: 'cm-zuni',
                attributes: {
                  'data-testid': 'unicode-warn',
                  title: `U+${kode} mudah tertukar dengan ${AMBIGU[ch]}`,
                },
              }),
            );
          }
        }
        return b.finish();
      }
    },
    { decorations: (v) => v.deco },
  );
