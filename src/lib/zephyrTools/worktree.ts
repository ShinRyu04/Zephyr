/*
 * worktree - git worktree (checkout paralel) dari dalam Zephyr, untuk MODEL.
 *
 * Item kanonik `zeph-git-worktree` (tambahan Ryu 2026-10-14): buat/daftar/hapus
 * git worktree dari dalam Zephyr (UI + tool untuk model) supaya kerja paralel
 * di beberapa cabang tidak saling mengganggu.
 *
 * ## Kenapa tiga tool tipis, bukan satu tool dengan `aksi`
 *
 * Sisi Rust punya TIGA command terpisah (`worktree_list`/`worktree_add`/
 * `worktree_remove`), masing-masing dengan argumen wajib yang berbeda. Kalau
 * digabung jadi satu tool ber-`aksi`, skema argumennya harus memuat gabungan
 * ketiganya dan model akan mengirim `path` untuk `daftar` atau lupa `branch`
 * untuk `buat` - dan penolakannya baru muncul setelah panggilan. Tiga nama,
 * tiga skema, satu per pekerjaan: model bisa melihat dari skema saja argumen
 * mana yang wajib.
 *
 * ## Yang dikerjakan berkas ini, dan yang TIDAK
 *
 *   - Menerjemahkan argumen tool ke pemanggilan `invoke` TANPA field tambahan.
 *     Argumen yang dikirim persis `{root}` / `{root, path, branch, buatCabang}`
 *     / `{root, path, paksa}` - tidak ada `workspace`, `cwd`, atau salinan
 *     `args` yang ikut terkirim.
 *   - Meneruskan pesan penolakan Rust APA ADANYA (dilempar sebagai `Error`
 *     dengan teks yang sama), supaya model membaca "worktree masih punya
 *     perubahan yang belum di-commit ..." - bukan "gagal".
 *   - TIDAK memeriksa jalur, TIDAK menyentuh berkas, TIDAK memanggil jaringan.
 *     Seluruh penjagaan (absolut, tanpa `..`, akar repo nyata, worktree kotor)
 *     ada di sisi Rust (`src-tauri/src/worktree.rs`), karena berkas ini bisa
 *     dilewati model lewat prompt, command Rust tidak.
 *
 * Alasan `root` eksplisit dan bukan langsung dari store: satu sesi Zephyr bisa
 * membicarakan repo yang BERBEDA dari folder yang sedang terbuka (mis. model
 * ditanya soal worktree repo lain). `root` yang disebut model dipakai apa
 * adanya; kalau tidak disebut, folder proyek yang terbuka yang dipakai, dan
 * Rust memverifikasinya sebagai akar repo nyata - jadi salah tebak tetap
 * ditolak dengan pesan yang menyebut akar yang benar.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AgentTool } from '../agentTools';

/** Nama ketiga tool, dipakai juga oleh `scripts/uji-worktree.mjs`. */
export const NAMA_TOOL_WORKTREE: readonly string[] = [
  'worktree_list',
  'worktree_add',
  'worktree_remove',
];

/** Nama command Rust yang dipanggil tiap tool. */
export const PERINTAH_DAFTAR = 'worktree_list';
export const PERINTAH_BUAT = 'worktree_add';
export const PERINTAH_HAPUS = 'worktree_remove';

/** Satu entri `git worktree list --porcelain` (bentuk dari `git.rs`). */
export interface EntriWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  isMain: boolean;
}

/** Balasan seragam tiga command Rust: TIDAK pernah `Err` untuk pemakaian salah. */
export interface HasilWorktree<T> {
  berhasil: boolean;
  pesan: string;
  data: T | null;
}

export interface DataDaftar {
  akar: string;
  jumlah: number;
  worktree: EntriWorktree[] | null;
}

/* ------------------------------------------------------------------ */
/* Argumen                                                             */
/* ------------------------------------------------------------------ */

/** Ambil teks argumen yang wajib; kosong/hilang = Error yang menjelaskan. */
function wajib(a: Record<string, unknown>, nama: string): string {
  const nilai = a[nama];
  const teks = typeof nilai === 'string' ? nilai.trim() : '';
  if (!teks) {
    throw new Error(`argumen "${nama}" wajib diisi (teks).`);
  }
  return teks;
}

/**
 * Akar repo: argumen `root` kalau disebut, kalau tidak folder proyek yang
 * terbuka.
 *
 * `../store` diimpor secara dinamis - pola yang sama dengan `zephyrSelf.ts` -
 * supaya modul tool ini tidak menambah siklus impor dengan store, dan supaya
 * berkas ini tetap bisa diuji tanpa menjalankan app.
 */
async function akarRepo(argumen: unknown): Promise<string> {
  const disebut = typeof argumen === 'string' ? argumen.trim() : '';
  if (disebut) return disebut;

  const { useStore } = await import('../store');
  const folder = useStore.getState().workspace;
  if (!folder || !folder.trim()) {
    throw new Error(
      'tidak ada folder proyek yang terbuka - sebutkan argumen "root" berisi akar repo git-nya.',
    );
  }
  return folder;
}

/* ------------------------------------------------------------------ */
/* Pemanggilan + pemetaan hasil                                        */
/* ------------------------------------------------------------------ */

/**
 * Panggil command Rust dan baca `{berhasil, pesan, data}`.
 *
 * `berhasil: false` DILEMPAR dengan `pesan` apa adanya (tanpa awalan seperti
 * "ERROR:"): model harus membaca kalimat Rust utuh - "worktree masih punya
 * perubahan ..." - supaya ia tahu langkah berikutnya, bukan hanya bahwa
 * panggilan gagal.
 */
async function panggil<T>(
  perintah: string,
  args: Record<string, unknown>,
): Promise<HasilWorktree<T>> {
  const balasan = await invoke<HasilWorktree<T>>(perintah, args);
  if (!balasan || typeof balasan !== 'object' || typeof balasan.pesan !== 'string') {
    throw new Error(
      `balasan ${perintah} tidak dikenali (butuh {berhasil, pesan, data}): ${JSON.stringify(balasan)}`,
    );
  }
  if (!balasan.berhasil) {
    throw new Error(balasan.pesan);
  }
  return balasan;
}

/** Satu baris ringkas untuk daftar: jalur, cabang (atau detached), penanda. */
export function barisWorktree(w: EntriWorktree): string {
  const cabang = w.detached
    ? `detached ${(w.head ?? '').slice(0, 7) || 'tanpa HEAD'}`
    : w.branch && w.branch.trim()
      ? w.branch
      : 'tanpa branch';
  const tanda = [
    w.isMain ? 'UTAMA' : '',
    w.bare ? 'bare' : '',
    w.locked ? 'locked' : '',
    w.prunable ? 'prunable' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return `- ${w.path} [${cabang}]${tanda ? ` {${tanda}}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Tiga tool                                                           */
/* ------------------------------------------------------------------ */

export const TOOL_WORKTREE: AgentTool[] = [
  {
    spec: {
      name: PERINTAH_DAFTAR,
      description:
        'Daftar semua git worktree (checkout paralel) milik sebuah repo, termasuk worktree utama. Pakai ini lebih dulu sebelum menghapus, supaya jalur yang disebut memang worktree terdaftar.',
      parameters: {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description:
              'Akar repo git yang diperiksa. Boleh dikosongkan: folder proyek yang sedang terbuka yang dipakai. Harus akar repo yang sebenarnya (bukan subfolder).',
          },
        },
        required: [],
      },
    },
    run: async (a) => {
      const root = await akarRepo(a.root);
      const hasil = await panggil<DataDaftar>(PERINTAH_DAFTAR, { root });
      const data = hasil.data ?? { akar: root, jumlah: 0, worktree: [] };
      const baris = (data.worktree ?? []).map(barisWorktree);
      return [`${hasil.pesan}`, ...baris].join('\n');
    },
  },
  {
    spec: {
      name: PERINTAH_BUAT,
      description:
        'Buat git worktree baru: checkout kedua dari repo yang sama, di folder yang terpisah, supaya dua cabang bisa dikerjakan tanpa saling mengganggu. Worktree baru harus di LUAR repo (folder bersebelahan), dan foldernya belum boleh ada.',
      parameters: {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description: 'Akar repo git. Boleh dikosongkan: folder proyek yang terbuka yang dipakai.',
          },
          path: {
            type: 'string',
            description:
              'Jalur ABSOLUT folder worktree baru (mis. D:/repo-cabang-b). Tidak boleh relatif, tidak boleh memuat "..", tidak boleh di dalam repo, dan foldernya belum ada.',
          },
          branch: {
            type: 'string',
            description:
              'Nama branch yang di-checkout di worktree baru. Kalau buatCabang=true, branch ini DIBUAT dari HEAD; kalau false, branch ini harus sudah ada.',
          },
          buatCabang: {
            type: 'boolean',
            description:
              'true = buat branch baru bernama `branch` dari HEAD; false (bawaan) = checkout branch yang sudah ada.',
          },
        },
        required: ['path', 'branch'],
      },
    },
    run: async (a) => {
      const root = await akarRepo(a.root);
      const path = wajib(a, 'path');
      const branch = wajib(a, 'branch');
      // Boolean tegas: apa pun yang bukan `true` dikirim `false`, sehingga
      // Rust tidak pernah membuat branch baru karena argumen yang ambigu.
      const buatCabang = a.buatCabang === true;
      const hasil = await panggil<{ path: string; branch: string; buatCabang: boolean }>(
        PERINTAH_BUAT,
        { root, path, branch, buatCabang },
      );
      const data = hasil.data;
      const catatan = data
        ? `\n- ${data.path} [${data.branch}]${data.buatCabang ? ' {branch baru}' : ' {branch yang sudah ada}'}`
        : '';
      return `${hasil.pesan}${catatan}`;
    },
  },
  {
    spec: {
      name: PERINTAH_HAPUS,
      description:
        'Hapus satu git worktree (checkout paralel) beserta folder check-out-nya. Worktree yang masih punya perubahan atau berkas baru yang BELUM di-commit ditolak; kalau memang harus dihapus, kirim paksa=true dan sebutkan dalam jawaban apa yang hilang.',
      parameters: {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description: 'Akar repo git. Boleh dikosongkan: folder proyek yang terbuka yang dipakai.',
          },
          path: {
            type: 'string',
            description:
              'Jalur ABSOLUT worktree yang dihapus; harus worktree yang benar-benar terdaftar di repo ini (lihat worktree_list). Worktree utama tidak bisa dihapus.',
          },
          paksa: {
            type: 'boolean',
            description:
              'true = hapus meskipun masih ada perubahan belum di-commit (perubahan itu HILANG). Bawaan false.',
          },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const root = await akarRepo(a.root);
      const path = wajib(a, 'path');
      const paksa = a.paksa === true;
      const hasil = await panggil<{ path: string; paksa: boolean; masih_ada_di_disk: boolean }>(
        PERINTAH_HAPUS,
        { root, path, paksa },
      );
      const data = hasil.data;
      return data ? `${hasil.pesan} {${data.paksa ? 'paksa' : 'pemeriksaan kotor lolos'}}` : hasil.pesan;
    },
  },
];
