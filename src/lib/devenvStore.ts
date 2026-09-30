import { create } from 'zustand';
import { useStore } from './store';
import {
  devenvDetectRuntimes,
  devenvDetectServices,
  devenvServiceStart,
  devenvServiceStop,
  devenvScanProjects,
  devenvOpenPath,
  fsCreateDir,
  folderDialogOpen,
} from './commands';
import { useSettingsUi } from './settingsStore';
import type {
  DevenvProject,
  DevenvRuntime,
  DevenvServer,
  DevenvService,
  DevenvServiceId,
} from './types';

export type RuntimeId = 'node' | 'php' | 'python' | 'rust' | 'git';
export type StatusService = 'running' | 'stopped' | 'not-installed';

export interface RUNTIME_INFO {
  id: RuntimeId;
  label: string;
  /** Whether a project cannot work without it. */
  inti: boolean;
}

export const RUNTIME_DAFTAR: RUNTIME_INFO[] = [
  { id: 'node', label: 'Node.js', inti: true },
  { id: 'php', label: 'PHP', inti: false },
  { id: 'python', label: 'Python', inti: true },
  { id: 'rust', label: 'Rust', inti: false },
  { id: 'git', label: 'Git', inti: true },
];

export const SERVICE_DAFTAR: { id: DevenvServiceId; label: string; port: number }[] = [
  { id: 'nginx', label: 'Nginx', port: 80 },
  { id: 'apache', label: 'Apache', port: 80 },
  { id: 'mysql', label: 'MySQL', port: 3306 },
  { id: 'postgres', label: 'PostgreSQL', port: 5432 },
  { id: 'redis', label: 'Redis', port: 6379 },
  { id: 'cron', label: 'Cron / Jobs', port: 0 },
];

/**
 * A forced load that arrived while a scan was already running. The scan cannot
 * be interrupted, so the request is replayed once it finishes — dropping it
 * would leave the panel showing stale rows after a start/stop or a config edit.
 */
let permintaanTertunda = false;

export const DEPLOY_DEFAULT = {
  rootFolder: 'D:\\DevEnv',
  domain: '.test',
  server: 'nginx' as DevenvServer,
};

/** One row in the Services table. Runtime-detected fields start empty. */
export interface BarisService {
  id: DevenvServiceId;
  label: string;
  status: StatusService;
  versi: string;
  port: number;
  autoStart: boolean;
  /** Filled once the Rust side reports a live process. */
  pid?: number;
  /** Cron is a job count rather than a process. */
  jumlahJob?: number;
  /** Every version next to the active one; drives the row's version picker. */
  versions?: string[];
  /** Resolved executable, shown in the row tooltip. */
  path?: string;
  /** Windows service name when the tool runs under the service manager. */
  windowsService?: string;
}

export interface BarisRuntime {
  id: RuntimeId;
  label: string;
  inti: boolean;
  terpasang: boolean;
  versi: string;
  daftarVersi: string[];
  path: string;
}

interface DevenvState {
  /**
   * Load the environment. Cached: a repeat call with an unchanged configuration
   * returns immediately instead of spawning the (slow) runtime detection again.
   * `paksa = true` forces a fresh scan — used by the Refresh button and after a
   * service start/stop, where the previous result is stale by definition.
   */
  muat: (paksa?: boolean) => Promise<void>;
  /** Force a fresh scan; the Refresh button in the panel calls this. */
  refresh: () => Promise<void>;
  /** Real detection from the Rust side. Empty until the first scan lands. */
  runtimes: BarisRuntime[];
  /** Real service state: path, version, port, pid and whether we own it. */
  services: BarisService[];
  projects: DevenvProject[];
  memindai: boolean;
  /** True once a scan has landed; the cache guard reads this. */
  sudahMuat: boolean;
  /** Configuration the last scan used, so a config change invalidates the cache. */
  stempel: string;
  pesan: string;
  /** The stored configuration, so the view does not parse the subtitle. */
  cfg: { rootFolder: string; domain: string; server: DevenvServer };
  setRoot: (p: string) => void;
  setDomain: (d: string) => void;
  setServer: (s: DevenvServer) => void;
  setAutoStart: (id: DevenvServiceId, on: boolean) => void;
  startService: (id: string) => Promise<void>;
  stopService: (id: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  /** Start every installed service that is not already running. */
  startAll: () => Promise<void>;
  /** Stop every service Zephyr owns. */
  stopAll: () => Promise<void>;
  /** Create <root>/www/<name> and rescan the projects. */
  buatProyek: (nama: string) => Promise<void>;
  /** Jump to Settings > Dev Environment. */
  bukaSettings: () => void;
  /** Explain that the PATH shim install is not wired yet, instead of a dead button. */
  registerShim: () => void;
  /** Open a row's folder; falls back to a status message when there is no path. */
  bukaBaris: (path: string) => Promise<void>;
  /** Say plainly that a per-row action has no backend yet, instead of doing nothing. */
  belumTersedia: (nama: string) => void;
  /** Pin a runtime to a folder the user picked, so detection prefers it. */
  pilihPathRuntime: (id: RuntimeId) => Promise<void>;
  /** Remember which version a service row should run. */
  setServiceVersi: (id: DevenvServiceId, versi: string) => Promise<void>;
  /** Remember which PHP/Node version a project row should use. */
  setProjectVersi: (nama: string, tool: 'php' | 'node', versi: string) => Promise<void>;
  /** Remember which version of a runtime the user wants to be active. */
  setRuntimeVersi: (id: RuntimeId, versi: string) => Promise<void>;
}

const cfg = () => {
  const s = useStore.getState().settings as unknown as {
    devenv?: {
      rootFolder?: string;
      domain?: string;
      server?: DevenvServer;
      runtimes?: Partial<Record<string, DevenvRuntime>>;
      services?: Partial<Record<DevenvServiceId, DevenvService>>;
    };
  };
  /*
   * Merge per field instead of "is there a devenv object at all". A settings
   * file written by an older build carries `devenv: { services: {...} }` with
   * no rootFolder, and a plain `??` fallback would keep that object and hand
   * back `rootFolder: undefined` — every service then reads as not installed.
   */
  const d = s.devenv ?? {};
  return {
    rootFolder: d.rootFolder || DEPLOY_DEFAULT.rootFolder,
    domain: d.domain || DEPLOY_DEFAULT.domain,
    server: d.server || DEPLOY_DEFAULT.server,
    runtimes: d.runtimes ?? {},
    services: d.services ?? {},
  };
};

/** Paths pinned in Settings, so detection can prefer them over PATH. */
function customPaths(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg().runtimes ?? {})) {
    if (v?.path) out[k] = v.path;
  }
  return out;
}

/**
 * Fingerprint of everything a scan result depends on. When this is unchanged,
 * the cached result is still valid and `muat()` can return without spawning a
 * process. The pinned runtime paths are included because they change what
 * detection resolves.
 */
function stempelKonfig(): string {
  const c = cfg();
  const paths = Object.entries(customPaths())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${c.rootFolder}|${c.domain}|${c.server}|${paths}`;
}

/**
 * Phase 1 placeholders for the rows the Rust side does not report yet. Only
 * Services and Projects are still mocked; runtimes come from detection.
 */
const MOCK_SERVICE: BarisService[] = SERVICE_DAFTAR.map((s) => ({
  id: s.id,
  label: s.label,
  // Apache and PostgreSQL stand in for "not present on this machine"; the
  // real detection fills this in during phase 2.
  status: s.id === 'apache' || s.id === 'postgres' ? 'not-installed' : s.id === 'nginx' ? 'running' : 'stopped',
  versi: s.id === 'postgres' || s.id === 'apache' ? '' : s.id === 'nginx' ? '1.31.6' : s.id === 'mysql' ? '11.4.4' : s.id === 'redis' ? '7.2.5' : '',
  port: s.port,
  autoStart: s.id === 'nginx',
  jumlahJob: s.id === 'cron' ? 4 : undefined,
}));

// Projects come from a real directory scan now, so the mock list is gone.


export const useDevenv = create<DevenvState>((set, get) => ({
  runtimes: RUNTIME_DAFTAR.map((r) => ({
    id: r.id,
    label: r.label,
    inti: r.inti,
    terpasang: false,
    versi: '',
    daftarVersi: [],
    path: '',
  })),
  servicesMock: MOCK_SERVICE,
  projects: [],
  memindai: false,
  sudahMuat: false,
  stempel: '',
  pesan: '',
  cfg: { ...DEPLOY_DEFAULT },
  services: SERVICE_DAFTAR.map((s) => ({
    id: s.id,
    label: s.label,
    status: 'not-installed' as StatusService,
    versi: '',
    port: s.port,
    autoStart: false,
  })),

  muat: async (paksa = false) => {
    // A scan is in flight. Coalesce rather than drop: a forced call (start/stop,
    // Refresh, config edit) must not be swallowed, or the panel keeps showing
    // the pre-change rows forever. Record it and let the running scan re-run.
    if (get().memindai) {
      if (paksa) permintaanTertunda = true;
      return;
    }

    const stempel = stempelKonfig();
    // The cache: unchanged config + a previous scan means nothing to do. Opening
    // the panel repeatedly must not re-spawn detect (3.2s) and services (1.2s).
    if (!paksa && get().sudahMuat && get().stempel === stempel) return;

    set({ memindai: true });
    try {
      const custom = customPaths();
      const root = cfg().rootFolder;
      const [found, svc, proj] = await Promise.all([
        devenvDetectRuntimes(custom),
        devenvDetectServices(root),
        devenvScanProjects(root, cfg().domain),
      ]);
      set({
        runtimes: (found ?? []).map((f): BarisRuntime => {
          const meta = RUNTIME_DAFTAR.find((r) => r.id === f.id);
          return {
            // The Rust side returns a plain string; fall back to the known
            // id so an unknown runtime cannot break the row type.
            id: meta?.id ?? (f.id as RuntimeId),
            label: f.label || meta?.label || f.id,
            inti: meta?.inti ?? false,
            terpasang: f.installed,
            versi: f.version,
            daftarVersi: f.version ? [f.version] : [],
            path: f.path,
          };
        }),
        services: (svc ?? []).map((s): BarisService => ({
          id: s.id as DevenvServiceId,
          label: s.label,
          status: s.installed ? (s.jalan ? 'running' : 'stopped') : 'not-installed',
          versi: s.version,
          port: s.port,
          autoStart: cfg().services?.[s.id as DevenvServiceId]?.autoStart ?? false,
          pid: s.pid,
          versions: s.versions ?? [],
          path: s.path,
          windowsService: s.windowsService,
        })),
        projects: (proj ?? []).map((p): DevenvProject => ({
          nama: p.nama,
          path: p.path,
          php: 'global',
          node: 'global',
          url: p.url,
          composer: p.composer,
          package: p.package,
        })),
        sudahMuat: true,
        stempel,
        });
    } catch {
      // A failed scan must leave the panel usable: the rows stay, uninstalled.
      set({ pesan: 'could not scan the dev environment' });
    } finally {
      set({ memindai: false });
      // A forced call arrived while this scan ran; run it once now so the
      // caller's change is reflected instead of being lost.
      if (permintaanTertunda) {
        permintaanTertunda = false;
        void get().muat(true);
      }
    }
  },

  refresh: () => get().muat(true),

  startService: async (id) => {
    const root = cfg().rootFolder;
    set({ pesan: '' });
    const hasil = await devenvServiceStart(id, root);
    if (!hasil.ok) set({ pesan: hasil.pesan || 'could not start' });
    // A start/stop changes live process state, so the cached rows are stale.
    await get().muat(true);
  },

  stopService: async (id) => {
    set({ pesan: '' });
    const hasil = await devenvServiceStop(id);
    if (!hasil.ok) set({ pesan: hasil.pesan || 'could not stop' });
    await get().muat(true);
  },


  openPath: async (path) => {
    try {
      await devenvOpenPath(path);
    } catch (e) {
      set({ pesan: e instanceof Error ? e.message : 'could not open the path' });
    }
  },

  startAll: async () => {
    const root = cfg().rootFolder;
    set({ pesan: '' });
    const target = get().services.filter((s) => s.status === 'stopped');
    if (target.length === 0) {
      await get().muat(true);
      return;
    }
    /*
     * Start in parallel, not one after another. Each start waits for its port
     * to answer, so a sequential loop costs the sum of every wait — five
     * services at the old 5s ceiling was 25s of sitting still. The Rust side
     * owns a separate pid per service, so there is nothing to serialise.
     */
    const hasil = await Promise.all(
      target.map(async (s) => ({ s, r: await devenvServiceStart(s.id, root) })),
    );
    const gagal = hasil.filter((h) => !h.r.ok);
    if (gagal.length > 0) {
      set({ pesan: gagal.map((h) => h.r.pesan || `could not start ${h.s.label}`).join('; ') });
    }
    // One rescan for the whole batch, not one per service.
    await get().muat(true);
  },

  stopAll: async () => {
    set({ pesan: '' });
    // Only the services whose process Zephyr owns can be stopped.
    const target = get().services.filter((s) => s.status === 'running' && s.pid);
    for (const s of target) {
      const hasil = await devenvServiceStop(s.id);
      if (!hasil.ok) set({ pesan: hasil.pesan || `could not stop ${s.label}` });
    }
    await get().muat(true);
  },

  buatProyek: async (nama) => {
    const bersih = nama.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!bersih) {
      set({ pesan: 'a project name is required' });
      return;
    }
    const dir = `${cfg().rootFolder}\\www\\${bersih}`;
    set({ pesan: '' });
    try {
      await fsCreateDir(dir);
      await get().muat(true);
    } catch (e) {
      set({ pesan: e instanceof Error ? e.message : 'could not create the project' });
    }
  },

  bukaSettings: () => {
    const s = useStore.getState();
    s.setSettingsOpen(true);
    s.setActivity('settings');
    useSettingsUi.getState().setSection('devenv');
  },

  registerShim: () => {
    // The Rust side has no "install PATH shim" command yet, so say so plainly
    // rather than presenting a button that does nothing.
    useStore.getState().setStatus('PATH shim registration is not implemented yet');
  },

  bukaBaris: async (path) => {
    if (!path) {
      useStore.getState().setStatus('No folder to open for this row');
      return;
    }
    await get().openPath(path);
  },

  belumTersedia: (nama) => {
    useStore.getState().setStatus(`${nama} is not implemented yet`);
  },

  /*
   * Pin a runtime to a folder the user picked. Stored under
   * `settings.devenv.runtimes.<id>.path`, which is the same key detection
   * already reads through `customPaths()` — so a pinned runtime is reported
   * even when it is not on PATH and not under the Dev Environment root.
   */
  pilihPathRuntime: async (id) => {
    let dipilih: string | null = null;
    try {
      dipilih = await folderDialogOpen();
    } catch {
      useStore.getState().setStatus('could not open the folder picker');
      return;
    }
    if (!dipilih) return;
    const sekarang = cfg().runtimes?.[id];
    await useStore
      .getState()
      .applySettings({
        devenv: {
          runtimes: { [id]: { ...(sekarang ?? {}), path: dipilih } },
        } as never,
      })
      .catch(() => useStore.getState().setStatus('could not save the runtime path'));
    await get().muat(true);
    useStore.getState().setStatus(`${id} pinned to ${dipilih}`);
  },

  /** Remember the version chosen for a service row. */
  setServiceVersi: async (id, versi) => {
    const sekarang = cfg().services?.[id];
    await useStore
      .getState()
      .applySettings({
        devenv: { services: { [id]: { ...(sekarang ?? { autoStart: false }), versi } } } as never,
      })
      .catch(() => useStore.getState().setStatus('could not save the version'));
  },

  /** Remember the PHP/Node version a project row should use. */
  setProjectVersi: async (nama, tool, versi) => {
    const s = useStore.getState().settings as unknown as {
      devenv?: { projects?: Record<string, { php?: string; node?: string }> };
    };
    const lama = s.devenv?.projects?.[nama] ?? {};
    await useStore
      .getState()
      .applySettings({
        devenv: { projects: { [nama]: { ...lama, [tool]: versi } } } as never,
      })
      .catch(() => useStore.getState().setStatus('could not save the project version'));
  },

  /*
   * Remember the runtime version the user picked. Stored as a `versi` pin on
   * the runtime entry, next to the `path` a Locate already writes, so the two
   * knobs live in one place in settings.json.
   */
  setRuntimeVersi: async (id, versi) => {
    const sekarang = cfg().runtimes?.[id];
    await useStore
      .getState()
      .applySettings({
        devenv: { runtimes: { [id]: { ...(sekarang ?? {}), versi } } } as never,
      })
      .catch(() => useStore.getState().setStatus('could not save the runtime version'));
  },

  setRoot: (p) => void useStore.getState().applySettings({ devenv: { rootFolder: p } as never }),
  setDomain: (d) => void useStore.getState().applySettings({ devenv: { domain: d } as never }),
  setServer: (s) => void useStore.getState().applySettings({ devenv: { server: s } as never }),

  setAutoStart: (id, on) => {
    // Flip the row first, then persist. applySettings does a full round trip
    // (write, re-read, retheme, provider sync); waiting on it for a checkbox
    // made the box feel frozen. The optimistic set is what the user sees, and
    // a failed write is reported in the status bar instead of silently reverting.
    set((state) => ({
      services: state.services.map((sv) => (sv.id === id ? { ...sv, autoStart: on } : sv)),
    }));
    const services = cfg().services ?? {};
    const sekarang = services[id] ?? { autoStart: false, versi: '', port: 0 };
    void useStore
      .getState()
      .applySettings({ devenv: { services: { [id]: { ...sekarang, autoStart: on } } } as never })
      .catch(() => useStore.getState().setStatus('could not save the auto-start setting'));
  },
}));

/** "apache · *.test · D:\DevEnv" - the active configuration, one line. */
export function ringkasDevenv(): string {
  const c = cfg();
  const server = c.server === 'none' ? 'no server' : c.server;
  const domain = c.domain.startsWith('.') ? `*${c.domain}` : `.${c.domain}`;
  return `${server} · ${domain} · ${c.rootFolder}`;
}

export type { DevenvRuntime, DevenvService, DevenvProject };
