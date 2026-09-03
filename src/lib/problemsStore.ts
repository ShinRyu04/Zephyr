// problemsStore.ts — diagnostik terpusat (fase 20).
//
// KONTRAK: fase 21 (LSP), 22 (debug), dan 23 (tasks) yang MENGISI store ini.
// Fase 20 hanya menampilkannya. Karena itu bentuk `Diagnostic` di sini adalah
// kontrak publik — jangan diubah tanpa menyesuaikan fase-fase itu.
//
// Diagnostik disimpan PER FILE (`Map<file, Diagnostic[]>`), bukan satu array
// datar: LSP mengirim ulang seluruh daftar untuk satu file setiap kali file
// berubah, jadi `setDiagnostics(file, [...])` harus MENGGANTI, bukan menambah.
// Array datar akan membuat entri lama menumpuk.

import { create } from 'zustand';
import { kunciPath } from './pathKey';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: Severity;
  message: string;
  /** "LSP" | "eslint" | "task:<label>" | "debug" */
  source: string;
  code?: string;
}

/** Urutan tampil: error dulu, lalu warning, dst. */
const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2, hint: 3 };

/**
 * Kunci Map untuk sebuah path — didefinisikan di `pathKey.ts` dan
 * di-re-export di sini supaya pemakai lama tetap jalan.
 *
 * WAJIB dinormalisasi: sumber diagnostik memberi bentuk path yang berbeda —
 * LSP mengirim `file:///d%3A/x/y.ts` (jadi `d:\x\y.ts`, drive HURUF KECIL),
 * sedangkan tab editor bisa memegang `D:/x/y.ts`. Tanpa normalisasi,
 * `setDiagnostics()` dan `forFile()` memakai kunci berbeda untuk file yang
 * SAMA: badge status bar naik tapi tabel & squiggle kosong.
 */
export { kunciPath };

interface ProblemsState {
  /** file → diagnostik. Map, bukan objek, supaya path Windows dengan titik
   *  tidak bertabrakan dengan properti bawaan objek. */
  byFile: Map<string, Diagnostic[]>;
  /** filter teks di ProblemsView */
  filter: string;
  /** hanya tampilkan diagnostik file yang sedang dibuka */
  activeOnly: boolean;
}

interface ProblemsActions {
  /** Ganti seluruh diagnostik satu file (dipanggil LSP/task/debug). */
  setDiagnostics: (file: string, list: Diagnostic[]) => void;
  removeFile: (file: string) => void;
  clearAll: () => void;
  clearSource: (source: string) => void;
  setFilter: (q: string) => void;
  setActiveOnly: (v: boolean) => void;
  /** Semua diagnostik, datar & terurut (severity → file → line). */
  all: () => Diagnostic[];
  /** Diagnostik satu file (untuk gutter marker editor). */
  forFile: (file: string) => Diagnostic[];
  counts: () => { errors: number; warnings: number };
}

export const useProblems = create<ProblemsState & ProblemsActions>((set, get) => ({
  byFile: new Map(),
  filter: '',
  activeOnly: false,

  setDiagnostics: (file, list) =>
    set((s) => {
      const k = kunciPath(file);
      const next = new Map(s.byFile);
      if (list.length === 0) next.delete(k);
      else next.set(k, list);
      return { byFile: next };
    }),

  removeFile: (file) =>
    set((s) => {
      const k = kunciPath(file);
      if (!s.byFile.has(k)) return {};
      const next = new Map(s.byFile);
      next.delete(k);
      return { byFile: next };
    }),

  clearAll: () => set({ byFile: new Map() }),

  clearSource: (source) =>
    set((s) => {
      const next = new Map<string, Diagnostic[]>();
      for (const [f, list] of s.byFile) {
        const sisa = list.filter((d) => d.source !== source);
        if (sisa.length > 0) next.set(f, sisa);
      }
      return { byFile: next };
    }),

  setFilter: (q) => set({ filter: q }),
  setActiveOnly: (v) => set({ activeOnly: v }),

  all: () => {
    const out: Diagnostic[] = [];
    for (const list of get().byFile.values()) out.push(...list);
    out.sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column,
    );
    return out;
  },

  forFile: (file) => get().byFile.get(kunciPath(file)) ?? [],

  counts: () => {
    let errors = 0;
    let warnings = 0;
    for (const list of get().byFile.values()) {
      for (const d of list) {
        if (d.severity === 'error') errors++;
        else if (d.severity === 'warning') warnings++;
      }
    }
    return { errors, warnings };
  },
}));
