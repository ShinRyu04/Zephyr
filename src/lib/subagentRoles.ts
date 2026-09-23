export type PeranId = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

export interface Peran {
  id: PeranId;
  label: string;

  hint: string;

  ikon: string;

  butuhTulis: boolean;

  arahan: string;

  kunci: string[];
}

export const PERAN: Peran[] = [
  {
    id: 'cari',
    label: 'Cari',
    hint: 'Telusuri kode: cari pemakaian, petakan struktur, temukan definisi',
    ikon: '⌕',
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
    ikon: '◈',
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
    ikon: '≡',
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
    ikon: '✓',
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
    ikon: '⚒',
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
    ikon: '⊕',
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
      if (t.includes(k)) skor += k.length; // kata kunci panjang = lebih spesifik
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
