import * as cmd from './commands';
import { useTerminal } from './terminalStore';

/**
 * Tangkapan layar untuk tool AI.
 *
 * LAPISAN INI TIDAK MENGHASILKAN GAMBAR, dan itu keputusan, bukan kekurangan.
 *
 * Menangkap jendela jadi PNG berarti beberapa megabyte base64 per panggilan,
 * dan sebagian besar provider tidak menerima gambar sebagai hasil tool - jadi
 * yang dikirim justru sering ditolak. Yang benar-benar dibutuhkan model saat
 * memeriksa pekerjaannya sendiri hampir selalu ISINYA: teks yang terlihat di
 * pane, pesan error, keluaran perintah. Itu beberapa kilobita dan selalu bisa
 * dibaca.
 *
 * Bentuknya juga sengaja sama dengan `screenshot_pane` di server MCP, supaya
 * kedua jalur menghasilkan hal yang sama dan tidak ada kejutan saat berpindah
 * dari agen luar ke agen dalam.
 */

export interface TangkapanPane {
  paneId: string;
  jenis: string;
  judul: string;
  /** Teks pane, dipotong dari ATAS: baris terakhir yang paling relevan. */
  teks: string;
  /** true bila ada bagian di atas yang tidak ikut dikirim. */
  terpotong: boolean;
  /** CLI yang sedang berjalan di pane ini, kalau ada (mis. "claude"). */
  jalan?: string;
  /** Keadaan pane: 'running', 'exited', dan seterusnya. */
  status: string;
}

/** Batas baris bawaan. Cukup untuk konteks, tidak membanjiri konteks model. */
export const BARIS_BAWAAN = 120;

/**
 * Isi teks sebuah pane, memakai jalur yang sama dengan tool `terminal_read`.
 *
 * Pane diambil dari store, jadi id-nya selalu salah satu yang benar-benar ada -
 * dan kalau id yang diminta tidak ada, pemanggilnya diberi tahu daftar yang ada
 * alih-alih diam-diam membaca pane lain. Membaca pane yang salah jauh lebih
 * berbahaya daripada gagal: keluarannya masuk akal, dan model akan bertindak
 * atas dasar itu.
 */
export async function tangkapPane(pane: string, baris = BARIS_BAWAAN): Promise<TangkapanPane> {
  const panes = useTerminal.getState().allPanes();
  if (panes.length === 0) {
    throw new Error('screenshot_ui: no pane is open. Open a terminal pane first.');
  }

  const diminta = String(pane ?? '').trim();
  let target = panes.find((p) => p.kind !== 'browser') ?? panes[0];

  if (diminta) {
    const idx = Number(diminta);
    const cocok = Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === diminta);
    if (!cocok) {
      const daftar = panes.map((p, i) => `${i}=${p.id} (${p.kind})`).join(', ');
      throw new Error(`screenshot_ui: pane "${diminta}" not found. Open panes: ${daftar}`);
    }
    target = cocok;
  }
  if (!target) throw new Error('screenshot_ui: no readable pane');

  const maks = Math.max(1, Math.min(2000, baris));
  let penuh = '';
  try {
    penuh = await cmd.ptyTail(target.id, maks);
  } catch {
    /* Pane yang PTY-nya sudah mati tetap perlu bisa dilihat: isi yang tersisa
       di layar sering justru yang menjelaskan kenapa ia mati. */
  }

  if (!penuh.trim()) {
    const el = document.querySelector('.xterm-rows');
    penuh = el?.textContent ?? '';
  }

  const semua = penuh.split(/\r?\n/).filter((b) => b.trim().length > 0);
  /* Diambil dari EKORNYA: di terminal, baris terakhir yang sedang dibicarakan.
     Mengirim dari atas berarti model membaca riwayat lama dan melewatkan yang
     barusan terjadi. */
  const ambil = semua.slice(-maks);

  return {
    paneId: target.id,
    jenis: target.kind,
    judul: target.title ?? '',
    teks: ambil.join('\n'),
    /* Jujur soal pemotongan. Tanpa ini, model akan menyimpulkan seluruh isi
       pane dari ekornya saja. */
    terpotong: semua.length > ambil.length,
    /* Dua field berbeda, dan keduanya berguna: `agent` bilang CLI apa yang
       sedang jalan, `status` bilang pane-nya masih hidup atau sudah keluar.
       Mendahulukan `agent` karena itu yang menjawab "pane ini sedang
       mengerjakan apa". */
    jalan: target.agent?.label ?? target.agent?.name,
    status: target.status,
  };
}

/**
 * Ringkasan jendela: pane dan editor yang sedang terbuka.
 *
 * Dipakai saat model perlu tahu tampilannya sekarang tanpa menebak id pane
 * lebih dulu. Ini lebih murah daripada menangkap semua pane, dan lebih berguna
 * daripada menangkap satu pane yang belum tentu yang dimaksud.
 */
export async function tangkapJendela(): Promise<{
  pane: Array<{ index: number; id: string; jenis: string; judul: string; jalan?: string; status: string }>;
  editor: Array<{ path: string; nama: string; kotor: boolean }>;
}> {
  const pane = useTerminal.getState().allPanes().map((p, i) => ({
    index: i,
    id: p.id,
    jenis: p.kind,
    judul: p.title ?? '',
    jalan: p.agent?.label ?? p.agent?.name,
    status: p.status,
  }));

  /* Daftar editor dibaca lewat store tab yang sudah ada di renderer - bukan
     panggilan Rust, karena tab yang terbuka memang keadaan renderer. */
  let editor: Array<{ path: string; nama: string; kotor: boolean }> = [];
  try {
    const { useStore } = await import('./store');
    const tabs = useStore.getState().tabs ?? [];
    editor = tabs
      .filter((t) => t.path)
      .map((t) => ({
        path: String(t.path),
        nama: t.name || (String(t.path).split(/[\\/]/).pop() ?? ''),
        /* `unsaved`, bukan `dirty`: tab yang belum disimpan itulah yang perlu
           diperiksa model sebelum menutup atau menimpa berkas. */
        kotor: t.unsaved === true,
      }));
  } catch {
    /* Tanpa daftar editor pun, daftar pane tetap berguna. */
  }

  return { pane, editor };
}
