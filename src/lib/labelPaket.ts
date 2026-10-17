/*
 * labelPaket.ts - label jujur untuk paket bahasa di katalog ekstensi.
 *
 * Sejak bahasa inti pindah ke dalam aplikasi (`src/lib/lang.ts`, `BY_EXT`:
 * 61 ekstensi -> 28 bahasa) dan katalog bawaan mengirim 88 paket bahasa
 * (`PAKET_BAHASA` di `src-tauri/src/ext_bundled.rs`), sebagian kartu di
 * daftar ekstensi menjanjikan lebih dari yang benar-benar diberikannya:
 *
 * - `zephyr.lang-puppet` mengklaim `.pp`, tetapi `zephyr.lang-pascal`
 *   (`LANG_PASCAL`: `.pas`, `.pp`, `.dpr`, `.lpr`) dimuat lebih dulu, dan
 *   `extLangUntuk()` (`src/lib/lang.ts`) serta `muatBahasa()`
 *   (`src/lib/extLoader.ts`) memakai aturan "yang pertama menang" -- ekstensi
 *   yang sudah dipakai tidak ditimpa. Jadi paket puppet tidak pernah
 *   menambah apa pun di sini: NO-OP.
 * - `perl`, `python`, `ruby`, `shell`, `xml` hanya menambah ekstensi sisa
 *   (`.t`/`.pod`, `.pyi`, `.erb`/`.gemspec`, `.fish`, `.xsd`/`.xsl`/`.xhtml`);
 *   bahasanya sendiri sudah didukung bawaan. Kartunya harus menulis itu,
 *   bukan berpura-pura menambah dukungan bahasa.
 *
 * Modul ini sengaja murni (tanpa impor, tanpa React) supaya tabelnya bisa
 * diuji tanpa aplikasi: `scripts/uji-katalog-ekstensi-jujur.mjs` membaca
 * sumber katalog yang sebenarnya, menurunkan sendiri status tiap paket, lalu
 * menuntut tabel ini setuju -- termasuk daftar ekstensi sisa yang persis.
 * Jadi angkanya tidak boleh ditebak; kalau katalog berubah, uji itu gagal.
 */

export type JenisLabelPaket = 'no-op' | 'ekstensi-sisa';

export interface LabelPaket {
  /** id paket seperti di katalog (`zephyr.lang-*`). */
  readonly id: string;
  /** `no-op`: memasangnya tidak mengubah apa pun. `ekstensi-sisa`: bahasanya sudah ada. */
  readonly jenis: JenisLabelPaket;
  /** Bahasa yang dipakai kartunya, disalin dari katalog. */
  readonly bahasa: string;
  /** Ekstensi yang BENAR-BENAR ditambahkan paket ini (sisa, belum diklaim siapa pun). */
  readonly ekstensiDitambah: readonly string[];
  /** Ekstensi yang diklaim paket ini tetapi tidak berpengaruh (sudah dipakai/di luar cakupan). */
  readonly ekstensiTidakEfek: readonly string[];
  /** Paket yang memenangkan ekstensi yang tidak berpengaruh itu, kalau ada. */
  readonly pemilikLain: string | null;
  /** Teks persis yang dilihat pengguna di kartu. */
  readonly teks: string;
}

export const LABEL_PAKET: Record<string, LabelPaket> = {
  'zephyr.lang-puppet': {
    id: 'zephyr.lang-puppet',
    jenis: 'no-op',
    bahasa: 'Puppet',
    ekstensiDitambah: [],
    ekstensiTidakEfek: ['.pp'],
    pemilikLain: 'zephyr.lang-pascal',
    teks:
      'NO-OP — the .pp extension is already claimed by the Pascal pack, which loads first, so this pack ' +
      'adds no language support at all; it can still be installed and removed',
  },
  'zephyr.lang-perl': {
    id: 'zephyr.lang-perl',
    jenis: 'ekstensi-sisa',
    bahasa: 'Perl',
    ekstensiDitambah: ['.t', '.pod'],
    ekstensiTidakEfek: [],
    pemilikLain: null,
    teks: 'already built in — Perl ships with Zephyr; this pack only adds the remaining extensions .t, .pod',
  },
  'zephyr.lang-python': {
    id: 'zephyr.lang-python',
    jenis: 'ekstensi-sisa',
    bahasa: 'Python',
    ekstensiDitambah: ['.pyi'],
    ekstensiTidakEfek: [],
    pemilikLain: null,
    teks: 'already built in — Python ships with Zephyr; this pack only adds the remaining extension .pyi',
  },
  'zephyr.lang-ruby': {
    id: 'zephyr.lang-ruby',
    jenis: 'ekstensi-sisa',
    bahasa: 'Ruby',
    ekstensiDitambah: ['.erb', '.gemspec'],
    ekstensiTidakEfek: [],
    pemilikLain: null,
    teks: 'already built in — Ruby ships with Zephyr; this pack only adds the remaining extensions .erb, .gemspec',
  },
  'zephyr.lang-shell': {
    id: 'zephyr.lang-shell',
    jenis: 'ekstensi-sisa',
    bahasa: 'Shell / Bash',
    ekstensiDitambah: ['.fish'],
    ekstensiTidakEfek: [],
    pemilikLain: null,
    teks: 'already built in — Shell / Bash ships with Zephyr; this pack only adds the remaining extension .fish',
  },
  'zephyr.lang-xml': {
    id: 'zephyr.lang-xml',
    jenis: 'ekstensi-sisa',
    bahasa: 'XML / HTML',
    ekstensiDitambah: ['.xsd', '.xsl', '.xhtml'],
    ekstensiTidakEfek: [],
    pemilikLain: null,
    teks:
      'already built in — XML / HTML ships with Zephyr; this pack only adds the remaining extensions ' +
      '.xsd, .xsl, .xhtml',
  },
};

/** Label untuk satu id paket, atau `null` kalau kartunya tidak perlu catatan tambahan. */
export function labelPaket(id: string): LabelPaket | null {
  return Object.prototype.hasOwnProperty.call(LABEL_PAKET, id) ? LABEL_PAKET[id] : null;
}

/** Semua label, urut id - dipakai uji untuk membandingkan dengan turunan dari sumber. */
export function daftarLabelPaket(): LabelPaket[] {
  return Object.keys(LABEL_PAKET)
    .sort()
    .map((k) => LABEL_PAKET[k]);
}
