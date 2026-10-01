import { create } from 'zustand';

export type Severity = 'info' | 'warn' | 'error';

export interface NotifAction {
  label: string;
  command: string;
}

export interface Notif {
  id: string;
  severity: Severity;
  message: string;
  detail?: string;
  
  source?: string;
  actions: NotifAction[];
  
  progress?: number | 'indeterminate';
  
  sticky?: boolean;
  timestamp: number;
  read: boolean;
}

const AUTO_HIDE_MS = 4200;

const MAX_RIWAYAT = 200;

let seq = 0;
const nextId = () => `n-${Date.now().toString(36)}-${++seq}`;

const timers = new Map<string, number>();

interface NotifState {
  
  items: Notif[];
  
  toasts: string[];
  
  centerOpen: boolean;
  
  dnd: boolean;
}

interface NotifActions {
  
  notify: (n: {
    severity?: Severity;
    message: string;
    detail?: string;
    source?: string;
    actions?: NotifAction[];
    progress?: number | 'indeterminate';
    sticky?: boolean;
  }) => string;
  
  update: (id: string, patch: Partial<Omit<Notif, 'id' | 'timestamp'>>) => void;
  
  progress: (id: string, val: number | 'indeterminate') => void;
  
  dismiss: (id: string) => void;
  
  remove: (id: string) => void;
  clear: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setCenterOpen: (open: boolean) => void;
  toggleCenter: () => void;
  setDnd: (v: boolean) => void;
  toggleDnd: () => void;
  
  unread: () => number;
}

export const useNotif = create<NotifState & NotifActions>((set, get) => ({
  items: [],
  toasts: [],
  centerOpen: false,
  dnd: false,

  notify: (n) => {
    const id = nextId();
    const severity = n.severity ?? 'info';
    
    const sticky = n.sticky ?? (severity === 'error' || n.progress !== undefined);
    const item: Notif = {
      id,
      severity,
      message: n.message,
      detail: n.detail,
      source: n.source,
      actions: n.actions ?? [],
      progress: n.progress,
      sticky,
      timestamp: Date.now(),
      read: false,
    };
    set((s) => ({
      items: [item, ...s.items].slice(0, MAX_RIWAYAT),
      
      toasts: s.dnd ? s.toasts : [id, ...s.toasts],
    }));
    if (!sticky && !get().dnd) {
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id);
          get().dismiss(id);
        }, AUTO_HIDE_MS),
      );
    }
    return id;
  },

  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),

  progress: (id, val) => {
    get().update(id, { progress: val });
    
    if (val === 100) {
      window.setTimeout(() => get().dismiss(id), 900);
    }
  },

  dismiss: (id) => {
    const t = timers.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      timers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((x) => x !== id) }));
  },

  remove: (id) => {
    get().dismiss(id);
    set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
  },

  clear: () => {
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
    set({ items: [], toasts: [] });
  },

  markRead: (id) =>
    set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, read: true } : x)) })),

  markAllRead: () => set((s) => ({ items: s.items.map((x) => ({ ...x, read: true })) })),

  setCenterOpen: (open) => {
    set({ centerOpen: open });
    if (open) get().markAllRead();
  },
  toggleCenter: () => get().setCenterOpen(!get().centerOpen),

  setDnd: (v) => {
    set({ dnd: v });
    
    if (v) set({ toasts: [] });
  },
  toggleDnd: () => get().setDnd(!get().dnd),

  unread: () => get().items.filter((x) => !x.read).length,
}));

export const notifyInfo = (message: string, opts?: { detail?: string; source?: string }) =>
  useNotif.getState().notify({ severity: 'info', message, ...opts });

export const notifyWarn = (message: string, opts?: { detail?: string; source?: string }) =>
  useNotif.getState().notify({ severity: 'warn', message, ...opts });

export const notifyError = (
  message: string,
  opts?: { detail?: string; source?: string; actions?: NotifAction[] },
) => useNotif.getState().notify({ severity: 'error', message, ...opts });
