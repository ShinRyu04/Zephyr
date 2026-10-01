/*
 * Format durasi dan registry timer.
 *
 * Diadaptasi dari Hermes Agent (`components/chat/activity-timer.ts`), dengan
 * dua gagasan yang keduanya memperbaiki masalah nyata:
 *
 * 1. `formatElapsed` - satu tempat untuk mengubah milidetik jadi teks yang
 *    enak dibaca. Tanpa ini, tiap komponen mengarang formatnya sendiri
 *    (`Math.round` di sana, `toFixed` di sini) dan durasi yang sama tampil
 *    berbeda di dua tempat.
 *
 * 2. Registry di TINGKAT MODUL. Saat sebuah baris tergulir keluar layar lalu
 *    masuk lagi, komponennya dilepas dan dipasang kembali. Kalau waktu dicatat
 *    di dalam komponen, timer-nya MULAI DARI NOL lagi setiap kali - jadi
 *    durasi yang ditampilkan bukan durasi aslinya. Dengan registry di tingkat
 *    modul, catatannya bertahan selama halamannya belum dimuat ulang.
 */

const catatan = new Map<string, number>();

/**
 * Waktu mulai untuk sebuah kunci, dibuat sekali dan diingat.
 *
 * Kunci yang sama selalu mengembalikan waktu mulai yang sama, jadi komponen
 * boleh dilepas dan dipasang kembali sesuka hati.
 */
export function mulaiTimer(kunci: string): number {
  const ada = catatan.get(kunci);
  if (ada !== undefined) return ada;
  const sekarang = Date.now();
  catatan.set(kunci, sekarang);
  return sekarang;
}

/** Waktu mulai yang sudah tercatat, atau undefined bila belum pernah mulai. */
export function waktuMulai(kunci: string): number | undefined {
  return catatan.get(kunci);
}

/** Lupakan satu kunci. Dipakai saat tugasnya selesai dan barisnya dihapus. */
export function lupakanTimer(kunci: string): void {
  catatan.delete(kunci);
}

/** Buang semua catatan. Dipakai saat berganti sesi percakapan. */
export function bersihkanTimer(): void {
  catatan.clear();
}

/**
 * Ubah durasi jadi teks ringkas.
 *
 *   < 1 menit -> "45s"
 *   < 1 jam   -> "1:23"   (menit:detik, detik selalu dua digit)
 *   sisanya   -> "2:05:30"
 *
 * Menit di bawah satu jam sengaja TIDAK ditulis "1m23s": bentuk itu lebih
 * panjang dari kolom yang tersedia di baris daftar, dan "1:23" sudah jelas.
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const total = Math.floor(ms / 1000);

  if (total < 60) return `${total}s`;

  const detik = total % 60;
  const menit = Math.floor(total / 60) % 60;
  const jam = Math.floor(total / 3600);

  const dd = String(detik).padStart(2, '0');
  if (jam === 0) return `${menit}:${dd}`;
  return `${jam}:${String(menit).padStart(2, '0')}:${dd}`;
}

/**
 * Durasi dari satu titik waktu, dalam milidetik.
 *
 * `selesai` boleh kosong untuk tugas yang masih berjalan; hasilnya memakai
 * waktu sekarang, jadi pemanggil cukup menyegarkan komponennya untuk melihat
 * angkanya naik.
 */
export function durasiMs(mulai: number | undefined, selesai?: number): number {
  if (!mulai) return 0;
  return Math.max(0, (selesai ?? Date.now()) - mulai);
}
