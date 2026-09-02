// gitStore.ts — state Source Control (fase 10).
//
// Dipisah dari store utama seperti explorerStore/terminalStore: panel SCM
// sering refresh (setiap simpan file / operasi git) dan tidak boleh memicu
// render editor atau terminal.
//
// Yang dipegang di sini: status repo (branch/ahead/behind/changes), daftar
// branch, log, diff yang sedang dibuka, status login GitHub, dan dialog
// konfirmasi khusus SCM (discard / delete branch / push upstream).
//
// Token GitHub TIDAK ADA di store ini — hanya metadata dari `gh_status`.

import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import type {
  GhStatus,
  GitProgress,
  GhTestResult,
  GitBranches,
  GitChange,
  GitCommitInfo,
  GitStatusResult,
} from './types';

/** Dialog konfirmasi khusus SCM (bahaya / butuh keputusan). */
export type ScmConfirm =
  | { kind: 'discard'; paths: string[] }
  | { kind: 'discard-all'; paths: string[] }
  | { kind: 'delete-branch'; name: string }
  | { kind: 'set-upstream'; branch: string }
  /** fase 15.3: remote punya commit yang belum kita punya → tawarkan pull dulu. */
  | { kind: 'pull-first'; behind: number };

export interface DiffView {
  path: string;
  staged: boolean;
  text: string;
}

interface GitState {
  status: GitStatusResult | null;
  branches: GitBranches | null;
  log: GitCommitInfo[];
  /** diff yang sedang dibuka di panel */
  diff: DiffView | null;
  /** pesan commit (draft) */
  message: string;
  /** operasi jaringan/berat sedang jalan → spinner + tombol disabled */
  busy: boolean;
  /** nama operasi terakhir yang sedang berjalan, untuk tooltip */
  busyLabel: string;
  /** fase 14.4: fase terakhir dari event `git-progress` (start/done/error).
   *  Datang dari Rust, jadi UI tahu operasi jaringan benar-benar sudah mulai
   *  — bukan menebak dari `busy` yang diset frontend sendiri. */
  progress: GitProgress | null;
  scmError: string | null;
  scmInfo: string | null;
  confirm: ScmConfirm | null;
  /** dropdown branch switcher terbuka */
  branchMenuOpen: boolean;
  /** dialog "New Branch" */
  newBranchOpen: boolean;

  // ── GitHub ──
  gh: GhStatus | null;
  ghTest: GhTestResult | null;
  /** device flow sedang berjalan: kode yang harus dimasukkan user */
  ghDevice: { userCode: string; verificationUri: string } | null;
  ghMessage: string | null;
  /** form "Use a token" terbuka */
  patFormOpen: boolean;
}

interface GitActions {
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setMessage: (m: string) => void;
  /** fase 14.4: dipanggil listener `git-progress` di App.tsx. */
  setProgress: (p: GitProgress | null) => void;
  setError: (m: string | null) => void;
  setInfo: (m: string | null) => void;
  setConfirm: (c: ScmConfirm | null) => void;
  setBranchMenuOpen: (v: boolean) => void;
  setNewBranchOpen: (v: boolean) => void;
  setPatFormOpen: (v: boolean) => void;

  init: () => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  commit: () => Promise<boolean>;
  openDiff: (change: GitChange) => Promise<void>;
  closeDiff: () => void;

  push: (setUpstream?: boolean) => Promise<void>;
  pull: (rebase?: boolean) => Promise<void>;
  fetch: () => Promise<void>;
  sync: () => Promise<void>;

  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;

  /** Jalankan aksi yang sudah dikonfirmasi user. */
  resolveConfirm: () => Promise<void>;

  // ── GitHub ──
  loadGh: () => Promise<void>;
  savePat: (token: string) => Promise<boolean>;
  loginDevice: () => Promise<void>;
  logoutGh: () => Promise<void>;
  testGh: () => Promise<void>;
  setClientId: (id: string) => Promise<void>;
  onGhLogin: (e: { state: string; message?: string }) => void;

  // selector bantu
  staged: () => GitChange[];
  unstaged: () => GitChange[];
}

export type GitStore = GitState & GitActions;

export const useGit = create<GitStore>((set, get) => ({
  status: null,
  branches: null,
  log: [],
  diff: null,
  message: '',
  busy: false,
  busyLabel: '',
  progress: null,
  scmError: null,
  scmInfo: null,
  confirm: null,
  branchMenuOpen: false,
  newBranchOpen: false,

  gh: null,
  ghTest: null,
  ghDevice: null,
  ghMessage: null,
  patFormOpen: false,

  setMessage: (m) => set({ message: m }),
  setProgress: (p) => set({ progress: p }),
  setError: (m) => set({ scmError: m }),
  setInfo: (m) => set({ scmInfo: m }),
  setConfirm: (c) => set({ confirm: c }),
  setBranchMenuOpen: (v) => set({ branchMenuOpen: v }),
  setNewBranchOpen: (v) => set({ newBranchOpen: v }),
  setPatFormOpen: (v) => set({ patFormOpen: v, ghMessage: null }),

  /** Status saja — dipanggil sering (setelah simpan file, fs-changed).
   *  TIDAK menghapus `scmError`: pull yang gagal memanggil refresh setelahnya,
   *  dan kalau refresh mengosongkan error, pesan konflik lenyap sebelum user
   *  melihatnya. Error dibersihkan di awal setiap operasi, bukan di sini. */
  refresh: async () => {
    try {
      const status = await cmd.gitStatus();
      set({ status });
      // Diff yang terbuka bisa jadi basi setelah stage/commit.
      const d = get().diff;
      if (d && status.isRepo) {
        const still = status.changes.some((c) => c.path === d.path);
        if (!still) set({ diff: null });
      }
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

  /** Status + branch + log (setelah operasi yang mengubah riwayat). */
  refreshAll: async () => {
    await get().refresh();
    if (!get().status?.isRepo) {
      set({ branches: null, log: [] });
      return;
    }
    try {
      const [branches, log] = await Promise.all([cmd.gitBranches(), cmd.gitLog(20)]);
      set({ branches, log });
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

  init: async () => {
    await get().refreshAll();
    await get().loadGh();
  },

  stage: async (paths) => {
    if (paths.length === 0) return;
    try {
      await cmd.gitStage(paths);
      await get().refresh();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

  unstage: async (paths) => {
    if (paths.length === 0) return;
    try {
      await cmd.gitUnstage(paths);
      await get().refresh();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

  commit: async () => {
    const msg = get().message.trim();
    if (!msg) {
      set({ scmError: 'Tulis pesan commit dulu' });
      return false;
    }
    if (get().staged().length === 0) {
      set({ scmError: 'Belum ada perubahan yang di-stage (klik + di file)' });
      return false;
    }
    set({ busy: true, busyLabel: 'commit', scmError: null });
    try {
      const hash = await cmd.gitCommit(msg);
      set({ message: '', scmInfo: `Commit ${hash} dibuat` });
      await get().refreshAll();
      return true;
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
      return false;
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  openDiff: async (change) => {
    try {
      const text = await cmd.gitDiff(change.path, change.staged);
      set({
        diff: { path: change.path, staged: change.staged, text },
        scmError: null,
      });
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

  closeDiff: () => set({ diff: null }),

  push: async (setUpstream) => {
    // fase 15.3: remote sudah punya commit yang belum kita punya → push pasti
    // ditolak git (non-fast-forward). Tanya dulu alih-alih membiarkan user
    // menebak dari pesan git. `pullBeforePush` = setting yang menentukan
    // apakah kita menawarkan pull otomatis atau langsung menolak.
    const st = get().status;
    if (!setUpstream && st?.isRepo && st.behind > 0) {
      if (useStore.getState().settings.git.pullBeforePush) {
        set({ confirm: { kind: 'pull-first', behind: st.behind } });
        return;
      }
      set({
        scmError: `Remote punya ${st.behind} commit yang belum ada di lokal — pull dulu sebelum push`,
      });
      return;
    }
    set({ busy: true, busyLabel: 'push', scmError: null, scmInfo: null });
    try {
      const out = await cmd.gitPush(setUpstream ?? false);
      set({ scmInfo: ringkas(out) || 'Push selesai' });
      await get().refreshAll();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  pull: async (rebase) => {
    set({ busy: true, busyLabel: 'pull', scmError: null, scmInfo: null });
    try {
      const out = await cmd.gitPull(rebase ?? false);
      set({ scmInfo: ringkas(out) || 'Pull selesai' });
      await get().refreshAll();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
      // Konflik: statusnya tetap harus tampil supaya file bisa dibuka.
      await get().refreshAll();
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  fetch: async () => {
    set({ busy: true, busyLabel: 'fetch', scmError: null });
    try {
      await cmd.gitFetch();
      await get().refreshAll();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  /** Sync = pull lalu push. Tanpa upstream → tanya dulu (dialog). */
  sync: async () => {
    const st = get().status;
    if (!st?.isRepo) return;
    if (!st.upstream) {
      const branch = st.branch ?? 'HEAD';
      set({ confirm: { kind: 'set-upstream', branch } });
      return;
    }
    const pullFirst = useStore.getState().settings.git.pullBeforePush;
    if (pullFirst && st.behind > 0) {
      await get().pull(false);
      if (get().scmError) return; // konflik → jangan lanjut push
    }
    await get().push(false);
  },

  checkout: async (branch) => {
    set({ busy: true, busyLabel: 'checkout', scmError: null, branchMenuOpen: false });
    try {
      await cmd.gitCheckout(branch);
      set({ scmInfo: `Pindah ke ${branch}` });
      await get().refreshAll();
      // Tab yang terbuka bisa berubah isinya setelah ganti branch.
      await reloadOpenTabs();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  createBranch: async (name) => {
    set({ busy: true, busyLabel: 'branch', scmError: null, newBranchOpen: false });
    try {
      await cmd.gitCreateBranch(name);
      set({ scmInfo: `Branch ${name} dibuat & aktif` });
      await get().refreshAll();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  deleteBranch: async (name) => {
    set({ busy: true, busyLabel: 'branch', scmError: null });
    try {
      await cmd.gitDeleteBranch(name);
      set({ scmInfo: `Branch ${name} dihapus` });
      await get().refreshAll();
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  resolveConfirm: async () => {
    const c = get().confirm;
    if (!c) return;
    set({ confirm: null });
    switch (c.kind) {
      case 'discard':
      case 'discard-all':
        set({ busy: true, busyLabel: 'discard', scmError: null });
        try {
          await cmd.gitDiscard(c.paths);
          set({
            scmInfo:
              c.paths.length === 1
                ? `Perubahan ${c.paths[0]} dibuang`
                : `${c.paths.length} file dikembalikan`,
            diff: null,
          });
          await get().refresh();
          await reloadOpenTabs();
        } catch (e) {
          set({ scmError: cmd.asZephyrError(e).message });
        } finally {
          set({ busy: false, busyLabel: '' });
        }
        break;
      case 'delete-branch':
        await get().deleteBranch(c.name);
        break;
      case 'set-upstream':
        await get().push(true);
        break;
      // fase 15.3: "pull dulu" → pull, lalu lanjut push kalau tidak konflik.
      case 'pull-first':
        await get().pull(false);
        if (get().scmError) return;
        await get().push(false);
        break;
    }
  },

  // ───────────────────────── GitHub ─────────────────────────

  loadGh: async () => {
    try {
      set({ gh: await cmd.ghStatus() });
    } catch {
      /* non-fatal: baris GitHub menampilkan "Belum login" */
    }
  },

  savePat: async (token) => {
    set({ busy: true, busyLabel: 'github', ghMessage: null });
    try {
      const u = await cmd.ghSetPat(token);
      set({
        ghMessage: `Tersimpan — @${u.user}`,
        patFormOpen: false,
      });
      await get().loadGh();
      return true;
    } catch (e) {
      set({ ghMessage: cmd.asZephyrError(e).message });
      return false;
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  loginDevice: async () => {
    set({ ghMessage: null, ghDevice: null });
    try {
      const d = await cmd.ghLoginDevice();
      set({
        ghDevice: { userCode: d.userCode, verificationUri: d.verificationUri },
        ghMessage: 'Masukkan kode di browser lalu tunggu…',
      });
    } catch (e) {
      set({ ghMessage: cmd.asZephyrError(e).message });
    }
  },

  logoutGh: async () => {
    try {
      await cmd.ghLogout();
      set({ ghDevice: null, ghTest: null, ghMessage: 'Sudah logout' });
      await get().loadGh();
    } catch (e) {
      set({ ghMessage: cmd.asZephyrError(e).message });
    }
  },

  testGh: async () => {
    set({ busy: true, busyLabel: 'github' });
    try {
      const r = await cmd.ghTest();
      set({ ghTest: r, ghMessage: r.message });
    } catch (e) {
      set({ ghMessage: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  setClientId: async (id) => {
    await useStore.getState().applySettings({ git: { github: { clientId: id.trim() } } });
    await get().loadGh();
  },

  onGhLogin: (e) => {
    if (e.state === 'success') {
      set({ ghDevice: null, ghMessage: `Login berhasil — @${e.message ?? ''}` });
      void get().loadGh();
      return;
    }
    if (e.state === 'error') {
      set({ ghDevice: null, ghMessage: e.message ?? 'Login gagal' });
      return;
    }
    set({ ghMessage: e.message ?? 'Menunggu…' });
  },

  staged: () => (get().status?.changes ?? []).filter((c) => c.staged),
  unstaged: () => (get().status?.changes ?? []).filter((c) => !c.staged),
}));

/** Ambil baris paling berguna dari output git push/pull. */
function ringkas(out: string): string {
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const penting = lines.find(
    (l) => /->/.test(l) || /^Everything up-to-date/i.test(l) || /files? changed/.test(l),
  );
  return penting ?? lines[lines.length - 1] ?? '';
}

/** Muat ulang isi tab yang terbuka dari disk (setelah checkout/discard). */
async function reloadOpenTabs() {
  const s = useStore.getState();
  for (const t of s.tabs) {
    if (t.path && !t.unsaved) await s.reloadTabFromDisk(t.path);
  }
}
