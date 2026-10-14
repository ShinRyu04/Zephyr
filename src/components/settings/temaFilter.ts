/**
 * Satu jalur penyaring untuk daftar tema.
 *
 * ## Kenapa berkas sendiri, bukan di dalam komponen
 *
 * Halaman Tema punya satu kotak cari, tapi tiga hal yang harus menjawab daftar
 * yang sama persis: kisinya sendiri, hitungan "n dari m tema", dan keadaan
 * kosong "tidak ada tema yang cocok". Kalau tiap pemakai menyaring dengan
 * caranya sendiri, hitungan bisa menyebut 7 sementara kisi menampilkan 5 dan
 * tidak ada yang tahu mana yang benar. Satu fungsi, dipanggil dari satu tempat,
 * membuat ketiganya mustahil berbeda.
 *
 * ## Kenapa murni
 *
 * Tanpa DOM, tanpa store, tanpa kamus i18n. Penerjemah teks petunjuk
 * disuntikkan lewat parameter keempat, dan itu bukan kerapian belaka: kartu
 * menampilkan teks yang sudah diterjemahkan ("nyaman di mata"), jadi orang
 * mencari dengan kata itu - bukan dengan kunci kamusnya
 * ("theme.hint.everforest"). Tanpa suntikan itu, pencarian hanya cocok pada
 * kunci dan setiap pembaca yang mengetik kata yang benar-benar ia lihat
 * mendapat "tidak ada tema yang cocok".
 *
 * Efek sampingnya berguna: harness bisa menguji fungsi ini apa adanya, tanpa
 * React dan tanpa i18n.
 *
 * ## Kata kunci yang dimengerti
 *
 * Dua kata dibuang karena tidak menunjuk tema apa pun: `tema` / `theme` (kata
 * bendanya sendiri; mengetik "tema nord" harus tetap menemukan Nord). Empat kata
 * lain diterjemahkan menjadi jenis tema, karena itulah yang paling sering
 * diketik orang: `gelap`/`dark` dan `terang`/`light`. Kata jenis di dalam kueri
 * bersifat DAN dengan pil jenis: pil "Gelap" + kueri "terang" memang tidak punya
 * jawaban, dan mengembalikan daftar penuh di situ akan berbohong.
 */

/** Bagian tema yang dipakai penyaring. Sengaja struktural: `ThemeInfo` cocok. */
export interface TemaRingkas {
  id: string;
  label: string;
  kind: 'dark' | 'light';
  /** Kunci kamus atau teks jadi - apa pun yang dibaca pembaca di kartu. */
  hint: string;
}

export type JenisTema = 'semua' | 'dark' | 'light';

const KATA_BASIS = new Set(['tema', 'theme']);

const KATA_JENIS: Record<string, Exclude<JenisTema, 'semua'>> = {
  gelap: 'dark',
  dark: 'dark',
  terang: 'light',
  light: 'light',
};

/** Semua yang boleh dicocokkan kueri, dalam huruf kecil. */
function hamparan(t: TemaRingkas, terjemah: (s: string) => string): string {
  return `${t.label} ${t.id} ${terjemah(t.hint)}`.toLowerCase();
}

/** Pisahkan kueri menjadi kata pencarian + jenis yang diminta di dalam kueri. */
export function pecahKueri(kueri: string): { kata: string[]; jenis: JenisTema; mustahil: boolean } {
  const kata: string[] = [];
  let jenis: JenisTema = 'semua';
  let mustahil = false;
  for (const k of kueri.trim().toLowerCase().split(/\s+/)) {
    if (!k || KATA_BASIS.has(k)) continue;
    const j = KATA_JENIS[k];
    if (!j) {
      kata.push(k);
      continue;
    }
    /* Dua kata jenis yang bertentangan ("gelap light") tidak punya jawaban;
       mengembalikan daftar penuh di situ akan berbohong. */
    if (jenis !== 'semua' && jenis !== j) mustahil = true;
    jenis = j;
  }
  return { kata, jenis, mustahil };
}

/**
 * Saring daftar tema.
 *
 * `terjemah` sengaja berakhir sebagai parameter, bukan impor: modul ini harus
 * tetap bisa dipanggil dari harness node tanpa i18n, dan dari komponen dengan
 * `useT()` yang sebenarnya.
 */
export function saringTema<T extends TemaRingkas>(
  daftar: readonly T[],
  kueri: string,
  jenis: JenisTema = 'semua',
  terjemah: (s: string) => string = (s) => s,
): T[] {
  const { kata, jenis: jenisKueri, mustahil } = pecahKueri(kueri);
  if (mustahil) return [];
  return daftar.filter((t) => {
    if (jenis !== 'semua' && t.kind !== jenis) return false;
    if (jenisKueri !== 'semua' && t.kind !== jenisKueri) return false;
    if (kata.length === 0) return true;
    const h = hamparan(t, terjemah);
    return kata.every((k) => h.includes(k));
  });
}
