import { create } from 'zustand';

/*
 * Whether the Sessions column is open, for the expanded Chat panel.
 *
 * A store rather than prop-drilling, because two surfaces far apart own the
 * same fact: the ✕ in the column's own header closes it, and the "Show Agent
 * Sessions Sidebar" item in the "…" menu reopens it. Before this, closing the
 * column was a one-way door — `sesiTutup` was local to App.tsx, so nothing
 * outside it could bring the list back, and a reader who dismissed it had no
 * way to see their conversations again except by leaving maximize.
 *
 * Defaults to open: maximizing is a statement that there is room for the list.
 * Not persisted — a fresh maximize shows it again, which is what "there is room
 * now" means.
 */
interface SessionsSideState {
  buka: boolean;
  setBuka: (v: boolean) => void;
  toggle: () => void;
}

export const useSessionsSide = create<SessionsSideState>((set, get) => ({
  buka: true,
  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
}));
