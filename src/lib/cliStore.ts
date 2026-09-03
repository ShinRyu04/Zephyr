// cliStore.ts — jalankan argumen CLI di dalam app (fase 28).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Argumen datang dari DUA arah dan keduanya wajib ditangani:
//    - instance PERTAMA: `cli_args_awal` dipanggil saat bootstrap (tidak ada
//      pengirim event, jadi harus ditarik);
//    - instance KEDUA: event `cli-args` dari plugin single-instance.
//    Satu fungsi `jalankan()` melayani keduanya supaya perilakunya identik —
//    kalau dipisah, salah satu jalur pasti tertinggal saat fitur berubah.
//
// 2. Target dieksekusi BERURUTAN, bukan Promise.all. `zephyr a.ts b.ts` harus
//    berakhir dengan b.ts sebagai tab aktif; paralel membuat urutan tab acak.
//
// 3. Diff memakai `useGit.diff` dengan `source: 'history'` (bukan penampil
//    baru): DiffViewer fase 10 sudah menampilkan unified diff, dan penanda
//    source itu yang mencegah refresh git berikutnya menutup diff kita —
//    label path kita tidak ada di `status.changes`. Pelajaran fase 26.
//
// 4. Error argumen → notifikasi fase 27, BUKAN exit atau alert. Brief: "error
//    argumen -> notifikasi, bukan exit kaku".

import { create } from 'zustand';

import * as cmd from './commands';
import { useGit } from './gitStore';
import { notifyError, notifyInfo } from './notificationStore';
import { useStore } from './store';
import type { CliArgs, CliTarget } from './types';

/** Susun unified diff dua teks (LCS sederhana, sama pola TimelineView 26). */
function buatDiff(kiri: string, kanan: string, namaKiri: string, namaKanan: string): string {
  const a = kiri.split('\n');
  const b = kanan.split('\n');
  const out: string[] = [
    `diff --zephyr a/${namaKiri} b/${namaKanan}`,
    `--- a/${namaKiri}`,
    `+++ b/${namaKanan}`,
  ];

  // Batas 4000 baris: LCS tabel penuh jadi mahal di atas itu (pelajaran 26).
  if (a.length > 4000 || b.length > 4000) {
    const n = Math.max(a.length, b.length);
    out.push(`@@ -1,${a.length} +1,${b.length} @@`);
    for (let i = 0; i < n; i++) {
      if (a[i] === b[i]) out.push(` ${a[i] ?? ''}`);
      else {
        if (a[i] !== undefined) out.push(`-${a[i]}`);
        if (b[i] !== undefined) out.push(`+${b[i]}`);
      }
    }
    return out.join('\n');
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const baris: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      baris.push(` ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      baris.push(`-${a[i]}`);
      i++;
    } else {
      baris.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < m) baris.push(`-${a[i++]}`);
  while (j < n) baris.push(`+${b[j++]}`);

  out.push(`@@ -1,${m} +1,${n} @@`);
  out.push(...baris);
  return out.join('\n');
}

const namaFile = (p: string) => p.split(/[\\/]/).pop() || p;

interface CliState {
  /** argumen terakhir yang dijalankan (bukti untuk harness & debug) */
  terakhir: CliArgs | null;
  /** jumlah kali argumen CLI dijalankan (instance pertama + tiap instance kedua) */
  jumlahJalan: number;
  /** token --wait yang sedang ditunggu, per path file */
  menunggu: Record<string, string>;
}

interface CliActions {
  jalankan: (args: CliArgs) => Promise<void>;
  /** dipanggil saat tab ditutup: lepaskan proses CLI yang menunggu */
  lepasWait: (path: string) => Promise<boolean>;
  bersihkan: () => void;
}

export const useCli = create<CliState & CliActions>((set, get) => ({
  terakhir: null,
  jumlahJalan: 0,
  menunggu: {},

  jalankan: async (args) => {
    set((s) => ({ terakhir: args, jumlahJalan: s.jumlahJalan + 1 }));

    // Error argumen → notifikasi, lalu TETAP jalankan target yang valid.
    // Menolak seluruh perintah karena satu flag salah ketik lebih menyakitkan
    // daripada membuka file yang memang diminta.
    for (const e of args.errors || []) {
      notifyError(`Argumen CLI: ${e}`, {
        detail: 'Jalankan `zephyr --help` untuk daftar opsi.',
        source: 'CLI',
      });
    }

    const S = useStore.getState();

    // Tanpa target: buka daftar recent (brief INTEGRASI fase 04).
    if (args.kosong) {
      S.setSettingsOpen(false);
      S.setActivity('explorer');
      if (!S.sidebarVisible) S.toggleSidebar();
      return;
    }

    for (const t of args.targets || []) {
      await jalankanSatu(t, args);
    }
  },

  lepasWait: async (path) => {
    const token = get().menunggu[path];
    if (!token) return false;
    const lepas = await cmd.cliWaitSelesai(token).catch(() => false);
    set((s) => {
      const m = { ...s.menunggu };
      delete m[path];
      return { menunggu: m };
    });
    return lepas;
  },

  bersihkan: () => set({ terakhir: null, jumlahJalan: 0, menunggu: {} }),
}));

async function jalankanSatu(t: CliTarget, args: CliArgs): Promise<void> {
  const S = useStore.getState();

  if ('folder' in t) {
    await S.openWorkspace(t.folder);
    return;
  }

  if ('diff' in t) {
    const { kiri, kanan } = t.diff;
    try {
      const [a, b] = await Promise.all([cmd.fsRead(kiri), cmd.fsRead(kanan)]);
      useGit.setState({
        diff: {
          path: `${namaFile(kiri)} ↔ ${namaFile(kanan)}`,
          staged: false,
          text: buatDiff(a.content, b.content, namaFile(kiri), namaFile(kanan)),
          // Penanda 'history' = "diff ini bukan milik status git", supaya
          // refresh git berikutnya tidak menutupnya (pelajaran fase 26).
          source: 'history',
        },
      });
      useStore.getState().setSettingsOpen(false);
    } catch (e) {
      notifyError(`Gagal membuka diff: ${cmd.asZephyrError(e).message}`, { source: 'CLI' });
    }
    return;
  }

  // File biasa.
  const { path, line, col } = t.file;
  try {
    // `openPathAt` sudah menunggu satu frame sebelum memindahkan kursor
    // (fase 04) — memanggil openPath + revealPosition sendiri di sini berarti
    // menduplikasi jeda itu dan salah satu pasti basi saat editor berubah.
    if (line) await S.openPathAt(path, line, col || 1);
    else await S.openPath(path);

    if (args.wait && args.waitToken) {
      useCli.setState((s) => ({ menunggu: { ...s.menunggu, [path]: args.waitToken as string } }));
      notifyInfo(`Menunggu ${namaFile(path)} ditutup`, {
        detail: 'Proses `zephyr --wait` di terminal akan lanjut setelah tab ini ditutup.',
        source: 'CLI',
      });
    }
  } catch (e) {
    notifyError(`Gagal membuka ${namaFile(path)}: ${cmd.asZephyrError(e).message}`, {
      source: 'CLI',
    });
  }
}

/** Guard modul: StrictMode dev memasang effect dua kali (pelajaran fase 09/22). */
let cliListenerBound = false;

export async function bindCliListeners(): Promise<void> {
  if (cliListenerBound) return;
  cliListenerBound = true;

  const { listen } = await import('@tauri-apps/api/event');
  await listen<CliArgs>('cli-args', (ev) => {
    void useCli.getState().jalankan(ev.payload);
  });

  // Instance PERTAMA: tidak ada yang mengirim event, argumennya harus ditarik.
  try {
    const awal = await cmd.cliArgsAwal();
    // `kosong` saat start normal (dobel-klik ikon) tidak perlu diapa-apakan:
    // window-state + workspace terakhir sudah ditangani bootstrap store.
    if (!awal.kosong) await useCli.getState().jalankan(awal);
    else useCli.setState({ terakhir: awal });
  } catch {
    // App tetap harus jalan walau pembacaan argumen gagal.
  }
}
