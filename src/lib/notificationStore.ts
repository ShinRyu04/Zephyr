// notificationStore.ts — satu sumber notifikasi untuk seluruh app (fase 27).
//
// KENAPA TERPUSAT: sebelum ini setiap domain punya jalur sendiri —
// `statusMessage` di store utama, `toast` di aiStore/mcpStore/terminalStore,
// `window.confirm()` di Explorer. Akibatnya pesan penting bisa tertimpa dalam
// milidetik dan tidak ada riwayatnya. Store ini menggantikan semuanya:
// toast untuk yang sementara, Notification Center untuk riwayat.
//
// Yang TIDAK dilakukan di sini (batas fase 27): tidak ada email, tidak ada
// push OS-level. Hanya di dalam jendela Zephyr.

import { create } from 'zustand';

export type Severity = 'info' | 'warn' | 'error';

/** Aksi pada notifikasi. `command` = id di commandRegistry (fase 12). */
export interface NotifAction {
  label: string;
  command: string;
}

export interface Notif {
  id: string;
  severity: Severity;
  message: string;
  detail?: string;
  /** domain asal: 'git' | 'ai' | 'mcp' | 'terminal' | 'update' | ... */
  source?: string;
  actions: NotifAction[];
  /** 0..100, atau 'indeterminate' untuk operasi tanpa persen */
  progress?: number | 'indeterminate';
  /** true = tidak auto-hide (error selalu sticky) */
  sticky?: boolean;
  timestamp: number;
  read: boolean;
}

/** Lama toast hidup sebelum hilang sendiri (ms). Error & progress tidak. */
const AUTO_HIDE_MS = 4200;
/** Batas riwayat — di atas ini yang paling tua dibuang. */
const MAX_RIWAYAT = 200;

let seq = 0;
const nextId = () => `n-${Date.now().toString(36)}-${++seq}`;

/** Timer auto-hide per id. Di luar store supaya tidak memicu render. */
const timers = new Map<string, number>();

interface NotifState {
  /** riwayat lengkap, terbaru di depan */
  items: Notif[];
  /** id yang sedang tampil sebagai toast */
  toasts: string[];
  /** panel Notification Center terbuka */
  centerOpen: boolean;
  /** Do Not Disturb: toast diredam, riwayat TETAP dicatat */
  dnd: boolean;
}

interface NotifActions {
  /** Tampilkan notifikasi baru; mengembalikan id-nya. */
  notify: (n: {
    severity?: Severity;
    message: string;
    detail?: string;
    source?: string;
    actions?: NotifAction[];
    progress?: number | 'indeterminate';
    sticky?: boolean;
  }) => string;
  /** Ubah notifikasi yang sudah ada (mis. pesan progres berubah). */
  update: (id: string, patch: Partial<Omit<Notif, 'id' | 'timestamp'>>) => void;
  /** Setel persen progres; 100 = selesai lalu toast hilang sendiri. */
  progress: (id: string, val: number | 'indeterminate') => void;
  /** Buang dari toast (riwayat tetap ada). */
  dismiss: (id: string) => void;
  /** Buang dari riwayat juga. */
  remove: (id: string) => void;
  clear: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setCenterOpen: (open: boolean) => void;
  toggleCenter: () => void;
  setDnd: (v: boolean) => void;
  toggleDnd: () => void;
  /** jumlah yang belum dibaca (untuk badge lonceng) */
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
    // Error SELALU sticky: pesan kegagalan tidak boleh hilang sebelum dibaca.
    // Notifikasi ber-progress juga tidak auto-hide (dihapus saat selesai).
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
      // DND meredam TOAST saja — riwayat tetap terisi (syarat 27).
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
    // Selesai: biarkan terlihat sebentar lalu lepas dari toast.
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
    // Menyalakan DND langsung membersihkan toast yang sedang tampil.
    if (v) set({ toasts: [] });
  },
  toggleDnd: () => get().setDnd(!get().dnd),

  unread: () => get().items.filter((x) => !x.read).length,
}));

/** Pintasan yang dipakai di seluruh app supaya call site-nya pendek. */
export const notifyInfo = (message: string, opts?: { detail?: string; source?: string }) =>
  useNotif.getState().notify({ severity: 'info', message, ...opts });

export const notifyWarn = (message: string, opts?: { detail?: string; source?: string }) =>
  useNotif.getState().notify({ severity: 'warn', message, ...opts });

export const notifyError = (
  message: string,
  opts?: { detail?: string; source?: string; actions?: NotifAction[] },
) => useNotif.getState().notify({ severity: 'error', message, ...opts });
