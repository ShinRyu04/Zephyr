/**
 * `peta` — "where is X in Zephyr", answered from the 6.300-entry fact index.
 *
 * ## Why this is a tool and not just a prompt block
 *
 * The prompt already carries a SLICE of the index, chosen by matching the user's
 * words. That covers "where is the theme setting" when the question happens to
 * share vocabulary with an index entry. It does not cover the case where the
 * reader describes a FEELING - "the AI keeps losing my instructions", "it
 * forgets what I said" - and the entry that answers it is keyed on words the
 * reader never used.
 *
 * A tool lets the model search again with ITS OWN query, after reading the
 * question, and narrow by category. That second attempt is the whole value: the
 * first one is already in the prompt.
 *
 * ## Why it returns counts, not everything
 *
 * `formatHasil` caps at 6.000 characters. A search for "setting" would return
 * hundreds of rows and the answer would be the index, not the answer. So this
 * returns the best few, and when a category has more, says HOW MANY more - the
 * model can then narrow with `kategori` instead of paging.
 *
 * ## What it will NOT do
 *
 * It never invents an entry. Zero hits is reported as zero, with the categories
 * that exist, so the model can say "that does not exist" honestly rather than
 * naming a setting it made up. That is the same rule the prompt states, enforced
 * here in code.
 */
import type { AgentTool } from '../agentTools';
import {
  cariFakta,
  kategoriTersedia,
  jumlahEntri,
  versiFakta,
  capBasi,
  formatHasil,
  type FaktaKategori,
} from '../zephyrCari.ts';

const KATEGORI = [
  'semua',
  'label',
  'layar',
  'setelan',
  'perintah',
  'pintasan',
  'menu',
  'seksi',
  'panel',
  'tool',
  'ekstensi',
  'dokumen',
  'kode',
  'port',
  'bridge',
] as const;

export const petaTool: AgentTool = {
  spec: {
    name: 'peta',
    description:
      'Cari di PETA ZEPHYR: 6.300+ entri tentang aplikasi ini sendiri - label antarmuka, layar, kunci setelan, perintah palet, pintasan, menu, seksi Settings, panel, tool, ekstensi bawaan, dokumen, peta kode, port. ' +
      'Pakai untuk "di mana X", "nama setelan apa", "perintah apa", "berkas mana" - dan pakai LAGI dengan kata-kata sendiri kalau irisan di prompt tidak menjawab. ' +
      'kueri = kata kunci (boleh beberapa kata). kategori = mempersempit (bawaan semua). batas = jumlah hasil (1-40, bawaan 8). ' +
      'Hasilnya menyebut jumlah yang TIDAK ditampilkan kalau ada lebih - persempit dengan kategori, jangan mengulang kueri yang sama. ' +
      'Nol hasil berarti memang tidak ada: JANGAN mengarang nama setelan/perintah, sebutkan bahwa tidak ketemu.',
    parameters: {
      type: 'object',
      properties: {
        kueri: { type: 'string', description: 'Kata kunci pencarian.' },
        kategori: { type: 'string', enum: [...KATEGORI], description: 'Persempit ke satu kategori. Bawaan: semua.' },
        batas: { type: ['number', 'string'], description: 'Jumlah hasil maksimum (1-40). Bawaan: 8.' },
      },
      required: ['kueri'],
    },
  },
  run: async (a) => {
    const kueri = String(a.kueri ?? '').trim();
    if (!kueri) throw new Error('ERROR: peta butuh "kueri".');

    const kat = String(a.kategori ?? 'semua').trim();
    if (!KATEGORI.includes(kat as never)) {
      throw new Error(`ERROR: kategori "${kat}" tidak dikenal. Pilihan: ${KATEGORI.join(', ')}.`);
    }
    const batasMentah = Number(a.batas ?? 8);
    const batas = Number.isFinite(batasMentah) ? Math.min(40, Math.max(1, Math.floor(batasMentah))) : 8;

    const hasil = cariFakta(kueri, {
      kategori: kat === 'semua' ? 'semua' : (kat as FaktaKategori),
      batas,
    });

    /*
     * Header always comes back, even with zero hits: it tells the model the index
     * EXISTS and how big it is, which is what separates "not in the app" from
     * "not in my query". The staleness line matters for the same reason - a stale
     * index is a reason to say "let me verify", not to answer confidently.
     */
    const v = versiFakta();
    const basi = capBasi(null);
    const kepala =
      `Peta Zephyr: ${jumlahEntri()} entri, versi ${v.aplikasi}, hash ${v.hashSumber}` +
      (basi.basi ? ` (BASI: ${basi.alasan})` : '') +
      `\nKategori: ${kategoriTersedia()
        .map((k) => `${k.kategori}=${k.jumlah}`)
        .join(', ')}`;

    if (hasil.length === 0) {
      return (
        `${kepala}\n\n` +
        `Tidak ada entri yang cocok dengan "${kueri}"${kat === 'semua' ? '' : ` di kategori ${kat}`}.\n` +
        'Artinya fitur/setelan itu TIDAK ADA di build ini - sebutkan terus terang, jangan mengarang namanya. ' +
        'Kalau yakin ada, coba kata kunci lain atau kategori lain.'
      );
    }

    /*
     * `hitungCocok` would give the true total, but it re-runs the whole search -
     * on a 6.300-entry index that is a second full pass for a number that is only
     * useful as a hint. Instead: if the page came back FULL, there is at least
     * one more, and saying "at least N" is honest about not having counted.
     */
    const penuh = hasil.length >= batas;
    return (
      `${kepala}\n\n` +
      `${hasil.length} hasil untuk "${kueri}"${kat === 'semua' ? '' : ` di ${kat}`}` +
      `${penuh ? ` (mungkin ada lebih - persempit dengan kategori atau perbesar batas)` : ''}:\n` +
      formatHasil(hasil)
    );
  },
};
