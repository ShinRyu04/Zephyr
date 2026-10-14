/**
 * Bentuk tugas tulis - pembaca BENTUK permintaan user, plus batas langkah.
 *
 * CATATAN LOKASI TEKS SODOKAN: berkas ini dulu juga memegang kalimat sodokannya
 * (`pesanSodokRencana`, `pesanSodokTulis`, `pesanHentiTanpaTulis`,
 * `pesanKerjaLog`). Keempatnya DIHAPUS karena tidak pernah dipanggil siapa pun -
 * teks yang benar-benar dikirim ke provider disusun di `aiStore.ts`
 * (`statusPekerjaan()` untuk kerja-log + "berhenti membaca", dan blok sesudah
 * pemadatan konteks untuk suntikan ulang rencana/tugas). Dua berkas berisi versi
 * kalimat yang hampir sama itu jebakan: yang menelusuri "kenapa agen tidak
 * menulis berkas" akan membaca versi mati ini dan menyimpulkan penjaganya tidak
 * jalan. Teksnya sekarang cuma satu tempat.
 * ## Kenapa berkas ini ada
 *
 * Gejala yang dilaporkan pada tugas besar: agen membaca berkas berjam-jam,
 * jarang menulis, rencana (`todo_write`) tidak pernah dibuat, lalu berhenti di
 * tengah. Penjaga yang sudah ada tidak menangkapnya karena semuanya BERTUMPU
 * pada dua hal yang justru tidak ada pada run seperti itu:
 *
 *   - `langkahTanpaKemajuan` hanya menghitung langkah yang tidak mengubah apa
 *     pun, jadi membaca berkas BARU berulang-ulang tidak pernah menyentuhnya;
 *   - seluruh sodokan "lanjutkan rencanamu" membaca `agentTodos`, dan kalau
 *     rencananya kosong (`todo 0/8`) tidak ada satu pun yang menembak.
 *
 * Berkas ini mengisi dua celah itu dengan predikat MURNI yang bisa diuji di
 * Node tanpa menjalankan agen: apakah permintaan user berbentuk tugas tulis,
 * dan kalimat apa yang harus disodokkan pada langkah ke-N.
 *
 * Semua fungsi di sini bebas efek samping - penghitungnya hidup di aiStore.
 */

/* ------------------------------------------------------------------ */
/* Bentuk tugas                                                       */
/* ------------------------------------------------------------------ */

export type BentukTugas = 'tulis' | 'baca' | 'netral';

/**
 * Kata kerja yang berarti permintaan itu HARUS menghasilkan perubahan di disk.
 *
 * Sengaja Indonesia + Inggris: user di sini menulis keduanya, dan modelnya
 * sering menyalin istilah dari prompt.
 */
const KATA_TULIS: RegExp[] = [
  /\b(buat|buatkan|bikin|bikinin|bikinkan|bikinlah|sebikin)\b/i,
  /\b(tulis|tulislah|ditulis|menulis|tuliskan)\b/i,
  /\b(tambah|tambahkan|tambahin|sisipkan|selipkan|lengkapi)\b/i,
  /\b(hapus|hapuskan|hilangkan|buang)\b/i,
  /\b(ubah|ubahlah|rubah|ubahin|ganti|gantiin|gantikan)\b/i,
  /\b(perbaiki|perbaikilah|benerin|betulin|fix|fixes|perbaikan)\b/i,
  /\b(edit|sunting|modifikasi|modif)\b/i,
  /\b(refactor|refaktor|rewrite|tulis ulang|susun ulang)\b/i,
  /\b(pindah|pindahkan|rename|ganti nama|migrasi|migrasikan)\b/i,
  /\b(install|pasang|pasangkan|setup|set up|siapkan|scaffold|bootstrap)\b/i,
  /\b(generate|implement|implementasikan|terapkan|integrasikan)\b/i,
  /\b(upgrade|update|perbarui|perbaharui|tingkatkan)\b/i,
  /\b(lanjutkan|selesaikan|rampungkan|kerjakan|garap|eksekusi)\b/i,
  /\b(add|create|write|make|build|generate|implement|fix|modify|update|upgrade|refactor|remove|delete|rename|move|install|scaffold|convert|port)\b/i,
];

/**
 * Kata yang menandai permintaan PENJELASAN, bukan perubahan.
 *
 * Dipakai sebagai cadangan saja: kalau keduanya cocok, tugas tulis yang menang,
 * karena "baca berkas ini lalu perbaiki" memang harus berakhir dengan tulisan.
 */
const KATA_BACA: RegExp[] = [
  /\b(apa|apakah|mengapa|kenapa|bagaimana|gimana|jelaskan|jelasin|penjelasan)\b/i,
  /\b(analisa|analisis|analisalah|audit|review|tinjau|periksa|cek|periksa dulu)\b/i,
  /\b(ringkas|ringkasan|rangkum|rangkuman|kesimpulan|summarize|summarise)\b/i,
  /\b(cari|carikan|temukan|lihat|tampilkan|tunjukkan|daftar|list|baca|bacakan)\b/i,
  /\b(di ?mana|what|why|how|where|explain|find|search|show|inspect|analyze|analyse|check)\b/i,
];

/**
 * Kata tanya di AWAL permintaan.
 *
 * Dipakai untuk memisahkan kalimat TANYA dari perintah. Batasnya awal pesan
 * (atau `?` di ujung), bukan "mengandung": kata tanya yang muncul di tengah
 * ("buat apa saja yang perlu") tetap perintah, sedangkan "kenapa build gagal?"
 * adalah pertanyaan meski di dalamnya ada kata kerja tulis (`build`).
 */
const KATA_TANYA_AWAL =
  /^\s*(?:apa|apakah|kenapa|mengapa|bagaimana|gimana|kok|berapa|mana|di ?mana|kapan|siapa|what|why|how|where|which|who|when|is|are|does|did|can|could|should)\b/i;

/**
 * Berapa KALI kata kerja tulis muncul (bukan berapa jenis).
 *
 * Bedanya penting: "buat a lalu buat b" menyentuh satu pola dua kali, dan yang
 * menentukan tugas majemuk adalah JUMLAH aksinya, bukan keragaman katanya.
 */
function jumlahTulis(teks: string): number {
  let n = 0;
  for (const re of KATA_TULIS) {
    const m = teks.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
    if (m) n += m.length;
  }
  return n;
}

/** Berapa JENIS kata kerja tulis yang muncul - untuk kalimat tanya. */
function jenisTulis(teks: string): number {
  return KATA_TULIS.filter((re) => re.test(teks)).length;
}

/** Permintaan ini berbentuk pertanyaan, bukan perintah? */
export function pertanyaan(teks: string | null | undefined): boolean {
  const t = String(teks ?? '').trim();
  if (!t) return false;
  return t.endsWith('?') || KATA_TANYA_AWAL.test(t);
}

/**
 * Bentuk tugas dari teks permintaan user.
 *
 * Tulis menang atas baca - lihat catatan di `KATA_BACA`.
 *
 * PENGECUALIAN untuk pertanyaan: "kenapa build gagal, jelaskan seluruh
 * langkahnya" adalah pertanyaan yang kebetulan memuat kata kerja tulis
 * (`build`), dan dulu itu cukup untuk membuat agen merasa harus MENGUBAH
 * sesuatu. Pertanyaan hanya dianggap tugas tulis kalau di dalamnya ada DUA
 * aksi tulis atau lebih (perintah majemuk yang nyata); satu kata kerja di
 * kalimat tanya tetap pertanyaan. Inilah cara "mengalah kalau user cuma
 * bertanya" ditegakkan - deterministik, bukan tebakan model.
 */
export function bentukTugas(teks: string | null | undefined): BentukTugas {
  const t = String(teks ?? '');
  if (!t.trim()) return 'netral';
  const ada = jumlahTulis(t);
  if (ada > 0) {
    if (!pertanyaan(t)) return 'tulis';
    /* Di kalimat tanya, pengulangan kata yang sama ("kenapa build gagal...
       proses build") tidak menandakan dua aksi - yang menandakan perintah
       majemuk adalah keragaman kata kerjanya. */
    return jenisTulis(t) >= 2 ? 'tulis' : 'baca';
  }
  if (KATA_BACA.some((re) => re.test(t))) return 'baca';
  return 'netral';
}

/* ------------------------------------------------------------------ */
/* Tugas majemuk                                                      */
/* ------------------------------------------------------------------ */

/**
 * Kata sambung yang merangkai DUA aksi jadi satu permintaan.
 *
 * Ini pembeda "langkah majemuk" dari "satu perubahan": tanpa sambung, dua kata
 * kerja biasanya cuma sinonim yang menerangkan satu hal yang sama.
 */
const KATA_SAMBUNG =
  /\b(lalu|lantas|kemudian|setelah itu|sesudah itu|selanjutnya|terus|serta|dan|then|after that|and then|and)\b/i;

/** Baris daftar bernomor/peluru - permintaan yang user sendiri sudah rincikan. */
function jumlahDaftar(teks: string): number {
  return (teks.match(/(?:^|\n)\s*(?:\d{1,2}[.)]|[-*•])\s+\S/g) ?? []).length;
}

/**
 * Permintaan yang berisi BEBERAPA langkah, bukan satu.
 *
 * Dua bentuknya: daftar rincian milik user (tiga item atau lebih - itu sudah
 * rencana, cuma belum ditulis di todo), atau dua aksi tulis yang dirangkai kata
 * sambung ("buat skema lalu tambahkan migrasi"). Keduanya adalah tugas yang
 * urutannya perlu diputuskan SEBELUM langkah pertama, sehingga `todo_write`
 * memang alat yang benar untuk mengawali.
 */
export function permintaanMajemuk(teks: string | null | undefined): boolean {
  const t = String(teks ?? '');
  if (!t.trim()) return false;
  if (jumlahDaftar(t) >= 3) return true;
  if (!KATA_SAMBUNG.test(t)) return false;
  return jumlahTulis(t) >= 2;
}

/* ------------------------------------------------------------------ */
/* Batas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Langkah hanya-baca sebelum menulis dipaksa.
 *
 * Delapan mengikuti bukti dari run toko: pada 40+ berkas, model menghabiskan
 * belasan langkah pertama untuk membaca dan tidak pernah menulis berkas
 * berikutnya. Di bawah delapan, run yang sehat (membaca 3-4 berkas lalu menulis)
 * masih aman.
 */
export const BATAS_TULIS_PAKSA = 8;
