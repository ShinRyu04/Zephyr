/*
 * Peta alasan berhentinya agent, terpisah dari store.
 *
 * Kenapa murni dan di modul sendiri: perilaku yang diuji di sini (alasan -> pesan
 * + kategori) hanya bisa dipicu di `aiStore` oleh kode yang menunggu sampai 45
 * menit - batas keras, watchdog, dan guard kemajuan semuanya timer atau
 * penghitung yang tidak praktis dinyalakan di harness. Dengan memindahkan
 * PEMETAANNYA ke fungsi tanpa state, satu skrip Node bisa membuktikan bahwa
 * 'guard' tidak lagi dilaporkan sebagai timeout provider tanpa harus menjalankan
 * loop 45 menitnya. Store tetap satu-satunya yang memanggil fungsi ini.
 */

/** Alasan sebuah langkah agent berakhir. `null` berarti belum ada alasan. */
export type AgentStopReason = 'user' | 'watchdog' | 'guard' | 'provider' | 'hard-limit' | 'no-tool';

/** Kategori kegagalan yang ditampilkan ke pembaca. */
export type AgentFailureCategory = 'provider' | 'tool' | 'timeout' | 'cancelled' | 'protocol' | 'unknown';

/**
 * Terjemahkan alasan berhenti menjadi pesan + kategori untuk `agentFailure`.
 *
 * Mengembalikan `null` bila alasan itu BUKAN keputusan di sini: `null` berarti
 * "jangan sentuh agentFailure yang sudah dibangun blok catch". 'provider' dan
 * 'user' sengaja mengembalikan null - keduanya punya jalur sendiri yang sudah
 * benar (catch membawa pesan asli provider; cancel membentuk kategori cancelled),
 * dan menimpanya dengan teks generik justru menghapus informasi.
 */
export function agentStopMessage(reason: string): { message: string; category: AgentFailureCategory } | null {
  if (reason === 'guard') {
    /*
     * Guard yang menembak adalah BUKTI KEMAJUAN BERHENTI - aksi berulang, atau
     * beberapa langkah baca beruntun tanpa perubahan. Dulu ini dilaporkan
     * sebagai 'Provider berhenti menjawab', yang menuduh transport atas
     * keputusan yang sebenarnya diambil guard.
     */
    return {
      category: 'tool',
      message:
        'Agen berhenti karena tidak ada kemajuan (aksi berulang atau langkah baca beruntun tanpa perubahan). Alasan lengkap ada di langkah terakhir.',
    };
  }
  if (reason === 'hard-limit') {
    return { category: 'timeout', message: 'Satu langkah melebihi batas waktu 45 menit dan dihentikan.' };
  }
  if (reason === 'no-tool') {
    return {
      category: 'tool',
      message:
        'Tugas berat berhenti tanpa satu pun tool dijalankan. Model hanya menulis teks, jadi tidak ada perubahan yang bisa diverifikasi.',
    };
  }
  if (reason === 'watchdog') {
    return { category: 'timeout', message: 'Provider berhenti menjawab sebelum langkah selesai.' };
  }
  return null;
}
