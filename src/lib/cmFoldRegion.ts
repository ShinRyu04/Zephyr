/*
 * Lipat `#region` … `#endregion`.
 *
 * Dilipat berbasis teks, bukan sintaks: penanda ini sengaja tidak dikenal
 * parser bahasa mana pun — justru itu gunanya, memberi nama pada blok yang
 * batas sintaksnya tidak bisa dipakai (deretan handler, sekumpulan test).
 *
 * Semua gaya komentar yang umum diterima: `#region`, `// #region`,
 * `/* #region *\/`, `<!-- #region -->`, `-- #region`. Pencocokan dilakukan pada
 * baris, jadi penanda yang berada di ujung baris kode tetap bekerja.
 */
import { foldService } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';

const PEMBUKA = /(?:\/\/|#|--|;|\/\*|<!--)\s*region\b/i;
const PENUTUP = /(?:\/\/|#|--|;|\/\*|<!--)\s*endregion\b/i;

export const regionFold: Extension = foldService.of((state, lineStart) => cariRegion(state, lineStart));

/** Bagian murni dari layanan lipat, diekspor supaya bisa diuji tanpa DOM. */
export function cariRegion(state: EditorState, lineStart: number) {
  const awal = state.doc.lineAt(lineStart);
  if (!PEMBUKA.test(awal.text) || PENUTUP.test(awal.text)) return null;

  let kedalaman = 0;
  for (let n = awal.number; n <= state.doc.lines; n++) {
    const baris = state.doc.line(n);
    const tutup = PENUTUP.test(baris.text);
    const buka = PEMBUKA.test(baris.text) && !tutup;

    if (buka) kedalaman++;
    if (tutup) {
      kedalaman--;
      /* Region bersarang ditutup oleh pasangannya sendiri, bukan oleh yang
         pertama ditemukan; `kedalaman === 0` adalah penutup milik pembuka ini. */
      if (kedalaman === 0 && n > awal.number) {
        return { from: awal.to, to: baris.from };
      }
    }
  }

  /* Region tanpa penutup tetap bisa dilipat sampai akhir dokumen — itu lebih
     berguna daripada tidak bisa dilipat sama sekali, dan terlihat jelas bahwa
     penutupnya memang belum ditulis. */
  return state.doc.length > awal.to ? { from: awal.to, to: state.doc.length } : null;
}
