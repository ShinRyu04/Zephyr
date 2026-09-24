import { create } from 'zustand';

export type PortProtocol = 'http' | 'https';
export type PortSource = 'ssh' | 'task' | 'debug' | 'manual';

export interface ForwardedPort {
  id: string;
  hostPort: number;
  privatePort: number;
  protocol: PortProtocol;
  process: string;
  source: PortSource;
  forwarder: string;
  status: 'running' | 'stopped';
}

interface PortsState {
  ports: ForwardedPort[];
  portsError: string | null;
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
}

let seq = 0;

export const usePorts = create<PortsState & PortsActions>((set, get) => ({
  ports: [],
  portsError: null,

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

}));
