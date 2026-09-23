// subagentRoles.ts — peran subagent (T4.2).
//
// KENAPA peran, bukan sekadar nama: "Comet" tidak memberi tahu apa pun tentang
// pekerjaannya. Dengan peran, user tahu SIAPA yang dipanggil untuk APA, dan
// agent utama bisa merutekan tugas ke peran yang tepat.
//
// PERBEDAAN DENGAN TEDI: TEDI memakai 10 nama (comet, nebula, nova, ...) yang
// masing-masing adalah agen terpisah dengan prompt sendiri. Di Zephyr, peran
// adalah KATEGORI kerja yang bisa dipakai berulang — jumlah agen tetap dibatasi
// Settings, dan nama (Comet/Odyssey/...) tetap dipakai sebagai identitas
// instance. Jadi "Comet dengan peran Cari" — bukan "agen bernama Comet".
//
// ROLES:
//   cari    — baca kode, cari pemakaian, petakan struktur
//   telaah  — analisis mendalam: bug sulit, arsitektur, trade-off
//   rencana — susun rencana yang bisa dieksekusi
//   audit   — periksa apakah perubahan/rencana benar-benar jalan
//   kerja   — kerjakan satu tugas nyata sampai selesai (butuh izin tulis)
//   jelajah — riset pustaka/dokumentasi eksternal

export type PeranId = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';

export interface Peran {
  id: PeranId;
  label: string;
  /** penjelasan satu baris untuk UI */
  hint: string;
  /** ikon teks (SVG per-peran terlalu berat untuk daftar) */
  ikon: string;
  /** apakah peran ini butuh menulis file */
  butuhTulis: boolean;
  /** arahan yang disisipkan ke prompt subagent */
  arahan: string;
  /** kata kunci untuk menebak peran dari teks tugas */
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

/** Label peran untuk ditampilkan; peran tak dikenal ditampilkan apa adanya. */
export function infoPeran(id: string | undefined): Peran | null {
  if (!id) return null;
  return PERAN_BY_ID.get(id as PeranId) ?? null;
}

/**
 * Tebak peran yang cocok dari teks tugas.
 *
 * Ini HEURISTIK, bukan penentu: user tetap bisa memilih peran sendiri (atau
 * memaksa lewat prefix). Tujuannya hanya supaya tugas yang jelas-jelas
 * penelusuran tidak dijalankan oleh pekerja yang mencoba menulis file.
 */
export function tebakPeran(tugas: string): PeranId {
  const t = tugas.toLowerCase();
  // Skor: jumlah kata kunci yang cocok, diutamakan yang lebih spesifik.
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

/** Prefix yang bisa dipakai user untuk memaksa peran: "@cari ...", "@kerja ...". */
export function peranDariPrefix(tugas: string): { peran: PeranId | null; sisa: string } {
  const m = tugas.match(/^\s*@(cari|telaah|rencana|audit|kerja|jelajah)\b\s*(.*)$/is);
  if (!m) return { peran: null, sisa: tugas };
  return { peran: m[1].toLowerCase() as PeranId, sisa: m[2] };
}
