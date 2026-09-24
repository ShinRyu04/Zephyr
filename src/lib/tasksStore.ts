import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  tasksLoad,
  tasksRun,
  tasksWait,
  tasksKill,
  tasksClearRuns,
  asZephyrError,
} from './commands';
import type { TaskDef, TaskRun, TaskProblem, TasksFile } from './types';
import { useOutput } from './outputStore';
import { useProblems, type Diagnostic } from './problemsStore';
import { usePorts } from './portsStore';
import { useNotif } from './notificationStore';

const MAX_BARIS = 5_000;

const MAX_RECENT = 8;

export interface TaskState {

  file: TasksFile | null;

  runs: TaskRun[];

  recent: string[];

  activeRun: string | null;
  loading: boolean;
  error: string | null;

  ready: Record<string, boolean>;
}

interface TaskActions {
  muat: (root?: string) => Promise<TasksFile | null>;
  daftar: () => TaskDef[];

  buildDefault: () => TaskDef | null;
  cari: (label: string) => TaskDef | null;
  jalankan: (label: string, opts?: { lewatiDepends?: boolean }) => Promise<TaskRun | null>;

  jalankanAdHoc: (a: {
    label: string;
    command: string;
    args: string[];
    cwd?: string;
  }) => Promise<TaskRun | null>;
  jalankanBuild: () => Promise<TaskRun | null>;
  hentikan: (runId: string) => Promise<boolean>;
  hentikanSemua: () => Promise<number>;
  bersihkanRiwayat: () => Promise<void>;
  setActiveRun: (id: string | null) => void;
  runsAktif: () => TaskRun[];

  _onOutput: (id: string, line: string, stderr: boolean) => void;
  _onProblem: (id: string, p: TaskProblem) => void;
  _onExit: (id: string, killed: boolean, lines: number) => void;
  _onPort: (id: string, port: number, https: boolean) => void;
  _onRound: (id: string, phase: string) => void;
  _upsertRun: (r: TaskRun) => void;
}

export const channelUntuk = (label: string) => `task:${label}`;

export const sumberUntuk = (label: string) => `task:${label}`;

let seq = 0;
const idBaru = (label: string) =>
  `run-${++seq}-${label.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 24)}`;

const bufferProblem = new Map<string, TaskProblem[]>();

const labelRun = new Map<string, string>();

const tulisProblems = (runId: string, label: string) => {
  const list = bufferProblem.get(runId) ?? [];
  const perFile = new Map<string, Diagnostic[]>();
  for (const p of list) {
    const d: Diagnostic = {
      file: p.file,
      line: p.line,
      column: p.column,
      severity: (p.severity as Diagnostic['severity']) ?? 'error',
      message: p.message,
      source: sumberUntuk(label),
      code: p.code || undefined,
    };
    const arr = perFile.get(p.file) ?? [];
    arr.push(d);
    perFile.set(p.file, arr);
  }
  const P = useProblems.getState();

  P.clearSource(sumberUntuk(label));
  for (const [file, arr] of perFile) {

    const lain = P.forFile(file).filter((d) => d.source !== sumberUntuk(label));
    P.setDiagnostics(file, [...lain, ...arr]);
  }
};

export const useTasks = create<TaskState & TaskActions>((set, get) => ({
  file: null,
  runs: [],
  recent: [],
  activeRun: null,
  loading: false,
  error: null,
  ready: {},

  muat: async (root) => {
    set({ loading: true, error: null });
    try {
      const f = await tasksLoad(root);
      set({ file: f, loading: false });

      if (f.errors.length > 0) {
        useNotif.getState().notify({
            severity: 'warn',
            message: 'tasks.json bermasalah',
            detail: f.errors.slice(0, 3).join('; '),
            source: 'Tasks',
          });
      }
      return f;
    } catch (e) {
      // Error dari invoke Tauri berbentuk { code, message }, bukan Error
      // biasa; asZephyrError(e).message mencetak "[object Object]" ke toast user.
      const msg = asZephyrError(e).message;
      set({ loading: false, error: msg, file: null });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Gagal membaca tasks.json',
        detail: msg,
        source: 'Tasks',
      });
      return null;
    }
  },

  daftar: () => get().file?.tasks ?? [],

  buildDefault: () => {
    const t = get().daftar();
    return (
      t.find((x) => x.group === 'build' && x.isDefault) ??
      t.find((x) => x.group === 'build') ??
      null
    );
  },

  cari: (label) => get().daftar().find((t) => t.label === label) ?? null,

  jalankan: async (label, opts) => {
    const def = get().cari(label);
    if (!def) {
      set({ error: `task "${label}" tidak ada` });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Task tidak ditemukan',
        detail: label,
        source: 'Tasks',
      });
      return null;
    }

    if (!opts?.lewatiDepends && def.dependsOn.length > 0) {
      if (def.dependsOrder === 'parallel') {
        const hasil = await Promise.all(
          def.dependsOn.map((d) => get().jalankan(d)),
        );
        if (hasil.some((r) => !r || r.status === 'failed')) {
          useNotif.getState().notify({
            severity: 'error',
            message: 'Rantai task gagal',
            detail: `dependsOn "${label}" ada yang gagal`,
            source: 'Tasks',
          });
          return null;
        }
      } else {
        for (const d of def.dependsOn) {
          const r = await get().jalankan(d);
          if (!r || r.status === 'failed') {
            useNotif.getState().notify({
              severity: 'error',
              message: 'Rantai task berhenti',
              detail: `"${d}" gagal, "${label}" dibatalkan`,
              source: 'Tasks',
            });
            return null;
          }
        }
      }
    }

    if (!def.command.trim()) {
      set((s) => ({
        recent: [label, ...s.recent.filter((x) => x !== label)].slice(0, MAX_RECENT),
      }));
      return {
        id: `composite-${label}`,
        label,
        status: 'done',
        exitCode: 0,
        pid: null,
        startedMs: Date.now(),
        endedMs: Date.now(),
        problems: [],
        lines: 0,
        active: true,
        cwd: '',
      };
    }

    const runId = idBaru(label);
    labelRun.set(runId, label);
    bufferProblem.set(runId, []);

    const ch = channelUntuk(label);
    const O = useOutput.getState();
    O.addChannel(ch, `Task: ${label}`);
    O.clear(ch);
    if (def.reveal === 'always') O.setActiveChannel(ch);

    set((s) => ({
      recent: [label, ...s.recent.filter((x) => x !== label)].slice(0, MAX_RECENT),
      activeRun: runId,
      error: null,
    }));

    try {
      await tasksRun({
        id: runId,
        label,
        kind: def.kind,
        command: def.command,
        args: def.args,
        cwd: def.cwd || undefined,
        env: Object.keys(def.env).length > 0 ? def.env : undefined,
        problemMatchers: def.problemMatchers,
        isBackground: def.isBackground,
        beginsPattern: def.background?.beginsPattern || undefined,
        endsPattern: def.background?.endsPattern || undefined,
      });
    } catch (e) {
      // Error dari invoke Tauri berbentuk { code, message }, bukan Error
      // biasa; asZephyrError(e).message mencetak "[object Object]" ke toast user.
      const msg = asZephyrError(e).message;
      useOutput.getState().append(ch, `[zephyr] gagal menjalankan: ${msg}`);
      useNotif.getState().notify({
        severity: 'error',
        message: `Task "${label}" gagal dijalankan`,
        detail: msg,
        source: 'Tasks',
      });
      set({ error: msg });
      return null;
    }

    if (def.isBackground) {
      const r: TaskRun = {
        id: runId,
        label,
        status: 'running',
        exitCode: null,
        pid: null,
        startedMs: Date.now(),
        endedMs: null,
        problems: [],
        lines: 0,
        active: false,
        cwd: def.cwd,
      };
      get()._upsertRun(r);
      return r;
    }

    try {
      const r = await tasksWait(runId, 180_000);
      get()._upsertRun(r);
      tulisProblems(runId, label);
      return r;
    } catch (e) {
      set({ error: asZephyrError(e).message });
      return null;
    }
  },

  jalankanAdHoc: async ({ label, command, args, cwd }) => {
    const runId = idBaru(label);

    labelRun.set(runId, label);
    bufferProblem.set(runId, []);
    const ch = channelUntuk(label);
    const O = useOutput.getState();
    O.addChannel(ch, `Task: ${label}`);
    O.clear(ch);

    set((s) => ({
      recent: [label, ...s.recent.filter((x) => x !== label)].slice(0, MAX_RECENT),
      activeRun: runId,
      error: null,
    }));

    try {
      await tasksRun({
        id: runId,
        label,
        kind: 'test',
        command,
        args,
        cwd: cwd || undefined,
        isBackground: false,
      });
    } catch (e) {
      // Error dari invoke Tauri berbentuk { code, message }, bukan Error
      // biasa; asZephyrError(e).message mencetak "[object Object]" ke toast user.
      const msg = asZephyrError(e).message;
      useOutput.getState().append(ch, `[zephyr] gagal menjalankan: ${msg}`);
      set({ error: msg });
      return null;
    }
    return null;
  },

  jalankanBuild: async () => {
    const def = get().buildDefault();
    if (!def) {
      useNotif.getState().notify({
        severity: 'warn',
        message: 'Tidak ada build task',
        detail: 'Tambahkan task dengan group "build" di tasks.json',
        source: 'Tasks',
      });
      return null;
    }
    return get().jalankan(def.label);
  },

  hentikan: async (runId) => {
    const ok = await tasksKill(runId);
    if (ok) {
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId ? { ...r, status: 'killed', endedMs: Date.now() } : r,
        ),
      }));
    }
    return ok;
  },

  hentikanSemua: async () => {
    const aktif = get().runsAktif();
    for (const r of aktif) await get().hentikan(r.id);
    return aktif.length;
  },

  bersihkanRiwayat: async () => {
    await tasksClearRuns();
    set((s) => ({ runs: s.runs.filter((r) => r.status === 'running') }));
  },

  setActiveRun: (id) => set({ activeRun: id }),

  runsAktif: () => get().runs.filter((r) => r.status === 'running'),

  _upsertRun: (r) =>
    set((s) => {
      const idx = s.runs.findIndex((x) => x.id === r.id);
      if (idx < 0) return { runs: [...s.runs, r] };
      const next = s.runs.slice();
      next[idx] = { ...next[idx], ...r };
      return { runs: next };
    }),

  _onOutput: (id, line, stderr) => {
    const label = labelRun.get(id);
    if (!label) return;
    const ch = channelUntuk(label);
    useOutput.getState().append(ch, stderr ? line : line);
    const st = useOutput.getState();

    const n = st.lines(ch).length;
    if (n > MAX_BARIS + 500) {
      const sisa = st.lines(ch).slice(-MAX_BARIS);
      st.clear(ch);
      for (const l of sisa) st.append(ch, l);
    }
  },

  _onProblem: (id, p) => {
    const arr = bufferProblem.get(id);
    if (arr) arr.push(p);
  },

  _onExit: (id, killed, lines) => {
    const label = labelRun.get(id);
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === id
          ? {
              ...r,
              lines,
              status: killed ? 'killed' : r.status === 'running' ? 'done' : r.status,
              endedMs: Date.now(),
            }
          : r,
      ),
    }));
    if (label) tulisProblems(id, label);
  },

  _onPort: (id, port, https) => {
    const label = labelRun.get(id) ?? 'task';

    usePorts.getState().add({
      hostPort: port,
      privatePort: port,
      protocol: https ? 'https' : 'http',
      process: label,
      source: 'task',
      forwarder: `Task: ${label}`,
      status: 'running',
    });
  },

  _onRound: (id, phase) => {
    const label = labelRun.get(id);
    if (phase === 'begin') {
      bufferProblem.set(id, []);
      set((s) => ({ ready: { ...s.ready, [id]: false } }));
    } else if (phase === 'end') {

      set((s) => ({ ready: { ...s.ready, [id]: true } }));
      if (label) tulisProblems(id, label);
    }
  },
}));

let taskListenerBound = false;

export const bindTaskListeners = () => {
  if (taskListenerBound) return;
  taskListenerBound = true;
  const T = () => useTasks.getState();

  void listen<{ id: string; line: string; stderr: boolean }>('task-output', (e) => {
    T()._onOutput(e.payload.id, e.payload.line, e.payload.stderr);
  });
  void listen<{ id: string; problem: TaskProblem }>('task-problem', (e) => {
    T()._onProblem(e.payload.id, e.payload.problem);
  });
  void listen<{ id: string; killed: boolean; lines: number }>('task-exit', (e) => {
    T()._onExit(e.payload.id, e.payload.killed, e.payload.lines);
  });
  void listen<{ id: string; port: number; https: boolean }>('task-port', (e) => {
    T()._onPort(e.payload.id, e.payload.port, e.payload.https);
  });
  void listen<{ id: string; phase: string }>('task-round', (e) => {
    T()._onRound(e.payload.id, e.payload.phase);
  });
  void listen<TaskRun>('task-status', (e) => {
    labelRun.set(e.payload.id, e.payload.label);
    T()._upsertRun(e.payload);
  });
};
