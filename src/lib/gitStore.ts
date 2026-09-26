import { create } from 'zustand';
import * as cmd from './commands';
import type { GitBlameLine, GitStashEntry } from './commands';
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
  
  source?: 'git' | 'history';
}

interface GitState {
  status: GitStatusResult | null;
  branches: GitBranches | null;
  log: GitCommitInfo[];
  
  diff: DiffView | null;
  
  message: string;
  
  busy: boolean;
  
  busyLabel: string;
  
  progress: GitProgress | null;
  scmError: string | null;
  scmInfo: string | null;
  confirm: ScmConfirm | null;
  
  branchMenuOpen: boolean;
  
  newBranchOpen: boolean;
  rebaseOpen: boolean;
  rebaseAktif: boolean;

  gh: GhStatus | null;
  ghTest: GhTestResult | null;
  
  ghDevice: { userCode: string; verificationUri: string } | null;
  ghMessage: string | null;
  
  patFormOpen: boolean;
}

interface GitActions {
  refresh: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setMessage: (m: string) => void;
  
  setProgress: (p: GitProgress | null) => void;
  setError: (m: string | null) => void;
  setInfo: (m: string | null) => void;
  setConfirm: (c: ScmConfirm | null) => void;
  setBranchMenuOpen: (v: boolean) => void;
  setNewBranchOpen: (v: boolean) => void;
  setRebaseOpen: (v: boolean) => void;
  setRebaseAktif: (v: boolean) => void;
  setPatFormOpen: (v: boolean) => void;

  init: () => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  commit: () => Promise<boolean>;
  commitWithAi: () => Promise<boolean>;
  stashSave: (message?: string) => Promise<boolean>;
  stashList: () => Promise<GitStashEntry[]>;
  stashPop: (index: number) => Promise<void>;
  stashDrop: (index: number) => Promise<void>;
  blameFile: (path: string) => Promise<GitBlameLine[]>;
  openDiff: (change: GitChange) => Promise<void>;
  closeDiff: () => void;

  push: (setUpstream?: boolean) => Promise<void>;
  pull: (rebase?: boolean) => Promise<void>;
  fetch: () => Promise<void>;
  sync: () => Promise<void>;

  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;

  resolveConfirm: () => Promise<void>;

  loadGh: () => Promise<void>;
  savePat: (token: string) => Promise<boolean>;
  loginDevice: () => Promise<void>;
  logoutGh: () => Promise<void>;
  testGh: () => Promise<void>;
  setClientId: (id: string) => Promise<void>;
  onGhLogin: (e: { state: string; message?: string }) => void;

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
  rebaseOpen: false,
  rebaseAktif: false,

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
  setRebaseOpen: (v) => set({ rebaseOpen: v }),
  setRebaseAktif: (v) => set({ rebaseAktif: v }),
  setPatFormOpen: (v) => set({ patFormOpen: v, ghMessage: null }),

  refresh: async () => {
    try {
      const status = await cmd.gitStatus();
      set({ status });
      
      const d = get().diff;
      if (d && d.source !== 'history' && status.isRepo) {
        const still = status.changes.some((c) => c.path === d.path);
        if (!still) set({ diff: null });
      }
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    }
  },

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

  commitWithAi: async () => {
    set({ busy: true, busyLabel: 'ai-commit', scmError: null, scmInfo: null });
    try {
      const diffs: string[] = [];
      for (const c of [...get().staged(), ...get().unstaged()].slice(0, 8)) {
        try {
          const d = await cmd.gitDiff(c.path, c.staged);
          diffs.push(`# ${c.status} ${c.path}\n${d}`);
        } catch {
          diffs.push(`# ${c.status} ${c.path} (diff tidak tersedia)`);
        }
      }
      if (diffs.length === 0) {
        set({ scmError: 'Tidak ada perubahan untuk diringkas' });
        return false;
      }
      const prompt =
        'Write ONE git commit message in English, conventional commits style ' +
        '(e.g. "fix: ...", "feat: ..."), max 72 characters, no quotes, no extra ' +
        'explanation. Reply with ONLY the message. Diff:\n\n' +
        diffs.join('\n\n').slice(0, 12000);
      const ai = await import('./aiStore');
      const hasil = await ai.oneShot(prompt);
      const bersih = hasil
        .trim()
        .split('\n')[0]
        .replace(/^["'`]|["'`]$/g, '')
        .slice(0, 100);
      if (!bersih) {
        set({ scmError: 'AI tidak mengembalikan pesan commit' });
        return false;
      }
      set({ message: bersih, scmInfo: 'Pesan commit diisi AI, periksa lalu commit' });
      return true;
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
      return false;
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  stashSave: async (message) => {
    set({ busy: true, busyLabel: 'stash', scmError: null });
    try {
      const ok = await cmd.gitStashSave(message);
      await get().refreshAll();
      set({ scmInfo: ok ? 'Perubahan disimpan ke stash' : 'Tidak ada perubahan untuk di-stash' });
      return ok;
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
      return false;
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  stashList: async () => {
    try {
      return await cmd.gitStashList();
    } catch {
      return [];
    }
  },

  stashPop: async (index) => {
    set({ busy: true, busyLabel: 'stash', scmError: null });
    try {
      await cmd.gitStashPop(index);
      await get().refreshAll();
      set({ scmInfo: 'Stash dipulihkan' });
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  stashDrop: async (index) => {
    set({ busy: true, busyLabel: 'stash', scmError: null });
    try {
      await cmd.gitStashDrop(index);
      set({ scmInfo: 'Stash dihapus' });
    } catch (e) {
      set({ scmError: cmd.asZephyrError(e).message });
    } finally {
      set({ busy: false, busyLabel: '' });
    }
  },

  blameFile: async (path) => {
    try {
      return await cmd.gitBlame(path);
    } catch {
      return [];
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
      
      case 'pull-first':
        await get().pull(false);
        if (get().scmError) return;
        await get().push(false);
        break;
    }
  },

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

async function reloadOpenTabs() {
  const s = useStore.getState();
  for (const t of s.tabs) {
    if (t.path && !t.unsaved) await s.reloadTabFromDisk(t.path);
  }
}
