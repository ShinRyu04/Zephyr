import { create } from 'zustand';
import { useStore } from './store';

export interface EditorGroup {
  id: string;
  
  tabId: string | null;
  
  ratio: number;
}

interface EditorLayoutState {
  
  groups: EditorGroup[];
  
  fokus: string;
  split: boolean;

  groupUntukTab: (tabId: string | null) => string | null;
  
  fokusGroup: (gid: string) => void;
  
  pindahTab: (tabId: string, keGid: string) => void;
  
  splitKanan: () => void;
  
  gabungKanan: () => void;
  
  setRatio: (r: number) => void;
  
  setGroupTab: (gid: string, tabId: string | null) => void;
  reset: () => void;
}

let gSeq = 1;

const gidBaru = () => `g${Date.now().toString(36)}${++gSeq}`;

const satuGrup = (tabId: string | null): EditorGroup => ({ id: 'g1', tabId, ratio: 0.5 });

export const useLayout = create<EditorLayoutState>((set, get) => ({
  groups: [satuGrup(null)],
  fokus: 'g1',
  split: false,

  groupUntukTab: (tabId) => {
    if (!tabId) return null;
    const g = get().groups.find((x) => x.tabId === tabId);
    return g ? g.id : null;
  },

  fokusGroup: (gid) => {
    const { groups } = get();
    if (!groups.some((g) => g.id === gid)) return;
    const g = groups.find((x) => x.id === gid);
    set({ fokus: gid });
    
    if (g && g.tabId) {
      if (useStore.getState().activeTabId !== g.tabId) useStore.getState().setActiveTab(g.tabId);
    }
  },

  pindahTab: (tabId, keGid) => {
    const { groups } = get();
    const dari = groups.findIndex((g) => g.tabId === tabId);
    const ke = groups.findIndex((g) => g.id === keGid);
    if (ke < 0) return;
    const next = groups.map((g, i) => {
      if (i === dari) return { ...g, tabId: null };
      if (i === ke && g.tabId !== tabId) return { ...g, tabId };
      return g;
    });
    set({ groups: next });
    get().fokusGroup(keGid);
  },

  splitKanan: () => {
    const { groups } = get();
    if (groups.length >= 2) return; 
    const st = useStore.getState();
    const aktif = st.activeTabId;
    const gid = gidBaru();
    
    useStore.setState(
      aktif
        ? {
            tabs: st.tabs.map((t) => {
              if (t.id === aktif) return { ...t, groupId: gid };
              if (!t.groupId) return { ...t, groupId: 'g1' };
              return t;
            }),
          }
        : {
            tabs: st.tabs.map((t) => (t.groupId ? t : { ...t, groupId: 'g1' })),
          },
    );
    set({
      split: true,
      fokus: gid,
      groups: [
        { ...groups[0], tabId: null },
        { id: gid, tabId: aktif, ratio: 0.5 },
      ],
    });
    if (aktif) useStore.getState().setActiveTab(aktif);
  },

  gabungKanan: () => {
    const { groups } = get();
    if (groups.length < 2) return;
    const kanan = groups[1];
    const kiri = groups[0];
    
    const st = useStore.getState();
    useStore.setState({
      tabs: st.tabs.map((t) => ({ ...t, groupId: 'g1' })),
    });
    set({
      split: false,
      fokus: 'g1',
      groups: [
        { id: 'g1', tabId: kanan.tabId ?? kiri.tabId, ratio: 0.5 },
      ],
    });
    if (kanan.tabId) useStore.getState().setActiveTab(kanan.tabId);
    else if (kiri.tabId) useStore.getState().setActiveTab(kiri.tabId);
  },

  setRatio: (r) => {
    const clamped = Math.min(0.75, Math.max(0.25, r));
    set((s) => ({
      groups: s.groups.length < 2 ? s.groups : [{ ...s.groups[0], ratio: clamped }, { ...s.groups[1], ratio: 1 - clamped }],
    }));
  },

  setGroupTab: (gid, tabId) => {
    set((s) => ({
      groups: s.groups.map((g) => (g.id === gid ? { ...g, tabId } : g)),
    }));
    
    if (tabId) get().fokusGroup(gid);
  },

  reset: () => {
    gSeq = 0;
    set({ groups: [satuGrup(null)], fokus: 'g1', split: false });
  },
}));

export function rasioLebar(total: number, ratio: number): number {
  return Math.round(total * ratio);
}
