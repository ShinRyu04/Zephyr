export type PeranId = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

/** One glyph per role, drawn in `peranIcons.ts`. */
export type PeranIkon = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

export interface Peran {
  id: PeranId;
  label: string;

  hint: string;

  /**
   * Glyph id from `peranIcons.ts`.
   *
   * Was a text character ("⌕", "◈", "⚒"). Those render at whatever weight the
   * font happens to have, drift in size between platforms, and read as
   * decoration rather than as a mark — the list is scanned by shape, so the
   * shapes have to be drawn, not borrowed from a font.
   */
  ikon: PeranIkon;

  butuhTulis: boolean;

  arahan: string;

  kunci: string[];
}

export const PERAN: Peran[] = [
  {
    id: 'cari',
    label: 'Cari',
    hint: 'Telusuri kode: cari pemakaian, petakan struktur, temukan definisi',
    ikon: 'cari',
    butuhTulis: false,
    arahan:
      'Kamu pekerja PENELUSURAN. Tugasmu memetakan kode: cari pemakaian, temukan definisi, ' +
      'jelaskan struktur. Jangan mengubah apa pun. Laporkan: berkas mana, baris berapa, dan apa ' +
      'yang kamu temukan — dengan kutipan singkat sebagai bukti.',
    kunci: ['cari', 'temukan', 'pemakaian', 'struktur', 'dimana', 'di mana', 'list', 'daftar', 'peta'],
  },
  {
    id: 'telaah',
    label: 'Telaah',
    hint: 'Analisis mendalam: bug sulit, arsitektur, trade-off',
    ikon: 'telaah',
    butuhTulis: false,
    arahan:
      'Kamu PENELAAH. Tugasmu menganalisis: mengapa sesuatu gagal, apa risiko desainnya, apa ' +
      'trade-off-nya. Jangan mengubah apa pun. Berikan analisis yang menyebut bukti konkret ' +
      '(berkas, baris, perilaku), bukan dugaan. Kalau kamu tidak yakin, katakan bagian mana yang ' +
      'belum terbukti.',
    kunci: ['analisis', 'kenapa', 'mengapa', 'bug', 'risiko', 'arsitektur', 'trade', 'review', 'telaah'],
  },
  {
    id: 'rencana',
    label: 'Rencana',
    hint: 'Susun rencana langkah yang bisa langsung dieksekusi',
    ikon: 'rencana',
    butuhTulis: false,
    arahan:
      'Kamu PERENCANA. Tugasmu menyusun rencana yang bisa dieksekusi orang lain tanpa bertanya ' +
      'lagi: langkah berurutan, berkas yang disentuh, dan cara memverifikasi tiap langkah. ' +
      'Jangan mengubah apa pun. Rencana yang masih menyisakan pertanyaan desain belum selesai.',
    kunci: ['rencana', 'plan', 'rancang', 'desain', 'langkah', 'strategi'],
  },
  {
    id: 'audit',
    label: 'Audit',
    hint: 'Periksa apakah rencana/perubahan benar-benar jalan',
    ikon: 'audit',
    butuhTulis: false,
    arahan:
      'Kamu AUDITOR. Tugasmu memeriksa: apakah rencana atau perubahan ini benar-benar bisa jalan? ' +
      'Cari kasus yang terlewat, asumsi yang salah, dan langkah yang belum lengkap. Jangan mengubah ' +
      'apa pun. Jawab dengan daftar temuan + tingkat keyakinan, bukan penilaian umum.',
    kunci: ['audit', 'periksa', 'cek', 'verifikasi', 'validasi', 'bisa jalan', 'feasible'],
  },
  {
    id: 'kerja',
    label: 'Kerja',
    hint: 'Kerjakan satu tugas nyata sampai selesai (perlu izin tulis)',
    ikon: 'kerja',
    butuhTulis: true,
    arahan:
      'Kamu PEKERJA. Tugasmu mengerjakan satu perubahan nyata sampai selesai dan terverifikasi. ' +
      'Kerjakan sebatas lingkup tugasmu — jangan melebar. Setelah selesai, jalankan pemeriksaan ' +
      '(typecheck/test) lalu laporkan apa yang berubah dan apa hasil pemeriksaannya.',
    kunci: ['perbaiki', 'ubah', 'tulis', 'implementasi', 'buat', 'tambah', 'hapus', 'fix', 'kerjakan'],
  },
  {
    id: 'jelajah',
    label: 'Jelajah',
    hint: 'Riset pustaka/dokumentasi di luar proyek',
    ikon: 'jelajah',
    butuhTulis: false,
    arahan:
      'Kamu PENJELAJAH. Tugasmu mencari tahu hal di LUAR proyek ini: perilaku pustaka, versi API, ' +
      'praktik umum. Sebut sumbernya. Kalau tidak menemukan bukti, katakan tidak menemukan — ' +
      'jangan mengarang perilaku pustaka.',
    kunci: ['pustaka', 'library', 'dokumentasi', 'docs', 'versi', 'api', 'riset', 'bandingkan'],
  },
];

export const PERAN_BY_ID = new Map(PERAN.map((p) => [p.id, p]));

export function infoPeran(id: string | undefined): Peran | null {
  if (!id) return null;
  return PERAN_BY_ID.get(id as PeranId) ?? null;
}

export function tebakPeran(tugas: string): PeranId {
  const t = tugas.toLowerCase();

  let terbaik: PeranId = 'cari';
  let skorTerbaik = -1;
  for (const p of PERAN) {
    let skor = 0;
    for (const k of p.kunci) {
      if (t.includes(k)) skor += k.length; // a longer keyword is more specific
    }
    if (skor > skorTerbaik) {
      skorTerbaik = skor;
      terbaik = p.id;
    }
  }
  return terbaik;
}

export function peranDariPrefix(tugas: string): { peran: PeranId | null; sisa: string } {
  const m = tugas.match(/^\s*@(cari|telaah|rencana|audit|kerja|jelajah)\b\s*(.*)$/is);
  if (!m) return { peran: null, sisa: tugas };
  return { peran: m[1].toLowerCase() as PeranId, sisa: m[2] };
}

/**
 * Split a task line on the `->` dependency marker.
 *
 * `buat API -> tulis test` runs "buat API" first, then "tulis test" after it
 * finishes, with the first task's result passed in as context. A line with no
 * marker is a single step. This is a chain, not a full graph: each task depends
 * on the one before it, which covers the common "B needs A's output" case.
 */
export function pisahPipeline(tugas: string): string[] {
  return tugas
    .split(/\s*->\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Optional per-task model override: `[model:<id>]` or `[model:<provider>/<id>]`
 * anywhere in the task line. Each subagent can run on a different model, so a
 * batch can pair a cheap search model with an expensive one for the hard task.
 * Everything after the tag is the task text.
 */
export function modelDariPrefix(tugas: string): { model: string | null; provider: string | null; sisa: string } {
  const m = tugas.match(/\[\s*model\s*:\s*([^\]]+?)\s*\]/i);
  if (!m) return { model: null, provider: null, sisa: tugas };
  const isi = m[1].trim();
  const slash = isi.indexOf('/');
  const provider = slash > 0 ? isi.slice(0, slash).trim() : null;
  const model = (slash > 0 ? isi.slice(slash + 1) : isi).trim() || null;
  const sisa = (tugas.slice(0, m.index) + ' ' + tugas.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { model, provider, sisa };
}
