
/**
 * Mode rencana: agen mengusulkan langkah, user menyetujui, BARU dikerjakan.
 *
 * Kenapa ini perlu ada. Tanpa gerbang ini, satu-satunya cara user menghentikan
 * agen yang salah arah adalah membatalkannya di tengah jalan - dan pada saat
 * itu sebagian perubahan sudah ditulis ke disk. Untuk tugas yang menyentuh
 * banyak berkas atau menghapus sesuatu, urutan yang benar adalah: lihat
 * rencananya dulu, setujui, baru eksekusi.
 *
 * Rencananya ditampilkan lewat jalur yang SAMA dengan `ask_user`, jadi tidak
 * ada dua jenis kartu persetujuan yang harus dipelajari user.
 */

export interface Rencana {
  /** Ringkas satu baris: apa yang akan dicapai. */
  ringkasan: string;
  /** Langkah-langkahnya, urut. */
  langkah: string[];
  /** Berkas atau area yang akan disentuh, untuk pertimbangan user. */
  berkas?: string[];
  /** Risiko atau hal yang tidak bisa dibatalkan, kalau ada. */
  risiko?: string;
}

/**
 * Susun rencana jadi teks yang bisa dibaca user.
 *
 * User melihat teks ini di kartu persetujuan. Panjangnya dijaga: rencana
 * sepanjang layar tidak akan dibaca, dan persetujuan yang tidak dibaca lebih
 * berbahaya daripada tidak ada persetujuan sama sekali.
 */
export function rencanaKeTeks(r: Rencana): string {
  const bagian: string[] = [r.ringkasan.trim()];

  const langkah = r.langkah.map((l) => l.trim()).filter(Boolean);
  if (langkah.length) {
    bagian.push('');
    langkah.forEach((l, i) => bagian.push(`${i + 1}. ${l}`));
  }

  const berkas = (r.berkas ?? []).map((b) => b.trim()).filter(Boolean);
  if (berkas.length) {
    bagian.push('');
    bagian.push(`Berkas: ${berkas.join(', ')}`);
  }

  if (r.risiko?.trim()) {
    bagian.push('');
    bagian.push(`Risiko: ${r.risiko.trim()}`);
  }

  return bagian.join('\n');
}

/**
 * Minta persetujuan user atas sebuah rencana.
 *
 * Pilihan jawabannya sengaja TIGA, bukan dua: setujui, tolak, atau minta
 * diubah. Tanpa jalur ketiga, user yang ingin "kerjakan tapi jangan sentuh
 * berkas X" hanya bisa menolak, dan agen tidak tahu apa yang harus diubah.
 */
export const PILIHAN_RENCANA = ['Setujui dan kerjakan', 'Ubah dulu', 'Batalkan'] as const;

export type JawabanRencana = (typeof PILIHAN_RENCANA)[number];

/**
 * Tafsirkan jawaban user atas kartu rencana.
 *
 * Dipisah dari pemanggilnya supaya bisa diuji: pemetaan teks bebas ke keputusan
 * adalah tempat yang paling mudah salah, dan kesalahannya berujung pada
 * pekerjaan yang dikerjakan padahal user tidak menyetujui.
 */
export function tafsirJawaban(jawaban: string | null): {
  setuju: boolean;
  mintaUbah: boolean;
  dibatalkan: boolean;
  catatan: string;
} {
  if (jawaban === null || jawaban === undefined) {
    return { setuju: false, mintaUbah: false, dibatalkan: true, catatan: '' };
  }

  const t = jawaban.trim();
  const k = t.toLowerCase();

  if (k === PILIHAN_RENCANA[0].toLowerCase() || /^(ya|yes|ok|oke|lanjut|setuju|gas)\b/.test(k)) {
    return { setuju: true, mintaUbah: false, dibatalkan: false, catatan: '' };
  }
  if (k === PILIHAN_RENCANA[1].toLowerCase() || /^(ubah|revisi|ganti|tapi|kecuali)\b/.test(k)) {
    /* Teks lengkapnya diteruskan sebagai catatan: user yang menekan "Ubah dulu"
       biasanya LANGSUNG mengetik apa yang harus diubah. */
    return { setuju: false, mintaUbah: true, dibatalkan: false, catatan: t };
  }
  if (k === PILIHAN_RENCANA[2].toLowerCase() || /^(batal|cancel|stop|jangan|tidak|no)\b/.test(k)) {
    return { setuju: false, mintaUbah: false, dibatalkan: true, catatan: t };
  }

  /* Tidak dikenali. Diperlakukan sebagai "minta diubah", BUKAN sebagai setuju:
     menafsirkan teks yang tidak dikenal sebagai izin berarti menjalankan
     pekerjaan yang mungkin tidak disetujui user. */
  return { setuju: false, mintaUbah: true, dibatalkan: false, catatan: t };
}

/** Apakah ada perubahan yang belum tersimpan di salah satu berkas ini? */
export async function adaPerubahanBelumDisimpan(berkas: string[]): Promise<string[]> {
  if (berkas.length === 0) return [];
  try {
    /*
     * Dibaca dari store tab di renderer, BUKAN lewat perintah Tauri: tab yang
     * terbuka dan keadaannya belum-tersimpan memang keadaan renderer, dan
     * Rust tidak menyimpannya. Bertanya ke Rust untuk hal yang hanya ada di
     * sini akan selalu menjawab "bersih" - dan persetujuan yang mengira semua
     * berkas sudah tersimpan justru yang paling berbahaya.
     */
    const { useStore } = await import('./store');
    const tabs = useStore.getState().tabs ?? [];
    const kotor = new Set(tabs.filter((t) => t.unsaved === true).map((t) => String(t.path ?? '')));
    return berkas.filter((b) => kotor.has(b));
  } catch {
    /* Tidak bisa memeriksa bukan alasan menggagalkan persetujuan; user tetap
       melihat rencananya, dan berkas yang sudah tersimpan tidak terpengaruh. */
    return [];
  }
}
