// editorLayoutStore.ts — split editor (fase 33): beberapa grup editor
// berdampingan ala VS Code, TANPA mengubah arsitektur tab tunggal.
//
// Prinsip keamanan:
//   * Tab TETAP satu daftar global di store.ts. Grup hanya MENUNJUK tab
//     (groupId di Tab) — memindah tab antar grup tidak menduplikasi isi.
//   * `activeTabId` store global = tab aktif di GRUP FOKUS. Semua konsumen
//     lama (LSP, FindBar, MCP, palette) membaca itu dan tidak berubah.
//   * Default = satu grup penuh (`id: 'g1'`) → perilaku 100% sama dengan
//     sebelum split, semua verifikasi lama tetap hijau.
//   * State UI (rasio split, group fokus) hanya di sini + dipersist lewat
//     session storage (bukan settings disk) supaya tidak mencemari skema
//     settings yang diuji verifikasi.

import { create } from 'zustand';
import { useStore } from './store';

export interface EditorGroup {
  id: string;
  /** tab yang aktif di grup ini */
  tabId: string | null;
  /** proporsi lebar (hanya dipakai saat split 2 grup) */
  ratio: number;
}

interface EditorLayoutState {
  /** urutan group; length 1 = tanpa split */
  groups: EditorGroup[];
  /** id group yang sedang fokus (menerima openPath/setActiveTab) */
  fokus: string;
  split: boolean;

  /** group yang menampung tab ini (grup pertama yang memuat) */
  groupUntukTab: (tabId: string | null) => string | null;
  /** jadikan group ini fokus + aktifkan tabnya di store global */
  fokusGroup: (gid: string) => void;
  /** pindahkan tab KE grup lain (drag atau "Move Tab to Group") */
  pindahTab: (tabId: string, keGid: string) => void;
  /** buka split kanan; tab aktif sekarang pindah ke group baru */
  splitKanan: () => void;
  /** tutup group kanan; tabnya kembali ke group kiri */
  gabungKanan: () => void;
  /** set proporsi (0..1) lewat drag divider */
  setRatio: (r: number) => void;
  /** set tab aktif sebuah group (dari klik tab bar group tsb); null = kosongkan */
  setGroupTab: (gid: string, tabId: string | null) => void;
  reset: () => void;
}

let gSeq = 1;
// id group: counter + timestamp — kebal module dobel (HMR) yang me-reset
// counter module-scope tapi state store lama bertahan.
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
    // aktifkan tab group itu di store global — konsumen lama ikut.
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
    if (groups.length >= 2) return; // sudah split
    const st = useStore.getState();
    const aktif = st.activeTabId;
    const gid = gidBaru();
    // Semua tab yang belum punya group dianggap milik group kiri (g1);
    // tab aktif sekarang pindah ke group kanan (perilaku VS Code:
    // split kanan membawa tab yang sedang dilihat).
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
    // Semua tab kembali ke group tunggal g1 (groupId di-reset supaya
    // mode non-split bersih — bar tab tunggal menampilkan semua tab).
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
    // Jangan panggil fokusGroup di sini: dipakai juga oleh forceCloseTab untuk
    // mengosongkan slot group (null) — fokus tidak boleh pindah ke null.
    if (tabId) get().fokusGroup(gid);
  },

  reset: () => {
    gSeq = 0;
    set({ groups: [satuGrup(null)], fokus: 'g1', split: false });
  },
}));

/** Lebar px untuk tiap group (proporsi × total). */
export function rasioLebar(total: number, ratio: number): number {
  return Math.round(total * ratio);
}
