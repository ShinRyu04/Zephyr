/*
 * Deteksi jawaban yang mengulang-ulang dirinya sendiri.
 *
 * Model yang masuk loop degeneratif bisa menghabiskan SELURUH anggaran
 * outputnya untuk mengulang satu fragmen. Tanpa penjaga, jawaban itu tetap
 * dikirim, tetap ditagih, dan tetap tampil. Satu insiden di Hermes Agent:
 * jawaban 60.000 karakter terkirim sebagai 31 pesan terpisah.
 *
 * Algoritma ini diadaptasi dari `agent/repetition_guard.py` milik Hermes
 * Agent. Tiga lapis, disengaja konservatif - hanya ulangan panjang yang
 * benar-benar verbatim yang memicunya, sehingga kutipan, judul berulang, kode
 * yang mirip, dan baris tabel yang mirip TIDAK salah tuduh.
 */

/* Di bawah panjang ini pemeriksaan tidak jalan: potongan pendek yang terpotong
 * memang wajar mengandung token berulang, dan melanjutkannya adalah hal benar. */
export const MIN_FRAGMENT_LENGTH = 400;

/* Jendela ulangan persis. Jauh melampaui pengulangan frasa biasa (kutipan,
 * judul, kode serupa). */
const REPEAT_WINDOW = 60;

/* Jendela yang muncul paling sedikit sebanyak ini sudah jadi sinyal, bahkan
 * untuk fragmen pendek. */
const MIN_REPEAT_COUNT = 5;

/* "Didominasi ulangan" = jendela berulang menutupi minimal fraksi ini. */
const DOMINANCE_RATIO = 0.5;

/* Di jalur finish_reason="stop" kita MEMBUANG jawaban yang sudah lengkap, jadi
 * hanya berhenti pada skala pelarian. Loop nyata di jalur stop berjalan
 * 80.000-350.000 karakter, sedangkan ulangan yang DIMINTA user ("ulangi X 50
 * kali", baris tabel identik, YAML berkala) tetap di kisaran kilobyte dan wajib
 * disampaikan apa adanya. */
export const STOP_PATH_MIN_CHARS = 16_000;

/* Jalur pelarian juga mensyaratkan bentuknya: mayoritas baris adalah salinan.
 * Output batch (baris INSERT berbeda-beda) berbagi awalan panjang dan bisa
 * memicu pemindaian jendela, padahal setiap baris unik. Loop mengeluarkan
 * baris yang sama berulang kali. */
const RUNAWAY_DISTINCT_LINE_RATIO = 0.5;

/* Sampling menjaga jalur umum tetap linear terhadap ukuran output dengan
 * pengali tetap yang kecil. */
const MAX_ANCHOR_SAMPLES = 32;
const MAX_ANCHOR_MATCHES = 8;

/**
 * Teks pengganti saat jawaban terbukti mengulang.
 *
 * Memutar ulang byte yang ngulang itu justru MENYEMAI loop di permintaan
 * berikutnya, dan kerusakannya bertahan sampai aplikasi dimulai ulang. Model
 * hanya perlu tahu bahwa balasannya rusak dan dipotong.
 */
export const REPETITION_LOOP_INTERRUPTED =
  '[balasan ini rusak menjadi pengulangan dan dihentikan]';

export interface HasilDeteksi {
  /** true bila fragmen didominasi ulangan persis. */
  mengulang: boolean;
  /** true bila cukup parah untuk membuang jawaban yang sudah selesai. */
  pelarian: boolean;
  /** Alasan singkat, untuk log dan tooltip. Kosong bila tidak mengulang. */
  alasan: string;
  /** Cakupan ulangan 0..1, perkiraan kasar untuk ditampilkan. */
  cakupan: number;
}

/** Baris kosong dibuang, sisanya dirapikan. */
function barisBersih(teks: string): string[] {
  return teks
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/**
 * true bila satu baris yang dinormalkan menutupi separuh fragmen lewat
 * pengulangan - bentuk gema yang paling umum.
 */
function barisMendominasi(n: number, baris: string[]): number {
  if (baris.length === 0) return 0;
  const hitung = new Map<string, number>();
  for (const b of baris) hitung.set(b, (hitung.get(b) ?? 0) + 1);

  let terbaik = 0;
  for (const [b, c] of hitung) {
    if (c < MIN_REPEAT_COUNT) continue;
    const cakupan = (c * b.length) / n;
    if (cakupan > terbaik) terbaik = cakupan;
  }
  return terbaik;
}

/**
 * true bila satu jendela REPEAT_WINDOW karakter muncul cukup sering untuk
 * menutupi separuh teks. Menangkap loop yang ulangannya berbeda hanya karena
 * penghitung atau token pengganggu.
 */
function jendelaMendominasi(teks: string, n: number): number {
  const perlu = Math.max(MIN_REPEAT_COUNT, Math.ceil((n * DOMINANCE_RATIO) / REPEAT_WINDOW));
  const hitung = new Map<string, number>();
  const posisi = new Map<string, number[]>();
  let terbaik = 0;

  for (let i = 0; i + REPEAT_WINDOW <= n; i++) {
    const kunci = teks.slice(i, i + REPEAT_WINDOW);
    const c = (hitung.get(kunci) ?? 0) + 1;
    hitung.set(kunci, c);

    if (c === perlu) {
      /* Saat sebuah kunci pertama kali menyentuh ambang, catat SEMUA
       * kemunculannya. Dulu di sini saya memakai `(c * REPEAT_WINDOW) / n`,
       * dan itu salah: jendela yang tumpang tindih menghitung teks yang sama
       * berkali-kali, jadi cakupannya bisa keluar jauh di atas 1.0 (pernah
       * terbaca 5.625). */
      const arr = posisi.get(kunci);
      if (arr) {
        /* Gabungkan rentang yang bertumpuk jadi satu daftar rentang terpisah,
         * lalu jumlahkan panjangnya. Itu cakupan sebenarnya. */
        const rentang: Array<[number, number]> = [];
        for (let k = 0; k < arr.length; k++) {
          const mulai = arr[k];
          const akhir = mulai + REPEAT_WINDOW;
          if (rentang.length && mulai <= rentang[rentang.length - 1][1]) {
            rentang[rentang.length - 1][1] = Math.max(rentang[rentang.length - 1][1], akhir);
          } else {
            rentang.push([mulai, akhir]);
          }
        }
        const luas = rentang.reduce((s, [a, b]) => s + (b - a), 0);
        terbaik = Math.max(terbaik, Math.min(1, luas / n));
      }
    }

    const arr = posisi.get(kunci);
    if (arr) arr.push(i);
    else posisi.set(kunci, [i]);
  }
  return terbaik;
}

/** Kembangkan satu jendela yang sudah diketahui sama ke batas [kiri, kanan). */
function kembangkanLari(
  teks: string,
  n: number,
  mulai: number,
  periode: number,
  cocok: number,
): [number, number] {
  let kiri = mulai;
  while (kiri > 0 && teks[kiri - 1] === teks[kiri - 1 + periode]) kiri--;

  let kanan = mulai + cocok;
  while (kanan + periode < n && teks[kanan] === teks[kanan + periode]) kanan++;

  return [kiri, kanan + periode];
}

/**
 * true bila ada satu lari periodik persis yang dominan. Mencocokkan jangkar
 * jendela di posisi yang lebih jauh memberi kandidat periode; mengembangkan
 * kesamaan ke dua arah memulihkan lari penuhnya, sehingga cakupan diukur
 * memakai unit berulang yang sebenarnya - bukan hanya REPEAT_WINDOW karakter
 * per kemunculan.
 */
function lariPeriodikMendominasi(teks: string, n: number): number {
  const mulaiMaks = n - REPEAT_WINDOW;
  if (mulaiMaks < 1) return 0;

  const langkah = Math.max(1, Math.ceil((mulaiMaks + MAX_ANCHOR_SAMPLES - 2) / (MAX_ANCHOR_SAMPLES - 1)));
  const jangkar: number[] = [];
  for (let s = 0; s <= mulaiMaks; s += langkah) jangkar.push(s);
  if (jangkar[jangkar.length - 1] !== mulaiMaks) jangkar.push(mulaiMaks);

  /* Lari yang sudah dikembangkan lalu ditolak, sebagai [kiri, kanan, periode].
   * Jangkar berikutnya di dalam salah satunya yang periodenya kelipatan akan
   * menelusuri lari yang sama, jadi dilewati. */
  const ditolak: Array<[number, number, number]> = [];
  let terbaik = 0;

  for (const mulai of jangkar) {
    const kunci = teks.slice(mulai, mulai + REPEAT_WINDOW);
    let cari = mulai + 1;

    for (let k = 0; k < MAX_ANCHOR_MATCHES; k++) {
      const cocok = teks.indexOf(kunci, cari);
      if (cocok < 0) break;

      const periode = cocok - mulai;
      cari = cocok + 1;

      const sudahDitolak = ditolak.some(
        ([lo, hi, p]) => lo <= mulai && mulai < hi && periode % p === 0,
      );
      if (sudahDitolak) continue;

      const [kiri, kanan] = kembangkanLari(teks, n, mulai, periode, REPEAT_WINDOW);
      const panjang = kanan - kiri;
      if (panjang >= MIN_REPEAT_COUNT * periode && panjang >= n * DOMINANCE_RATIO) {
        terbaik = Math.max(terbaik, panjang / n);
      }
      ditolak.push([kiri, kanan, periode]);
    }
  }
  return terbaik;
}

/**
 * true bila fragmen didominasi ulangan persis.
 *
 * Fail-open untuk masukan pendek dan untuk masukan yang bukan teks: penjaga
 * yang salah menuduh jawaban benar jauh lebih merugikan daripada satu loop
 * yang lolos.
 */
export function mengulangDominan(teks: string): { ya: boolean; cakupan: number; alasan: string } {
  if (typeof teks !== 'string') return { ya: false, cakupan: 0, alasan: '' };

  const n = teks.length;
  if (n < MIN_FRAGMENT_LENGTH) return { ya: false, cakupan: 0, alasan: '' };

  const baris = barisBersih(teks);

  /* Jalur cepat: satu baris yang diulang cukup untuk menutupi separuh fragmen. */
  const cBaris = barisMendominasi(n, baris);
  if (cBaris >= DOMINANCE_RATIO) {
    return { ya: true, cakupan: cBaris, alasan: 'satu baris diulang menutupi sebagian besar balasan' };
  }

  const cJendela = jendelaMendominasi(teks, n);
  if (cJendela >= DOMINANCE_RATIO) {
    return { ya: true, cakupan: cJendela, alasan: `satu potongan ${REPEAT_WINDOW} karakter diulang terus` };
  }

  const cLari = lariPeriodikMendominasi(teks, n);
  if (cLari >= DOMINANCE_RATIO) {
    return { ya: true, cakupan: cLari, alasan: 'satu unit panjang disalin berulang kali' };
  }

  return { ya: false, cakupan: 0, alasan: '' };
}

/**
 * Lebih ketat daripada `mengulangDominan`: juga mensyaratkan bentuk pelarian.
 *
 * Dipakai HANYA saat kita akan MEMBUANG jawaban yang sudah selesai, jadi
 * jawaban benar yang kebetulan berulang (baris batch yang berbeda-beda) tidak
 * boleh lolos syarat. Selain harus dominan, kalau teksnya punya struktur baris
 * maka maksimal separuh baris non-kosongnya boleh berbeda.
 */
export function mengulangPelarian(teks: string): { ya: boolean; cakupan: number; alasan: string } {
  if (typeof teks !== 'string') return { ya: false, cakupan: 0, alasan: '' };
  if (teks.length < STOP_PATH_MIN_CHARS) return { ya: false, cakupan: 0, alasan: '' };

  const dasar = mengulangDominan(teks);
  if (!dasar.ya) return { ya: false, cakupan: 0, alasan: '' };

  const baris = barisBersih(teks);
  if (baris.length < MIN_REPEAT_COUNT) {
    /* Tidak ada struktur baris untuk dinilai: loop satu baris yang dominan. */
    return { ya: true, cakupan: dasar.cakupan, alasan: `${dasar.alasan} (tanpa struktur baris)` };
  }

  const unik = new Set(baris).size;
  if (unik <= baris.length * RUNAWAY_DISTINCT_LINE_RATIO) {
    return { ya: true, cakupan: dasar.cakupan, alasan: `${dasar.alasan} dan hanya ${unik} baris berbeda` };
  }

  /* Berulang, tapi barisnya hampir semua berbeda - kemungkinan besar output
   * batch yang sah. Jangan buang. */
  return { ya: false, cakupan: dasar.cakupan, alasan: '' };
}
