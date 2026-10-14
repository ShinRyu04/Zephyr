/**
 * Logika murni dekorasi editor (item 182).
 *
 * ## Kenapa dipisah dari ekstensi CodeMirror
 *
 * Dua keputusan di dekorasi ini bukan soal menggambar, melainkan soal isi, dan
 * keduanya gampang salah dengan cara yang tidak kelihatan di layar:
 *
 *   1. Baris mana yang disorot. Diff git menandai baris yang DIHAPUS juga, dan
 *      baris itu tidak ada lagi di buffer. Menyorot "baris berikutnya" untuk
 *      penghapusan berarti menuduh baris yang tidak disentuh siapa pun. Karena
 *      itu penghapusan tidak menghasilkan kelas sama sekali - batang di gutter
 *      sudah cukup memberi tahu bahwa ada yang hilang.
 *
 *   2. Saran mana yang layak ditempel. Model sering mengembalikan seluruh baris
 *      termasuk bagian yang SUDAH diketik. Menempelkannya apa adanya menduplikasi
 *      teks di layar - persis kesalahan yang paling mahal di fitur ini, karena
 *      hasilnya tampak benar sampai orang menekan Tab. Fungsi di bawah
 *      memotong bagian yang sudah ada dan menolak saran yang tidak menambah
 *      apa pun.
 *
 * Karena keduanya murni, keduanya juga bisa diuji apa adanya, tanpa browser dan
 * tanpa model - itulah syarat "bisa diuji tanpa model" pada item ini. Berkas ini
 * sengaja TIDAK mengimpor apa pun: harness mengubahnya menjadi JavaScript lalu
 * memanggilnya langsung.
 */
import type { BarisUbah } from '../../lib/gitBars';

/** Batas jumlah baris yang disorot; diff raksasa tidak boleh membuat render berat. */
export const SOROT_MAX = 500;

/**
 * Kelas CSS untuk satu baris yang berubah.
 *
 * `deleted` sengaja kosong: tidak ada baris di buffer untuk diwarnai. Lihat
 * catatan berkas.
 */
export function kelasBaris(jenis: BarisUbah['jenis']): string {
  if (jenis === 'added') return 'cm-dekorasi-baru';
  if (jenis === 'modified') return 'cm-dekorasi-ubah';
  return '';
}

/**
 * Buang baris ganda dan baris di luar dokumen, urutkan menaik, batasi jumlahnya.
 *
 * Satu baris bisa muncul dua kali di diff (satu hunk `+`, hunk lain `-`/`+`),
 * dan `Decoration.set` menuntut rentang terurut; keduanya diselesaikan di sini
 * alih-alih di dalam StateField yang sama-sama harus membacanya.
 */
export function barisUnik(list: readonly BarisUbah[], jumlahBaris: number): BarisUbah[] {
  const per = new Map<number, BarisUbah>();
  for (const b of list) {
    /* Nomor baris wajib bilangan bulat: `doc.line(1.5)` bukan permintaan yang
       masuk akal, dan membiarkannya lewat berarti dekorasi dipasang di baris
       hasil pembulatan yang tidak diminta diff mana pun. */
    if (!Number.isInteger(b.line) || b.line < 1 || b.line > jumlahBaris) continue;
    if (!kelasBaris(b.jenis)) continue;
    /* Yang pertama menang: `added` di hunk pertama lebih informatif daripada
       `modified` di hunk berikutnya untuk baris yang sama. */
    if (!per.has(b.line)) per.set(b.line, b);
  }
  return [...per.values()].sort((a, b) => a.line - b.line).slice(0, SOROT_MAX);
}

/**
 * Saran yang layak ditempel, atau `''` bila tidak ada yang perlu ditambahkan.
 *
 * `sebelum` = teks baris ini dari awal baris sampai kursor, `sesudah` = sisa
 * baris setelah kursor. Keduanya dipakai untuk dua kesalahan yang berbeda:
 * mengulang yang sudah diketik (sufiks `sebelum` yang juga awal saran), dan
 * menyarankan teks yang sudah ada di sebelah kanan kursor.
 */
export function usulanLayak(
  usulan: string,
  konteks: { sebelum: string; sesudah: string },
): string {
  let sisa = usulan.replace(/\r\n/g, '\n');
  if (!sisa.trim()) return '';

  const { sebelum, sesudah } = konteks;

  /* 1. Buang pantulan yang sudah diketik. Pencarian dimulai dari sufiks
        terpanjang: satu kata saran bisa cocok dengan beberapa sufiks, dan yang
        benar adalah yang paling panjang. */
  if (sebelum) {
    for (let n = Math.min(sebelum.length, sisa.length); n > 0; n -= 1) {
      const potongan = sebelum.slice(sebelum.length - n);
      if (sisa.startsWith(potongan)) {
        sisa = sisa.slice(n);
        break;
      }
    }
  }

  /* 2. Saran yang sudah ada di sebelah kanan kursor tidak menambah apa pun. */
  if (sesudah && sesudah.startsWith(sisa)) return '';
  if (!sisa) return '';

  /* 3. Saran yang setelah dipotong cuma menyisakan baris kosong tidak layak
        ditempel - hasilnya baris baru tanpa isi di posisi kursor. */
  if (!sisa.replace(/\n/g, '').trim()) return '';

  return sisa;
}

/** Potongan teks terakhir sepanjang `maks` karakter - konteks untuk penyedia saran. */
export function potongBelakang(teks: string, maks: number): string {
  if (!Number.isFinite(maks) || maks <= 0) return '';
  return teks.length <= maks ? teks : teks.slice(teks.length - maks);
}
