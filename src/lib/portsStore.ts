import { create } from 'zustand';
import * as cmd from './commands';

export type PortProtocol = 'http' | 'https';
export type PortSource = 'ssh' | 'task' | 'debug' | 'manual' | 'sistem';

export interface ForwardedPort {
  id: string;
  hostPort: number;
  privatePort: number;
  protocol: PortProtocol;
  process: string;
  source: PortSource;
  forwarder: string;
  status: 'running' | 'stopped';
  /** pid of the owning process; 0 when unknown (e.g. not Windows). */
  pid?: number;
  /** alamat bind: 127.0.0.1, 0.0.0.0, atau IP lain. */
  alamat?: string;
}

interface PortsState {
  ports: ForwardedPort[];
  portsError: string | null;
  /** true selama pemindaian sistem berjalan. */
  memindai: boolean;
  /** waktu pemindaian terakhir berhasil (ms). */
  terakhir: number;
}

interface PortsActions {
  add: (p: Omit<ForwardedPort, 'id'> & { id?: string }) => string;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<ForwardedPort, 'id'>>) => void;
  list: () => ForwardedPort[];
  urlFor: (id: string) => string;
  setError: (m: string | null) => void;
  clear: () => void;
  /**
   * Read the ports actually listening on the system and merge them with
   * daftar manual.
   *
   * KENAPA digabung, bukan ditimpa: port yang user tambahkan sendiri (mis. port
   * di mesin lain lewat SSH) tidak akan pernah muncul di pemindaian lokal.
   * Menimpanya akan menghapus entri itu setiap kali pemindaian berjalan.
   */
  scan: () => Promise<number>;
  kill: (id: string) => Promise<boolean>;
}

let seq = 0;

export const usePorts = create<PortsState & PortsActions>((set, get) => ({
  ports: [],
  portsError: null,
  memindai: false,
  terakhir: 0,

  add: (p) => {
    const id = p.id ?? `port-${++seq}`;
    set((s) => {
      const idx = s.ports.findIndex((x) => x.hostPort === p.hostPort);
      const entri: ForwardedPort = { ...p, id };
      if (idx >= 0) {
        const next = s.ports.slice();
        next[idx] = { ...entri, id: s.ports[idx].id };
        return { ports: next, portsError: null };
      }
      return { ports: [...s.ports, entri], portsError: null };
    });
    return id;
  },

  remove: (id) => set((s) => ({ ports: s.ports.filter((p) => p.id !== id) })),

  update: (id, patch) =>
    set((s) => {
      const idx = s.ports.findIndex((p) => p.id === id);
      if (idx < 0) return {};
      const next = s.ports.slice();
      next[idx] = { ...next[idx], ...patch };
      return { ports: next };
    }),

  list: () => get().ports,

  urlFor: (id) => {
    const p = get().ports.find((x) => x.id === id);
    if (!p) return '';
    return `${p.protocol}://localhost:${p.hostPort}`;
  },

  setError: (m) => set({ portsError: m }),
  clear: () => set({ ports: [] }),

  scan: async () => {
    if (get().memindai) return get().ports.length;
    set({ memindai: true });
    try {
      const daftar = await cmd.portsList();
      const manual = get().ports.filter((p) => p.source !== 'sistem');
      const sistem: ForwardedPort[] = daftar.map((d) => ({
        id: `sys-${d.port}`,
        hostPort: d.port,
        privatePort: d.port,
        protocol: 'http' as PortProtocol,
        process: d.proses || `pid ${d.pid}`,
        source: 'sistem' as PortSource,
        forwarder: d.proses,
        status: 'running' as const,
        pid: d.pid,
        alamat: d.alamat,
      }));
      set({
        ports: [...sistem, ...manual],
        portsError: null,
        memindai: false,
        terakhir: Date.now(),
      });
      return sistem.length;
    } catch (e) {
      set({
        portsError: String((e as Error)?.message ?? e),
        memindai: false,
      });
      return 0;
    }
  },

  kill: async (id) => {
    const p = get().ports.find((x) => x.id === id);
    if (!p?.pid) {
      set({ portsError: 'Port ini tidak punya pid (bukan dari pemindaian sistem).' });
      return false;
    }
    try {
      await cmd.portsKill(p.pid);
      await get().scan();
      return true;
    } catch (e) {
      set({ portsError: String((e as Error)?.message ?? e) });
      return false;
    }
  },
}));
