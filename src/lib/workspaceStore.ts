import { create } from 'zustand';

import * as cmd from './commands';
import { notifyError, notifyInfo } from './notificationStore';
import { useStore } from './store';
import type { WorkspaceInfo, WsRoot } from './types';

import { useExplorer } from './explorerStore';
interface WsState {
  roots: WorkspaceInfo['roots'];
  activeRoot: string;
  
  file: string;
  trusted: boolean;
  perluTanya: boolean;
  alasan: string;
  
  tanyaUntuk: string | null;
  
  daftarTrust: { path: string; trust: string }[];
  loading: boolean;
  error: string | null;
}

interface WsActions {
  muat: () => Promise<void>;
  tambahRoot: (path: string) => Promise<boolean>;
  hapusRoot: (path: string) => Promise<boolean>;
  jadikanAktif: (path: string) => Promise<boolean>;
  bukaFile: (path: string) => Promise<boolean>;
  simpanFile: (path: string) => Promise<boolean>;
  setTrust: (path: string, trust: boolean) => Promise<void>;
  lupakanTrust: (path: string) => Promise<void>;
  muatDaftarTrust: () => Promise<void>;
  tanya: (path: string | null) => void;
  
  settingsEfektif: (root?: string) => Promise<Record<string, unknown>>;
  asalNilai: (key: string, root?: string) => Promise<string>;
  setSettingsWorkspace: (patch: Record<string, unknown>) => Promise<boolean>;
}

const kosong = {
  roots: [],
  activeRoot: '',
  file: '',
  trusted: false,
  perluTanya: false,
  alasan: '',
};

export const useWs = create<WsState & WsActions>((set, get) => ({
  ...kosong,
  tanyaUntuk: null,
  daftarTrust: [],
  loading: false,
  error: null,

  muat: async () => {
    set({ loading: true, error: null });
    try {
      const info = await cmd.workspaceInfo();
      set({
        roots: info.roots,
        activeRoot: info.activeRoot,
        file: info.file,
        trusted: info.trusted,
        perluTanya: info.perluTanya,
        alasan: info.alasan,
        loading: false,
      });
      
      if (info.perluTanya && !get().tanyaUntuk) {
        const belum = info.roots.find((r: WsRoot) => r.trust === 'unknown');
        if (belum) set({ tanyaUntuk: belum.path });
      }
    } catch (e) {
      set({ loading: false, error: cmd.asZephyrError(e).message });
    }
  },

  tambahRoot: async (path) => {
    try {
      const info = await cmd.workspaceAddRoot(path);
      terapkan(set, info);
      

      await useExplorer.getState().loadDir(path, true);
      notifyInfo(`Root ditambahkan: ${namaAkhir(path)}`, { source: 'Workspace' });
      return true;
    } catch (e) {
      notifyError(`Gagal menambah root: ${cmd.asZephyrError(e).message}`, { source: 'Workspace' });
      return false;
    }
  },

  hapusRoot: async (path) => {
    try {
      const info = await cmd.workspaceRemoveRoot(path);
      terapkan(set, info);
      
      useStore.getState().closeTabsUnder([path]);
      
      if (info.activeRoot && info.activeRoot !== useStore.getState().workspace) {
        await useStore.getState().syncWorkspaceLokal(info.activeRoot);
      }
      return true;
    } catch (e) {
      notifyError(`Gagal menghapus root: ${cmd.asZephyrError(e).message}`, { source: 'Workspace' });
      return false;
    }
  },

  jadikanAktif: async (path) => {
    try {
      const info = await cmd.workspaceSetActiveRoot(path);
      terapkan(set, info);
      
      await useStore.getState().syncWorkspaceLokal(path);
      return true;
    } catch (e) {
      notifyError(`Gagal mengganti root aktif: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
      return false;
    }
  },

  bukaFile: async (path) => {
    try {
      const info = await cmd.workspaceOpenFile(path);
      terapkan(set, info);
      
      if (info.activeRoot) await useStore.getState().syncWorkspaceLokal(info.activeRoot);
      

      for (const r of info.roots.slice(1)) await useExplorer.getState().loadDir(r.path, true);
      
      await useStore.getState().reloadSettings();
      notifyInfo(`Workspace dibuka: ${namaAkhir(path)} (${info.roots.length} folder)`, {
        source: 'Workspace',
      });
      return true;
    } catch (e) {
      notifyError(`Gagal membuka workspace: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
      return false;
    }
  },

  simpanFile: async (path) => {
    try {
      const disimpan = await cmd.workspaceSaveFile(path);
      set({ file: disimpan });
      notifyInfo(`Workspace disimpan: ${namaAkhir(disimpan)}`, { source: 'Workspace' });
      return true;
    } catch (e) {
      notifyError(`Gagal menyimpan workspace: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
      return false;
    }
  },

  setTrust: async (path, trust) => {
    try {
      const info = await cmd.workspaceSetTrust(path, trust);
      terapkan(set, info);
      set({ tanyaUntuk: null });
      if (trust) {
        notifyInfo(`${namaAkhir(path)} dipercaya — tasks, debug, LSP, ekstensi aktif`, {
          source: 'Workspace',
        });
        
        void muatUlangFiturEksekusi();
      } else {
        notifyInfo(`${namaAkhir(path)} dibuka dalam Restricted Mode`, { source: 'Workspace' });
      }
    } catch (e) {
      notifyError(`Gagal menyimpan trust: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
    }
  },

  lupakanTrust: async (path) => {
    try {
      const info = await cmd.workspaceForgetTrust(path);
      terapkan(set, info);
      await get().muatDaftarTrust();
    } catch (e) {
      notifyError(`Gagal melupakan trust: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
    }
  },

  muatDaftarTrust: async () => {
    try {
      set({ daftarTrust: await cmd.workspaceTrustList() });
    } catch {
      set({ daftarTrust: [] });
    }
  },

  tanya: (path) => set({ tanyaUntuk: path }),

  settingsEfektif: async (root) => {
    try {
      return await cmd.workspaceSettingsEfektif(root);
    } catch {
      return {};
    }
  },

  asalNilai: async (key, root) => {
    try {
      return await cmd.workspaceSettingsAsal(key, root);
    } catch {
      return 'default';
    }
  },

  setSettingsWorkspace: async (patch) => {
    try {
      await cmd.workspaceSetSettings(patch);
      await useStore.getState().reloadSettings();
      return true;
    } catch (e) {
      notifyError(`Gagal menulis settings workspace: ${cmd.asZephyrError(e).message}`, {
        source: 'Workspace',
      });
      return false;
    }
  },
}));

function terapkan(set: (p: Partial<WsState>) => void, info: WorkspaceInfo) {
  set({
    roots: info.roots,
    activeRoot: info.activeRoot,
    file: info.file,
    trusted: info.trusted,
    perluTanya: info.perluTanya,
    alasan: info.alasan,
    error: null,
  });
}

const namaAkhir = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

async function muatUlangFiturEksekusi(): Promise<void> {
  try {
    const [{ useTasks }, { useExt19 }] = await Promise.all([
      import('./tasksStore'),
      import('./extensionsStore19'),
    ]);
    await useTasks.getState().muat();
    await useExt19.getState().refresh();
  } catch {
    // Gagal memuat ulang bukan alasan membatalkan trust yang sudah disimpan.
  }
}

let wsListenerBound = false;

export async function bindWorkspaceListeners(): Promise<void> {
  if (wsListenerBound) return;
  wsListenerBound = true;

  const { listen } = await import('@tauri-apps/api/event');
  
  for (const ev of ['workspace-roots', 'workspace-active-root', 'workspace-trust'] as const) {
    await listen(ev, () => void useWs.getState().muat());
  }
  await listen('workspace-opened', () => void useWs.getState().muat());

  await useWs.getState().muat();
}
