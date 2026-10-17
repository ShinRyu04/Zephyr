/**
 * `kotak` — the model draws a BOX, not a paragraph.
 *
 * ## What this is for
 *
 * A list of facts inside a chat answer is usually written as prose or as a
 * markdown table. Prose loses the structure; a table is cramped in a narrow
 * panel and the reader has to scroll sideways. OpenCode's answers use a bordered
 * box with a title, an optional one-line summary, and rows of `label: value` -
 * readable at a glance and it wraps.
 *
 * This tool is how the model produces that. It does not render anything itself:
 * it returns a fenced block with a language tag the transcript already knows how
 * to draw (`kotak`), so the SAME string is readable as plain text in a terminal
 * and as a box in the panel.
 *
 * ## Why a tool and not just an instruction
 *
 * An instruction ("answer with a box") is a request the model may skip under
 * pressure. A tool is a shape it has to fill, and the result is validated before
 * it is returned - a box with no rows is refused here, not shown to the reader
 * as an empty frame.
 *
 * ## The format
 *
 *   ```kotak
 *   Judul kotak
 *   Ringkasan satu baris (opsional)
 *   ---
 *   Label | Nilai
 *   Label | Nilai
 *   ```
 *
 * `---` separates the header from the rows. A row with no `|` is a SECTION
 * HEADING - it groups rows under it, which is what makes a long list readable
 * without nesting.
 */
import type { AgentTool } from '../agentTools';

interface BarisKotak {
  label: string;
  nilai?: string;
  /** A row with no value is a section heading, drawn differently. */
  judul?: boolean;
}

/**
 * Build the fenced block.
 *
 * Pure and exported so the harness can check the exact bytes the model will
 * emit, rather than trusting a template string that only runs inside the app.
 */
export function rakitKotak(judul: string, ringkas: string, baris: BarisKotak[]): string {
  const isi = baris.map((b) => (b.judul ? b.label : `${b.label} | ${b.nilai}`));
  const kepala = [judul.trim()];
  if (ringkas.trim()) kepala.push(ringkas.trim());
  return ['```kotak', ...kepala, '---', ...isi, '```'].join('\n');
}

export const kotakTool: AgentTool = {
  spec: {
    name: 'kotak',
    description:
      'Gambar KOTAK terstruktur di jawaban - judul, ringkasan satu baris, lalu baris label/nilai. Pakai untuk daftar fakta, ringkasan hasil, perbandingan, atau langkah - apa pun yang lebih enak dibaca sebagai kotak daripada paragraf. ' +
      'JANGAN pakai untuk kode (pakai blok kode biasa) atau untuk satu kalimat pendek (tulis saja). ' +
      'baris: tiap entri {label, nilai}; entri TANPA nilai menjadi judul bagian di dalam kotak, untuk mengelompokkan baris di bawahnya. ' +
      'Kotak tanpa satu pun baris ditolak - kotak kosong lebih buruk daripada tidak ada kotak.',
    parameters: {
      type: 'object',
      properties: {
        judul: { type: 'string', description: 'Judul kotak, satu baris pendek.' },
        ringkas: { type: 'string', description: 'Ringkasan satu baris di bawah judul. Boleh kosong.' },
        baris: {
          type: 'array',
          description: 'Isi kotak, berurutan. Entri tanpa "nilai" menjadi judul bagian.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Nama baris, atau judul bagian kalau tanpa nilai.' },
              nilai: { type: 'string', description: 'Isi baris. Kosong = judul bagian.' },
            },
            required: ['label'],
          },
        },
      },
      required: ['judul', 'baris'],
    },
  },
  run: async (a) => {
    const judul = String(a.judul ?? '').trim();
    if (!judul) throw new Error('ERROR: kotak butuh "judul".');

    const mentah = Array.isArray(a.baris) ? a.baris : [];
    if (mentah.length === 0) {
      throw new Error(
        'ERROR: kotak butuh minimal satu baris. Kotak kosong lebih buruk daripada tidak ada kotak - ' +
          'kalau tidak ada yang bisa diisi, tulis jawabannya sebagai kalimat biasa.',
      );
    }

    const baris: BarisKotak[] = [];
    for (const [i, b] of mentah.entries()) {
      const o = b as { label?: unknown; nilai?: unknown };
      const label = String(o.label ?? '').trim();
      if (!label) {
        throw new Error(`ERROR: baris ke-${i + 1} tidak punya "label".`);
      }
      /*
       * A value may legitimately be an empty string ("nothing found"), but an
       * absent value means "this is a heading". The distinction is carried by
       * whether the key EXISTS, not by whether it is truthy - otherwise a row
       * that means "kosong" would silently become a heading.
       */
      const adaNilai = Object.prototype.hasOwnProperty.call(o, 'nilai');
      const nilai = String(o.nilai ?? '').trim();
      baris.push(adaNilai ? { label, nilai } : { label, judul: true });
    }

    /*
     * A pipe inside a label or value would break the row into three fields when
     * the renderer splits on it. Escaped here, in the one place that builds the
     * string, so no caller has to remember.
     */
    const aman = baris.map((b) => ({
      ...b,
      label: b.label.replace(/\|/g, '\\|'),
      nilai: (b.nilai ?? '').replace(/\|/g, '\\|'),
    }));

    return rakitKotak(judul, String(a.ringkas ?? ''), aman);
  },
};
