// workspaceStore.ts — multi-root + Workspace Trust (fase 29).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Store ini TIDAK menyalin `workspace` dari store utama. `store.workspace`
//    tetap satu-satunya sumber "root aktif" — dua salinan berarti salah satu
//    pasti basi. Yang disimpan di sini hanya yang belum ada: daftar root,
//    status trust, dan path file .code-workspace.
//
// 2. Trust dibaca dari RUST, bukan disimpan di frontend. Penjaganya ada di
//    command Tauri (workspace.rs `ensure_trusted`), jadi frontend hanya
//    MENAMPILKAN keadaan — kalau frontend menyimpan keputusan sendiri, UI bisa
//    bilang "trusted" sementara Rust menolak, dan user tidak tahu kenapa.
//
// 3. Restricted Mode tidak "mematikan tombol saja". Tombol tetap bisa diklik
//    dan errornya ditampilkan apa adanya dari Rust — itu yang memberi tahu user
//    APA yang diblokir dan bagaimana membukanya. Menyembunyikan tombol membuat
//    fitur terasa hilang, bukan terkunci.

import { create } from 'zustand';

import * as cmd from './commands';
import { notifyError, notifyInfo } from './notificationStore';
import { useStore } from './store';
import type { WorkspaceInfo, WsRoot } from './types';

interface WsState {
  roots: WorkspaceInfo['roots'];
  activeRoot: string;
  /** path .code-workspace ('' = folder biasa) */
  file: string;
  trusted: boolean;
  perluTanya: boolean;
  alasan: string;
  /** dialog trust sedang tampil untuk path ini */
  tanyaUntuk: string | null;
  /** daftar keputusan trust (panel Settings) */
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
  /** settings efektif untuk root tertentu (Default<User<Workspace<Folder) */
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
      // Folder yang belum pernah ditanya → munculkan dialog SEKALI.
      // `tanyaUntuk` dijaga supaya dialog tidak muncul lagi tiap refresh.
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
      // Explorer harus memuat isi root baru; tanpa ini root muncul kosong.
      const { useExplorer } = await import('./explorerStore');
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
      // Tab yang berada di root itu ditutup — membiarkannya terbuka berarti
      // ada tab yang tidak lagi punya root, dan simpan/git-nya jadi ambigu.
      useStore.getState().closeTabsUnder([path]);
      // Root aktif bisa berubah bila yang dihapus adalah root aktif.
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
      // store.workspace WAJIB diselaraskan (dibaca git/search/tasks), tapi
      // LEWAT syncWorkspaceLokal: openWorkspace memanggil workspace_open di
      // Rust yang MENGOSONGKAN daftar root yang baru saja ditukar.
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
      // syncWorkspaceLokal, BUKAN openWorkspace: root sudah dipasang Rust di
      // workspace_open_file, dan workspace_open akan menghapusnya.
      if (info.activeRoot) await useStore.getState().syncWorkspaceLokal(info.activeRoot);
      // Root tambahan juga dimuat ke Explorer.
      const { useExplorer } = await import('./explorerStore');
      for (const r of info.roots.slice(1)) await useExplorer.getState().loadDir(r.path, true);
      // Settings scope workspace berubah → muat ulang settings efektif.
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
        // Fitur yang tadinya diblokir dimuat ulang sekarang: tanpa ini user
        // harus reload app setelah menekan Trust.
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

/**
 * Muat ulang fitur yang diblokir Restricted Mode setelah user menekan Trust.
 *
 * Import dinamis: modul-modul ini mengimpor `workspaceStore` secara tidak
 * langsung, dan import statis membentuk lingkaran (pelajaran fase 13:
 * mcpStore → paletteStore → commandRegistry → mcpStore).
 */
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

/** Guard modul: StrictMode dev memasang listener dua kali (fase 09/22/28). */
let wsListenerBound = false;

export async function bindWorkspaceListeners(): Promise<void> {
  if (wsListenerBound) return;
  wsListenerBound = true;

  const { listen } = await import('@tauri-apps/api/event');
  // Ketiga event memicu muat ulang yang sama: keadaan workspace hanya boleh
  // dibaca dari satu tempat (workspace_info), bukan direka dari payload.
  for (const ev of ['workspace-roots', 'workspace-active-root', 'workspace-trust'] as const) {
    await listen(ev, () => void useWs.getState().muat());
  }
  await listen('workspace-opened', () => void useWs.getState().muat());

  await useWs.getState().muat();
}
