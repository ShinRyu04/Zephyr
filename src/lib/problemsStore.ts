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
  
  source: string;
  code?: string;
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2, hint: 3 };

export { kunciPath };

interface ProblemsState {
  
  byFile: Map<string, Diagnostic[]>;
  
  filter: string;
  
  activeOnly: boolean;
}

interface ProblemsActions {
  
  setDiagnostics: (file: string, list: Diagnostic[]) => void;
  removeFile: (file: string) => void;
  clearAll: () => void;
  clearSource: (source: string) => void;
  setFilter: (q: string) => void;
  setActiveOnly: (v: boolean) => void;
  
  all: () => Diagnostic[];
  
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
