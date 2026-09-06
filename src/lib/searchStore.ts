// searchStore.ts — Global Search & Replace via ripgrep (fase 25).
//
// KENAPA STORE BARU, BUKAN MEMPERLUAS explorerStore
//
// Fase 04 sudah punya pencarian sederhana di `explorerStore` (scan Rust
// sendiri, sekali jalan, hasil dikirim utuh). Fase 25 punya bentuk yang
// berbeda secara mendasar: hasil MENGALIR lewat event, ada pembatalan,
// pengelompokan per file, riwayat query, dan replace yang bisa dibatalkan.
// Menumpuk semua itu ke explorerStore membuat satu store mengurus dua model
// data sekaligus — dan explorerStore sudah dipakai file tree.
//
// Jalur lama TIDAK dihapus: ia menjadi FALLBACK saat rg tidak ada di mesin
// user, dan itu memang perilaku yang diminta brief (rg tidak dibundel).

import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  searchGrep,
  searchCancel,
  searchRgInfo,
  searchReplace,
  searchFiles as searchFilesBawaan,
} from './commands';
import type { RgHit, SearchOpts, SearchSummary, ReplaceHasil } from './types';
import { useStore } from './store';
import { useHistory } from './historyStore';
import { notifyError, notifyInfo, notifyWarn } from './notificationStore';

/** Batas riwayat query yang disimpan (dropdown di input). */
const MAX_RIWAYAT = 12;

/** Satu file beserta match-nya. */
export interface GrupFile {
  path: string;
  hits: RgHit[];
  /** false = daftar match file ini dilipat */
  terbuka: boolean;
}

interface SearchState {
  query: string;
  replaceWith: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include: string;
  exclude: string;
  respectGitignore: boolean;
  includeHidden: boolean;
  maxResults: number;
  /**
   * Folder awal pencarian. '' = seluruh workspace.
   *
   * Ada karena "Search in Folder" (klik kanan di file tree) dan leg SSH
   * dua-duanya perlu mempersempit root; search.rs sudah menerimanya dan
   * menolak root di luar workspace.
   */
  root: string;

  /** hasil terkelompok per file, urut sesuai kedatangan dari rg */
  grup: GrupFile[];
  /** total match (bisa > jumlah yang ditampilkan bila truncated) */
  total: number;
  running: boolean;
  summary: SearchSummary | null;
  error: string | null;
  /** info binary rg: ada/tidak + versi */
  rg: { ada: boolean; path: string; versi: string } | null;

  /** riwayat query untuk dropdown */
  riwayat: string[];
  /** hit yang sedang disorot (untuk F4 / Shift+F4) */
  indeksAktif: number;
  /** panel replace terbuka (Ctrl+Shift+H) */
  replaceTerbuka: boolean;
  /** hasil replace terakhir — dasar tombol Undo */
  replaceTerakhir: ReplaceHasil[] | null;
}

interface SearchActions {
  setQuery: (q: string) => void;
  setReplaceWith: (r: string) => void;
  setInclude: (g: string) => void;
  setExclude: (g: string) => void;
  setMaxResults: (n: number) => void;
  setRoot: (p: string) => void;
  toggleCase: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  toggleGitignore: () => void;
  toggleHidden: () => void;
  setReplaceTerbuka: (v: boolean) => void;
  toggleGrup: (path: string) => void;

  cekRg: () => Promise<void>;
  jalankan: () => Promise<SearchSummary | null>;
  batalkan: () => Promise<void>;
  bersihkan: () => void;

  /** semua hit datar, urut file lalu baris — dasar F4 / Shift+F4 */
  semuaHit: () => RgHit[];
  bukaHit: (hit: RgHit) => Promise<void>;
  lompat: (delta: number) => Promise<void>;

  replaceSatuFile: (path: string) => Promise<number>;
  replaceSemua: () => Promise<number>;
  undoReplace: () => Promise<number>;

  _onHit: (file: string, hits: RgHit[]) => void;
}

const opsiDari = (s: SearchState): SearchOpts => ({
  query: s.query,
  caseSensitive: s.caseSensitive,
  wholeWord: s.wholeWord,
  regex: s.regex,
  include: s.include,
  exclude: s.exclude,
  respectGitignore: s.respectGitignore,
  includeHidden: s.includeHidden,
  maxResults: s.maxResults,
  // '' harus dikirim sebagai undefined: Rust memakai `Option<String>` dan
  // string kosong akan lolos filter lalu dianggap path.
  root: s.root.trim() === '' ? undefined : s.root,
});

export const useSearch = create<SearchState & SearchActions>((set, get) => ({
  query: '',
  replaceWith: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: '',
  exclude: '',
  respectGitignore: true,
  includeHidden: false,
  maxResults: 5000,
  root: '',

  grup: [],
  total: 0,
  running: false,
  summary: null,
  error: null,
  rg: null,

  riwayat: [],
  indeksAktif: -1,
  replaceTerbuka: false,
  replaceTerakhir: null,

  setQuery: (q) => set({ query: q }),
  setReplaceWith: (r) => set({ replaceWith: r }),
  setInclude: (g) => set({ include: g }),
  setExclude: (g) => set({ exclude: g }),
  setMaxResults: (n) => set({ maxResults: Math.max(1, Math.min(100_000, n)) }),
  setRoot: (p) => set({ root: p }),
  toggleCase: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleWholeWord: () => set((s) => ({ wholeWord: !s.wholeWord })),
  toggleRegex: () => set((s) => ({ regex: !s.regex })),
  toggleGitignore: () => set((s) => ({ respectGitignore: !s.respectGitignore })),
  toggleHidden: () => set((s) => ({ includeHidden: !s.includeHidden })),
  setReplaceTerbuka: (v) => set({ replaceTerbuka: v }),

  toggleGrup: (path) =>
    set((s) => ({
      grup: s.grup.map((g) => (g.path === path ? { ...g, terbuka: !g.terbuka } : g)),
    })),

  cekRg: async () => {
    try {
      const r = await searchRgInfo();
      set({ rg: r });
    } catch {
      set({ rg: { ada: false, path: '', versi: '' } });
    }
  },

  jalankan: async () => {
    const s = get();
    if (!s.query.trim()) {
      set({ grup: [], total: 0, summary: null, error: null });
      return null;
    }
    if (!useStore.getState().workspace) {
      set({ error: 'buka folder dulu untuk mencari' });
      return null;
    }

    set({
      running: true,
      grup: [],
      total: 0,
      error: null,
      summary: null,
      indeksAktif: -1,
      riwayat: [s.query, ...s.riwayat.filter((x) => x !== s.query)].slice(0, MAX_RIWAYAT),
    });

    try {
      const sum = await searchGrep(opsiDari(get()));
      set({ running: false, summary: sum });

      // rg tidak ada → JATUH ke pencarian bawaan fase 04 supaya fitur tetap
      // berguna, dan katakan apa adanya di UI.
      if (sum.error) {
        const bawaan = await searchFilesBawaan(get().query, {
          glob: get().include || undefined,
          caseSensitive: get().caseSensitive,
          regex: get().regex,
        });
        const perFile = new Map<string, RgHit[]>();
        for (const h of bawaan.hits) {
          const arr = perFile.get(h.path) ?? [];
          arr.push({
            path: h.path,
            line: h.line,
            col: h.col,
            matchLen: h.matchLen,
            preview: h.preview,
            ranges: [[h.col, h.matchLen]],
          });
          perFile.set(h.path, arr);
        }
        set({
          grup: [...perFile].map(([path, hits]) => ({ path, hits, terbuka: true })),
          total: bawaan.hits.length,
          error: `${sum.error} — memakai pencarian bawaan (lebih lambat)`,
        });
        return sum;
      }
      return sum;
    } catch (e) {
      const z = e && typeof e === 'object' && 'message' in e ? (e as { message: string }).message : String(e);
      set({ running: false, error: z });
      return null;
    }
  },

  batalkan: async () => {
    try {
      await searchCancel();
    } finally {
      // `running` di-set false di sini DAN di akhir jalankan(). Tanpa ini,
      // jalankan() yang masih menunggu invoke akan menimpanya kembali ke true
      // sesaat setelah cancel — harness melihat running tetap true.
      set({ running: false });
    }
  },

  bersihkan: () =>
    set({ grup: [], total: 0, summary: null, error: null, indeksAktif: -1 }),

  semuaHit: () => get().grup.flatMap((g) => g.hits),

  bukaHit: async (hit) => {
    const S = useStore.getState();
    await S.openPath(hit.path);
    // Sorot & scroll ke match. `revealPosition(line, col)` menerima 1-based,
    // sama dengan yang dikirim rg setelah konversi byte→karakter di Rust.
    // (Ia hanya menerima 2 argumen — panjang match tidak dipakai untuk
    // seleksi, cukup posisi kursor.)
    const { revealPosition } = await import('./editorRegistry');
    revealPosition(hit.line, hit.col);
  },

  lompat: async (delta) => {
    const semua = get().semuaHit();
    if (semua.length === 0) return;
    const i = (get().indeksAktif + delta + semua.length) % semua.length;
    set({ indeksAktif: i });
    await get().bukaHit(semua[i]);
  },

  replaceSatuFile: async (path) => {
    const s = get();
    if (!s.query.trim()) return 0;
    const hasil = await searchReplace([path], opsiDari(s), s.replaceWith);
    const n = hasil.reduce((a, h) => a + h.jumlah, 0);
    set({ replaceTerakhir: hasil });
    if (n > 0) {
      notifyInfo(`${n} penggantian di 1 file`, { source: 'search' });
      // Tab yang terbuka harus ikut berubah: isinya sudah lain di disk.
      await muatUlangTab([path]);
      await get().jalankan();
    }
    return n;
  },

  replaceSemua: async () => {
    const s = get();
    if (!s.query.trim()) return 0;
    const files = s.grup.map((g) => g.path);
    if (files.length === 0) return 0;
    const hasil = await searchReplace(files, opsiDari(s), s.replaceWith);
    const n = hasil.reduce((a, h) => a + h.jumlah, 0);
    const gagal = hasil.filter((h) => h.error);
    set({ replaceTerakhir: hasil });
    if (gagal.length > 0) {
      notifyWarn(`${gagal.length} file dilewati: ${gagal[0].error}`, { source: 'search' });
    }
    if (n > 0) {
      notifyInfo(`${n} penggantian di ${hasil.filter((h) => h.jumlah > 0).length} file`, {
        source: 'search',
      });
      await muatUlangTab(files);
      await get().jalankan();
    }
    return n;
  },

  undoReplace: async () => {
    const daftar = get().replaceTerakhir;
    if (!daftar || daftar.length === 0) {
      notifyWarn('Belum ada replace untuk dibatalkan', { source: 'search' });
      return 0;
    }
    // Undo = tulis balik snapshot yang dibuat SEBELUM replace (fase 26).
    // Tanpa snapshot itu tidak ada yang bisa dipulihkan — karena itu
    // search_replace di Rust selalu membuatnya lebih dulu.
    let n = 0;
    const H = useHistory.getState();
    for (const h of daftar) {
      if (!h.snapshot) continue;
      try {
        await H.muat(h.path);
        const ok = await H.restore(h.snapshot);
        if (ok) n++;
      } catch (e) {
        notifyError(`Undo gagal untuk ${h.path}: ${String(e)}`, { source: 'search' });
      }
    }
    if (n > 0) {
      notifyInfo(
        `${n} file dikembalikan ke editor sebagai perubahan belum disimpan — tekan Ctrl+S untuk menulis`,
        { source: 'search' },
      );
    }
    set({ replaceTerakhir: null });
    return n;
  },

  _onHit: (file, hits) =>
    set((s) => {
      const idx = s.grup.findIndex((g) => g.path === file);
      const next = s.grup.slice();
      if (idx >= 0) next[idx] = { ...next[idx], hits: [...next[idx].hits, ...hits] };
      else next.push({ path: file, hits, terbuka: true });
      return { grup: next, total: s.total + hits.length };
    }),
}));

/** Muat ulang isi tab yang filenya diubah replace. */
const muatUlangTab = async (paths: string[]) => {
  const S = useStore.getState();
  const kunci = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const daftar = new Set(paths.map(kunci));
  for (const t of S.tabs) {
    // Tab dirty TIDAK ditimpa: menimpanya diam-diam membuang pekerjaan user.
    // `reloadTabFromDisk` menerima PATH, bukan id tab.
    if (t.path && daftar.has(kunci(t.path)) && !t.unsaved) {
      await S.reloadTabFromDisk(t.path);
    }
  }
};

/**
 * Pasang listener `search-hit` SEKALI per proses.
 *
 * Guard modul, bukan cleanup effect: StrictMode dev memasang effect dua kali
 * dan setiap hit akan tampil dobel — pelajaran yang sama dari `pty-output`,
 * `ai-chunk`, `mcp-action`, dan `task-output`.
 */
let searchListenerBound = false;

export const bindSearchListeners = () => {
  if (searchListenerBound) return;
  searchListenerBound = true;
  void listen<{ file: string; hits: RgHit[] }>('search-hit', (e) => {
    useSearch.getState()._onHit(e.payload.file, e.payload.hits);
  });
};
