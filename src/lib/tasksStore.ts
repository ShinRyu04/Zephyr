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
import { useStore } from './store';
import { useOutput } from './outputStore';
import { useProblems, type Diagnostic } from './problemsStore';
import { usePorts } from './portsStore';
import { useNotif } from './notificationStore';

const MAX_BARIS = 5_000;

const MAX_RECENT = 8;

/**
 * Replace `$ZEPHYR_*` tokens in one string.
 *
 * Substitution happens on the VALUE, not by building a shell command, and an
 * unknown token is left AS WRITTEN rather than blanked. Blanking it would turn
 * a typo (`$ZEPHYR_SYMBOL`) into a command that runs with an empty argument —
 * silently wrong output is worse than an obviously broken command.
 */
export function isiKonteks(teks: string, nilai: Record<string, string>): string {
  return teks.replace(/\$\{?(ZEPHYR_[A-Z_]+)\}?/g, (utuh, nama: string) =>
    Object.prototype.hasOwnProperty.call(nilai, nama) ? nilai[nama] : utuh,
  );
}

/**
 * Build the substitution table for a run, from what is on screen right now.
 *
 * Every field is optional and a missing one is simply ABSENT from the table,
 * which is what makes `isiKonteks` leave its token in place: a task that needs
 * `$ZEPHYR_SYMBOL` and runs with no symbol under the cursor should fail
 * visibly, not run against an empty string.
 */
async function konteksTugas(): Promise<Record<string, string>> {
  const nilai: Record<string, string> = {};
  /* Both imported here rather than at the top of the file: `store.ts` imports
     this module, so a static import would close a cycle. */
  const [{ useStore }, { getActiveView, activeSelection }] = await Promise.all([
    import('./store'),
    import('./editorRegistry'),
  ]);

  const s = useStore.getState();
  const akar = s.workspace;
  if (akar) nilai.ZEPHYR_WORKTREE_ROOT = akar;

  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (tab?.path) {
    nilai.ZEPHYR_FILE = tab.path;
    /*
     * The relative form is what most commands actually want: `cargo test`
     * takes a module path, and a compiler invoked with an absolute path
     * outside the source root can produce output paths the problem matchers
     * do not recognise.
     *
     * Computed by string prefix rather than by a path library because the
     * comparison has to ignore separator style and case (Windows), which
     * `kunciPath` already does for the rest of the app.
     */
    const kunciAkar = akar ? akar.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() : '';
    const kunciBerkas = tab.path.replace(/\\/g, '/');
    if (kunciAkar && kunciBerkas.toLowerCase().startsWith(`${kunciAkar}/`)) {
      nilai.ZEPHYR_FILE_REL = kunciBerkas.slice(kunciAkar.length + 1);
    } else {
      nilai.ZEPHYR_FILE_REL = tab.path;
    }
    nilai.ZEPHYR_FILE_NAME = tab.name;
    nilai.ZEPHYR_FILE_EXT = tab.name.includes('.') ? tab.name.split('.').pop() ?? '' : '';
  }

  const view = getActiveView();
  if (view) {
    /* 1-based: a task command talks in the same numbers the status bar shows
       and the compiler prints, not in the 0-based offsets CodeMirror uses. */
    nilai.ZEPHYR_ROW = String(view.state.doc.lineAt(view.state.selection.main.head).number);
    nilai.ZEPHYR_COLUMN = String(
      view.state.selection.main.head - view.state.doc.lineAt(view.state.selection.main.head).from + 1,
    );
  }

  const sel = activeSelection();
  if (sel) {
    /*
     * Passed as a single token, quoted for the shell it is going into.
     *
     * Unquoted, a selection containing a space becomes two arguments and a
     * selection containing a quote can end the command early — the task would
     * run something the reader never wrote. The quoting is conservative: wrap
     * in backslash-escaped quotes so it survives both sh and PowerShell.
     */
    nilai.ZEPHYR_SELECTED_TEXT = sel.replace(/(["`$\\])/g, '\\$1');
  }

  return nilai;
}

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

/**
 * Kutip satu argumen untuk shell tujuan.
 *
 * PENGGABUNGAN `args.join(' ')` polos SALAH, dan kesalahannya senyap: argumen
 * `-e console.log('x')` sampai ke PowerShell sebagai tiga potongan yang
 * diurai ulang, dan yang berjalan bukan perintah yang ditulis di tasks.json.
 * Karena task dijalankan lewat shell (bukan execve dengan argv), setiap
 * argumen harus dikutip dengan aturan shell itu sendiri.
 */
function kutipArgumen(arg: string, jenis: 'ps' | 'cmd' | 'posix'): string {
  if (arg === '') return jenis === 'cmd' ? '""' : "''";
  if (!/[\s"'`$&|<>^(){};]/.test(arg)) return arg;
  if (jenis === 'cmd') return `"${arg.replace(/"/g, '""')}"`;
  if (jenis === 'posix') return `'${arg.replace(/'/g, `'\\''`)}'`;
  /* PowerShell: kutip tunggal itu literal, dan kutip tunggal di dalamnya
     ditulis dua kali — cara yang sama dipakai prompt dan here-string. */
  return `'${arg.replace(/'/g, "''")}'`;
}

function jenisShell(): 'ps' | 'cmd' | 'posix' {
  const g = useStore.getState().settings?.general;
  const pil = (g?.shellPath || g?.defaultTerminal || '').toLowerCase();
  if (/cmd\.exe$|^cmd$/.test(pil)) return 'cmd';
  if (/bash|wsl|sh$/.test(pil)) return 'posix';
  return 'ps';
}

/**
 * Jalankan satu task di terminal (presentation.panel = terminal/new/dedicated).
 *
 * Kembalianya `TaskRun` berstatus `running`: Zephyr TIDAK tahu kapan perintah
 * di terminal selesai (itu milik shell-nya, bukan proses yang diawasi Rust),
 * dan mengarang `done` begitu perintah dikirim akan membuat daftar task
 * berbohong soal build yang masih berjalan.
 */
async function jalankanDiTerminalTugas(
  def: TaskDef,
  runId: string,
  label: string,
): Promise<TaskRun | null> {
  const nilai = await konteksTugas();
  const ganti = (x: string) => isiKonteks(x, nilai);
  const jenis = jenisShell();
  const bagian = [
    kutipArgumen(ganti(def.command), jenis),
    ...def.args.map(ganti).map((a) => kutipArgumen(a, jenis)),
  ].filter((x) => x !== '');
  const perintah = bagian.join(' ');
  const cwd = def.cwd ? ganti(def.cwd) : undefined;

  const { useTerminal } = await import('./terminalStore');
  const T = useTerminal.getState();
  const paneId = await T.addPane('shell', cwd ? { cwd } : undefined);
  if (!paneId) {
    useNotif.getState().notify({
      severity: 'error',
      message: `Task "${label}" could not open a terminal`,
      detail: useTerminal.getState().terminalError ?? '',
      source: 'Tasks',
    });
    return null;
  }

  const { writeChunked } = await import('./terminalClipboard');
  await writeChunked(paneId, `${perintah}\r`);

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
    active: true,
    cwd: cwd ?? '',
  };
  useTasks.getState()._upsertRun(r);
  return r;
}

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
      // An error from a Tauri invoke is shaped { code, message }, not Error
      // usual; asZephyrError(e).message prints "[object Object]" to the user's toast.
      const msg = asZephyrError(e).message;
      set({ loading: false, error: msg, file: null });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Failed to read tasks.json',
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
      set({ error: `task "${label}" does not exist` });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Task not found',
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
            message: 'The task chain failed',
            detail: `dependsOn "${label}" some failed`,
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
              detail: `"${d}" failed, "${label}" cancelled`,
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

    /*
     * `presentation.panel` = "terminal" (atau "new"/"dedicated") menjalankan
     * perintah di terminal, bukan di kanal Output.
     *
     * Itu beda yang penting untuk task yang menunggu input: server dev yang
     * mencetak URL, `npm init`, atau tes yang meminta konfirmasi tidak bisa
     * dijawab dari Output, dan output-nya hanya bisa dibaca setelah selesai.
     * Di terminal, task berjalan seperti kalau dibuka sendiri, lengkap dengan
     * warna, stdin dan prompt.
     *
     * Nilainya sudah di-parse Rust (`panel` di TaskDef) sejak awal, hanya saja
     * tidak pernah dibaca. Nilai lain — termasuk "output" — tetap lewat jalur
     * Output yang lama.
     */
    if (def.panel === 'terminal' || def.panel === 'new' || def.panel === 'dedicated') {
      return await jalankanDiTerminalTugas(def, runId, label);
    }

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
      /*
       * Context variables are resolved ONCE per run, then substituted into the
       * command, its arguments and its cwd.
       *
       * Resolved here rather than inside `tasksRun` because the values describe
       * what is on screen at the moment the reader pressed the key — resolving
       * them later (or per argument) would let the file, row or selection
       * change halfway through and produce a command matching neither.
       */
      const nilai = await konteksTugas();
      const ganti = (x: string) => isiKonteks(x, nilai);

      await tasksRun({
        id: runId,
        label,
        kind: def.kind,
        command: ganti(def.command),
        args: def.args.map(ganti),
        cwd: def.cwd ? ganti(def.cwd) : undefined,
        env: Object.keys(def.env).length > 0 ? def.env : undefined,
        problemMatchers: def.problemMatchers,
        isBackground: def.isBackground,
        beginsPattern: def.background?.beginsPattern || undefined,
        endsPattern: def.background?.endsPattern || undefined,
      });
    } catch (e) {
      // An error from a Tauri invoke is shaped { code, message }, not Error
      // usual; asZephyrError(e).message prints "[object Object]" to the user's toast.
      const msg = asZephyrError(e).message;
      useOutput.getState().append(ch, `[zephyr] failed to run: ${msg}`);
      useNotif.getState().notify({
        severity: 'error',
        message: `Task "${label}" failed to run`,
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
      /* Same substitution as a named task: an ad-hoc command is usually the one
         a reader types when they want "run what I am looking at", so it needs
         the context variables at least as much. */
      const nilai = await konteksTugas();
      const ganti = (x: string) => isiKonteks(x, nilai);
      await tasksRun({
        id: runId,
        label,
        kind: 'test',
        command: ganti(command),
        args: args.map(ganti),
        cwd: cwd ? ganti(cwd) : undefined,
        isBackground: false,
      });
    } catch (e) {
      // An error from a Tauri invoke is shaped { code, message }, not Error
      // usual; asZephyrError(e).message prints "[object Object]" to the user's toast.
      const msg = asZephyrError(e).message;
      useOutput.getState().append(ch, `[zephyr] failed to run: ${msg}`);
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
        message: 'No build task',
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
