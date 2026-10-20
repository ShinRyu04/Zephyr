/**
 * Syntax colouring for ONE line of code, for surfaces that are not CodeMirror.
 *
 * WHY not CodeMirror: the editor already has a parser and a real theme, but a
 * diff row is a single line of text with no `EditorState` behind it, and
 * building one per row would mean one parser per row on every scroll. The
 * DiffView paints hundreds of rows; it needs a function, not an editor.
 *
 * The rule set is deliberately small - comments, strings, numbers, keywords,
 * types - because that is what makes a diff readable at a glance. It is NOT a
 * parser: a regex that lands mid-string will mis-colour the rest of the line,
 * and that is an accepted trade for a review surface. Colours come from the
 * same `--syn-*` tokens the editor theme uses, so a diff and the file beside it
 * never disagree about what a keyword looks like.
 */

export type JenisToken = 'teks' | 'angka' | 'kata-kunci' | 'tipe' | 'fungsi';

export type Token = { teks: string; jenis: JenisToken | null };

/** True when the whole line is a comment, so the caller can gray it. */
export function barisKomentar(teks: string): boolean {
  return POLA_BARIS.test(teks);
}

/** Words that read as control flow in most of the languages this app edits. */
const KATA_KUNCI = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export',
  'extends', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import',
  'in', 'instanceof', 'interface', 'let', 'new', 'of', 'private', 'protected',
  'public', 'readonly', 'return', 'static', 'switch', 'throw', 'try', 'type',
  'typeof', 'var', 'void', 'while', 'with', 'yield',
  // Rust / Go / Python, so a diff of those files is not painted as plain text.
  'fn', 'impl', 'match', 'mod', 'mut', 'pub', 'struct', 'trait', 'use', 'where',
  'def', 'elif', 'except', 'lambda', 'pass', 'raise', 'self', 'func', 'package',
  'range', 'select', 'true', 'false', 'null', 'none', 'undefined', 'nil',
]);

/** Capitalised identifiers that are not types but read like one. */
const BUKAN_TIPE = new Set(['String', 'Number', 'Boolean', 'Object', 'Array', 'Math', 'JSON', 'Promise', 'Error', 'Date', 'Map', 'Set', 'RegExp']);

const POLA_BARIS = /^(?:\/\/|#(?!!)|--\s|<!--|;)/;
const POLA_ANGKA = /^(?:0[xX][0-9a-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)/;
const POLA_IDENT = /^[A-Za-z_$][\w$]*/;
const POLA_SPASI = /^\s+/;

/**
 * Split one source line into coloured tokens.
 *
 * A line that is wholly a comment comes back as an empty list, and
 * `barisKomentar` says why: a grey is the one colour that vanishes inside a
 * green "added" wash, so the caller grays the whole line instead of relying on
 * a token colour that would be unreadable there.
 *
 * Unterminated strings end at the end of the line rather than swallowing the
 * next row: a diff shows one line at a time, and a quote character that is not
 * closed in that line is the normal case for a multi-line template literal.
 */
export function sorotBaris(teks: string): Token[] {
  if (!teks) return [];
  if (POLA_BARIS.test(teks)) return [];

  const out: Token[] = [];
  let sisa = teks;

  const dorong = (t: string, jenis: JenisToken | null) => {
    const akhir = out[out.length - 1];
    /* Adjacent plain text merges, so one line does not become fifty spans. */
    if (akhir && jenis === null && akhir.jenis === null) akhir.teks += t;
    else out.push({ teks: t, jenis });
  };

  while (sisa) {
    const spasi = POLA_SPASI.exec(sisa);
    if (spasi) {
      dorong(spasi[0], null);
      sisa = sisa.slice(spasi[0].length);
      continue;
    }

    const awal = sisa[0];
    if (awal === '"' || awal === "'" || awal === '`') {
      let i = 1;
      while (i < sisa.length) {
        if (sisa[i] === '\\') {
          i += 2;
          continue;
        }
        if (sisa[i] === awal) {
          i += 1;
          break;
        }
        i += 1;
      }
      dorong(sisa.slice(0, i), 'teks');
      sisa = sisa.slice(i);
      continue;
    }

    const angka = POLA_ANGKA.exec(sisa);
    if (angka && /\d/.test(awal)) {
      dorong(angka[0], 'angka');
      sisa = sisa.slice(angka[0].length);
      continue;
    }

    const ident = POLA_IDENT.exec(sisa);
    if (ident) {
      const kata = ident[0];
      const sesudah = sisa.slice(kata.length).trimStart();
      let jenis: JenisToken | null = null;
      if (KATA_KUNCI.has(kata)) jenis = 'kata-kunci';
      else if (BUKAN_TIPE.has(kata)) jenis = 'tipe';
      else if (sesudah.startsWith('(')) jenis = 'fungsi';
      else if (/^[A-Z]/.test(kata)) jenis = 'tipe';
      dorong(kata, jenis);
      sisa = sisa.slice(kata.length);
      continue;
    }

    dorong(awal, null);
    sisa = sisa.slice(1);
  }

  return out;
}
