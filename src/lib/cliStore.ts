import { create } from 'zustand';

import * as cmd from './commands';
import { useGit } from './gitStore';
import { notifyError, notifyInfo } from './notificationStore';
import { useStore } from './store';
import type { CliArgs, CliTarget } from './types';

function buatDiff(kiri: string, kanan: string, namaKiri: string, namaKanan: string): string {
  const a = kiri.split('\n');
  const b = kanan.split('\n');
  const out: string[] = [
    `diff --zephyr a/${namaKiri} b/${namaKanan}`,
    `--- a/${namaKiri}`,
    `+++ b/${namaKanan}`,
  ];

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
  
  terakhir: CliArgs | null;
  
  jumlahJalan: number;
  
  menunggu: Record<string, string>;
}

interface CliActions {
  jalankan: (args: CliArgs) => Promise<void>;
  
  lepasWait: (path: string) => Promise<boolean>;
  bersihkan: () => void;
}

export const useCli = create<CliState & CliActions>((set, get) => ({
  terakhir: null,
  jumlahJalan: 0,
  menunggu: {},

  jalankan: async (args) => {
    set((s) => ({ terakhir: args, jumlahJalan: s.jumlahJalan + 1 }));

    for (const e of args.errors || []) {
      notifyError(`Argumen CLI: ${e}`, {
        detail: 'Jalankan `zephyr --help` untuk daftar opsi.',
        source: 'CLI',
      });
    }

    const S = useStore.getState();

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
          
          source: 'history',
        },
      });
      useStore.getState().setSettingsOpen(false);
    } catch (e) {
      notifyError(`Gagal membuka diff: ${cmd.asZephyrError(e).message}`, { source: 'CLI' });
    }
    return;
  }

  const { path, line, col } = t.file;
  try {
    
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

let cliListenerBound = false;

export async function bindCliListeners(): Promise<void> {
  if (cliListenerBound) return;
  cliListenerBound = true;

  const { listen } = await import('@tauri-apps/api/event');
  await listen<CliArgs>('cli-args', (ev) => {
    void useCli.getState().jalankan(ev.payload);
  });

  try {
    const awal = await cmd.cliArgsAwal();
    
    if (!awal.kosong) await useCli.getState().jalankan(awal);
    else useCli.setState({ terakhir: awal });
  } catch {
    // The app must still start even if argument parsing fails.
  }
}
