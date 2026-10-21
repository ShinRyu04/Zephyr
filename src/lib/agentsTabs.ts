import { create } from 'zustand';
import type { Tampilan } from '../components/agents/AgentsViewDropdown';

/*
 * Tab panel kanan jendela Agents — model multi-tab seperti TRAE.
 *
 * Semua view (File, Terminal, Browser, Task Summary, Side Chat, Diff View)
 * adalah tab sungguhan di sini. Dulu `File` adalah halaman DEFAULT panel:
 * `aktifId === null` berarti "tampilkan File", jadi File selalu muncul
 * sendiri setiap panel dibuka — bahkan sebelum user menyentuh apa pun.
 * `aktifId === null` sekarang berarti TIDAK ADA tab = layar "Start here".
 *
 * Aturan urutan tab (sama seperti TRAE):
 *   - tab pertama yang dibuka mengisi posisi paling kiri;
 *   - view selain Terminal singleton (sudah ada = difokuskan);
 *   - Terminal tidak singleton — tiap klik membuat shell baru.
 *
 * `Tampilan` adalah jenis view; tiap tab membawa `paneId` / `url` sendiri.
 */

export type Tab = {
  id: string;
  /* Jenis view — 'start' = layar "Start here" (tampil bila tidak ada tab). */
  tampilan: Tampilan;
  /* Label tab. Untuk `file` berisi nama file terakhir; untuk `terminal`
     berisi nama shell; untuk sisanya nama view (Browser, Task Summary, …). */
  judul: string;
  /* Terminal: id pane PTY di `terminalStore`. */
  paneId?: string;
  /* Browser: url terakhir tab ini. Webview native ditutup saat tab tidak
     aktif (kotaknya hilang dari layar), tapi url-nya disimpan di sini supaya
     saat tab dibuka lagi halaman terakhir langsung dimuat ulang. */
  url?: string;
  /* File: path file yang sedang dipilih di pohon. Disimpan di store (bukan
     state komponen) supaya tetap ada saat panel kanan ditutup-buka. */
  path?: string;
};

/* Jenis yang boleh ada lebih dari satu tab (selain itu: satu tab per jenis).
   File bukan termasuk: pilihan file & pohonnya satu komponen, jadi satu tab. */
const BOLEH_DOBEL: Tampilan[] = ['terminal'];

let seq = 0;
const idBaru = () => `tab-${++seq}-${Date.now().toString(36)}`;

export const useAgxTabs = create<{
  tabs: Tab[];
  aktifId: string | null;

  /* Buka view baru (atau fokus tab yang sudah ada bila jenisnya singleton). */
  buka: (tampilan: Tampilan, judul: string, paneId?: string) => void;
  fokus: (id: string) => void;
  tutup: (id: string) => void;
  setJudul: (id: string, judul: string) => void;
  /* Isi terminal: dicatat setelah PTY-nya benar-benar jalan. */
  setPane: (id: string, paneId: string) => void;
  setUrl: (id: string, url: string) => void;
  /* Tab File: path terpilih; judul ikut jadi nama file (atau "File" bila kosong). */
  setFile: (id: string, path: string | null) => void;
}>((set, get) => ({
  tabs: [],
  aktifId: null,

  buka: (tampilan, judul, paneId) => {
    if (!BOLEH_DOBEL.includes(tampilan)) {
      const lama = get().tabs.find((t) => t.tampilan === tampilan);
      if (lama) {
        set((s) => ({
          aktifId: lama.id,
          /* Tab File membawa judul = nama file terpilih; jangan ditimpa "File". */
          tabs: s.tabs.map((t) =>
            t.id === lama.id && tampilan !== 'file' ? { ...t, judul } : t,
          ),
        }));
        return;
      }
    }
    const tab: Tab = { id: idBaru(), tampilan, judul, paneId };
    /* Tab baru selalu di ujung kanan deretan, lalu difokuskan. */
    set((s) => ({ tabs: [...s.tabs, tab], aktifId: tab.id }));
  },

  fokus: (id) => set({ aktifId: id }),

  tutup: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      /* Tab yang ditutup = tab yang sedang aktif → aktifkan tab di kirinya;
         tidak ada sisa tab → `null` = Start here. */
      const aktifId =
        s.aktifId === id ? (tabs.length ? tabs[tabs.length - 1]!.id : null) : s.aktifId;
      return { tabs, aktifId };
    }),

  setJudul: (id, judul) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, judul } : t)) })),

  setPane: (id, paneId) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, paneId } : t)) })),

  setUrl: (id, url) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, url } : t)) })),

  setFile: (id, path) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              path: path ?? undefined,
              judul: path ? (path.split(/[\\/]/).pop() ?? path) : 'File',
            }
          : t,
      ),
    })),
}));
