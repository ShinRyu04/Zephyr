/*
 * Tab sebagai Emmet — hanya di berkas HTML/CSS.
 *
 * Kenapa keymap sendiri dan bukan autocomplete: di VS Code, Emmet dipicu Tab
 * setelah singkatan diketik, dan hasilnya langsung menjadi kode yang bisa
 * diedit — bukan daftar saran. Itulah yang ditiru di sini.
 *
 * Urutannya penting: `snippetKeymap` dipasang LEBIH DULU oleh pemanggil, jadi
 * Tab di dalam snippet tetap melanjutkan ke field berikutnya. Kalau handler ini
 * tidak menemukan singkatan yang sah, ia mengembalikan `false` dan Tab jatuh ke
 * `indentWithTab` seperti biasa.
 */
import { EditorSelection, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { expandEmmet } from './emmet';

/* Karakter yang boleh menjadi bagian singkatan. Spasi menghentikannya: `foo bar`
   bukan singkatan, dan Tab di situ harus mengindentasi. */
const SINGKATAN = /[A-Za-z.#][\w.#>+*[\]{}=\-:"']*$/;

function cobaExpand(view: EditorView, lang: string | null | undefined): boolean {
  const { state } = view;
  const pilihan = state.selection.main;
  if (!pilihan.empty) return false;

  const baris = state.doc.lineAt(pilihan.head);
  const sebelum = state.sliceDoc(baris.from, pilihan.head);
  const m = SINGKATAN.exec(sebelum);
  if (!m) return false;

  const abbr = m[0];
  /* Satu huruf hampir selalu bagian dari kata yang sedang diketik, bukan
     singkatan. Emmet sendiri mengecualikan nama tag satu huruf (`p`, `a`, `b`)
     karena itu justru tag yang sah — jadi yang dikecualikan hanya `.`/`#`
     sendirian. */
  if (abbr === '.' || abbr === '#') return false;

  const hasil = expandEmmet(abbr, lang);
  if (!hasil) return false;

  const dari = pilihan.head - abbr.length;
  view.dispatch({
    changes: { from: dari, to: pilihan.head, insert: hasil.teks },
    selection: EditorSelection.cursor(dari + hasil.kursor),
    userEvent: 'input.complete',
  });
  return true;
}

/**
 * Keymap Emmet untuk satu dokumen.
 *
 * `lang` dibaca lewat fungsi, bukan nilai, karena editor yang sama dapat
 * berpindah bahasa setelah tab lain dibuka — nilai yang ditangkap saat mount
 * akan terus memakai bahasa berkas pertama.
 */
export function emmetKeymap(lang: () => string | null | undefined): Extension {
  return keymap.of([
    {
      key: 'Tab',
      run: (view) => cobaExpand(view, lang()),
    },
  ]);
}
