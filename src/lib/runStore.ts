import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  asZephyrError,
  runStart,
  runStop,
  runSelesai,
  runToolStatus,
  runInput,
  runInputEof,
  tasksMatchLine,
} from './commands';
import type { RunToolStatus } from './commands';
import { rencanaJalan, resepUntuk, BAHASA_RUN, SHELL_ALTERNATIF, bashWsl } from './runLanguages';
import type { RunRecipe } from './runLanguages';
import { useOutput } from './outputStore';
import { useNotif } from './notificationStore';
import { useProblems } from './problemsStore';
import type { Diagnostic } from './problemsStore';

/**
 * Run without debugging.
 *
 * WHY a store rather than a one-shot call in the command: a run outlives the
 * click that started it. The status bar has to keep showing "running" after the
 * menu closes, Stop has to find the same run id, and a second Run on the same
 * file has to replace the first instead of stacking panels. All three are state
 * decisions, so they live here.
 */

export type RunStatus = 'idle' | 'running' | 'ok' | 'build-failed' | 'run-failed' | 'killed';

export interface RunState {
  /** Which phase the current run is in, for the status bar. */
  phase: 'compile' | 'program' | null;
  status: RunStatus;
  runId: string | null;
  /**
   * Terminal pane that owns the current INTERACTIVE run, or null for a piped
   * run in the Output panel. Stop closes this pane (which kills the program
   * with it) instead of asking Rust for a run id it never had.
   */
  paneId: string | null;
  /**
   * Random end marker written into the pane after the program exits. The pane
   * keeps its shell alive, so this - not `pty-exit` - is what ends the run.
   */
  penanda: string | null;
  /** Absolute path of the file the current run belongs to. */
  path: string | null;
  recipe: RunRecipe | null;
  startedMs: number | null;
  endedMs: number | null;
  lines: number;
  exitCode: number | null;
  /** Last error message, shown in the toast and the status tooltip. */
  error: string | null;
  /** Toolchain check per tool name; filled lazily by `cekTool`. */
  tools: Record<string, RunToolStatus>;
}

/**
 * `source` for diagnostics produced by a Run.
 *
 * Every run shares one source on purpose: a second Run on the same file
 * REPLACES the errors of the first, exactly like pressing Build twice in an
 * IDE. Giving each run its own source would leave the previous line numbers
 * in the Problems panel against a file that has already changed.
 */
export const SUMBER_RUN = 'run';

interface RunActions {
  /** Run the given file (defaults to the active editor tab). */
  jalankan: (path?: string | null) => Promise<boolean>;
  hentikan: () => Promise<boolean>;
  /** Probe one or more tools and remember the result for the missing-tool UI. */
  cekTool: (tools: string[]) => Promise<Record<string, RunToolStatus>>;
  /** Send a line to the running program's stdin (only the program phase has a pipe). */
  kirimInput: (teks: string) => Promise<boolean>;
  /** Close stdin so `input()`/`read()` loops in the program see end of input. */
  akhiriInput: () => Promise<boolean>;
  reset: () => void;

  _onOutput: (a: { runId: string; phase: string; line: string; stderr: boolean }) => void;
  _onDone: (a: { runId: string; status: string; exitCode: number | null; lines: number }) => void;
}

/** Every run gets its own Output channel so two files do not interleave. */
export const kanalRun = (nama: string) =>
  `run:${nama.replace(/[^a-zA-Z0-9_.-]+/g, '-').slice(0, 40)}`;

let seq = 0;

const idBaru = () => `run-${Date.now().toString(36)}-${++seq}`;

/** Channel suffix for a run: the bare file name, so `Run: main.py` reads well. */
const namaBerkas = (path: string | null) =>
  path ? (path.replace(/\\/g, '/').split('/').pop() ?? path) : '';

const MAX_BARIS = 5_000;

/** Keep the channel bounded: a program printing in a loop must not eat memory. */
const potong = (ch: string) => {
  const O = useOutput.getState();
  const semua = O.lines(ch);
  if (semua.length <= MAX_BARIS + 500) return;
  const sisa = semua.slice(-MAX_BARIS);
  O.clear(ch);
  for (const l of sisa) O.append(ch, l);
};

/**
 * Diagnostics collected from the compile phase of the current run.
 *
 * Compiler output arrives line by line, but the Problems panel wants the whole
 * list at once: writing after every line would `clearSource` + `setDiagnostics`
 * on each one, so the panel would flash and its scroll position would jump.
 * Collected here, written once when the run ends.
 */
let bufferDiag: Diagnostic[] = [];

/** Workspace root captured by `jalankan`; matcher paths resolve against it. */
let akarDiag: string | null = null;

/** Forget the previous build: a new Run must not inherit last run's errors. */
const mulaiDiag = () => {
  bufferDiag = [];
  useProblems.getState().clearSource(SUMBER_RUN);
};

const tulisDiag = () => {
  const P = useProblems.getState();
  P.clearSource(SUMBER_RUN);
  if (bufferDiag.length === 0) return;
  const perFile = new Map<string, Diagnostic[]>();
  for (const d of bufferDiag) {
    const arr = perFile.get(d.file) ?? [];
    arr.push(d);
    perFile.set(d.file, arr);
  }
  for (const [file, arr] of perFile) {
    const lain = P.forFile(file).filter((d) => d.source !== SUMBER_RUN);
    P.setDiagnostics(file, [...lain, ...arr]);
  }
};

/**
 * Feed one compiler line to the Rust matcher and keep what it recognises.
 *
 * The matcher list lives in Rust (`tasks.rs`), the same one `tasks.json` uses,
 * so `$gcc`, `$javac`, `$rustc`, `$go` and `$csc` are parsed identically here
 * and there. Calls are chained so a slow line cannot land after a later one.
 */
let antreDiag: Promise<void> = Promise.resolve();

const matcherBaris = (matcher: string, line: string) => {
  antreDiag = antreDiag.then(async () => {
    try {
      const p = await tasksMatchLine(matcher, line, akarDiag ?? undefined);
      if (!p) return;
      bufferDiag.push({
        file: p.file,
        line: p.line,
        column: p.column,
        severity: (p.severity as Diagnostic['severity']) ?? 'error',
        message: p.message,
        source: SUMBER_RUN,
        code: p.code || undefined,
      });
    } catch {
      // A matcher that does not know this line is not a failure: most compiler
      // output (banners, "1 error generated") is not a diagnostic at all.
    }
  });
};

export const useRun = create<RunState & RunActions>((set, get) => ({
  phase: null,
  status: 'idle',
  runId: null,
  paneId: null,
  penanda: null,
  path: null,
  recipe: null,
  startedMs: null,
  endedMs: null,
  lines: 0,
  exitCode: null,
  error: null,
  tools: {},

  jalankan: async (path) => {
    const berjalan = get().status === 'running';
    if (berjalan) {
      // Same button semantics as VS Code's Run: pressing it again while a run
      // is going stops that run rather than silently starting a second one.
      await get().hentikan();
      return false;
    }

    /* Imported lazily: `store.ts` imports this module, so a static import
       would close a cycle (the same reason `konteksTugas` does it). */
    const { useStore } = await import('./store');
    const s = useStore.getState();
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const berkas = path ?? tab?.path ?? null;

    if (!berkas) {
      useNotif.getState().notify({
        severity: 'warn',
        message: 'Tidak ada file untuk dijalankan',
        detail: 'Buka satu file dulu (Ctrl+O), lalu tekan Run.',
        source: 'Run',
      });
      return false;
    }

    const rencana = rencanaJalan(berkas, s.workspace);
    if (!rencana) {
      const lang = resepUntuk(berkas);
      useNotif.getState().notify({
        severity: 'warn',
        message: 'File ini tidak bisa dijalankan',
        detail: lang
          ? `${lang.label} belum punya cara jalan di Zephyr.`
          : 'Tidak ada runner untuk tipe file ini (data/markup, bukan program).',
        source: 'Run',
      });
      set({ error: 'no runner for this file', status: 'idle' });
      return false;
    }

    const nama = namaBerkas(berkas);
    const ch = kanalRun(nama);
    const O = useOutput.getState();
    O.addChannel(ch, `Run: ${nama}`);
    O.clear(ch);

    /*
     * INTERACTIVE TERMINAL PATH.
     *
     * The reader's complaint was exact: a C++ program run from here shows its
     * output but cannot be typed into - the Output panel's input box is not a
     * console, and `cin`/`input()`/`scanf` prompts expect one. VS Code answers
     * this by running every language in the integrated terminal, and so does
     * this path: the compile+run command is typed into a real shell pane, whose
     * console the program inherits. Typing then works exactly as if the reader
     * had run it by hand.
     *
     * The Output panel keeps the non-interactive path below (and the same
     * channel is used for failures), so nothing that worked before is lost.
     */
    const { perintahTerminal } = await import('./runLanguages');
    const { useTerminal } = await import('./terminalStore');
    const { usePanel: panelStore } = await import('./panelStore');
    /* Unique per run, so program output can never fake the end marker. */
    const penanda = `__ZEPHYR_RUN_${Math.random().toString(36).slice(2, 10)}__`;
    const perintah = perintahTerminal(rencana, penanda);
    if (perintah) {
      const T = useTerminal.getState();
      const paneId = await T.addPane('shell', { cwd: rencana.cwd });
      if (paneId) {
        O.append(ch, `[zephyr] ${perintah}`);
        panelStore.getState().focusTab('terminal');
        T.setVisible(true);
        const tabId = T.activeTabId;
        if (tabId) T.setActivePane(tabId, paneId);
        set({
          runId: null,
          paneId,
          path: berkas,
          recipe: rencana.recipe,
          status: 'running',
          phase: rencana.compile ? 'compile' : 'program',
          startedMs: Date.now(),
          endedMs: null,
          lines: 0,
          exitCode: null,
          error: null,
        });
        const { ptyWrite } = await import('./commands');
        const { readBuffer } = await import('./xtermRegistry');
        const { onPtyExit } = await import('./events');

        /*
         * Two end signals, both needed:
         *
         *   * the marker line, printed after the program exits - the normal
         *     case, since the pane's shell stays alive and never emits
         *     `pty-exit` per command;
         *   * `pty-exit`, for the reader closing the pane mid-run (or the shell
         *     dying), which the marker can never report.
         */
        set({ penanda });
        const selesai = (kode: number | null) => {
          const s2 = get();
          if (s2.paneId !== paneId || s2.status !== 'running') return;
          set({
            status: kode === 0 || kode === null ? 'ok' : 'run-failed',
            phase: null,
            paneId: null,
            penanda: null,
            exitCode: kode,
            endedMs: Date.now(),
          });
        };
        void onPtyExit((id, code) => {
          if (id === paneId) selesai(code ?? null);
        }).catch(() => {});
        void (async () => {
          for (let i = 0; i < 7200; i += 1) {
            await new Promise((r) => setTimeout(r, 500));
            const st2 = get();
            if (st2.status !== 'running' || st2.penanda !== penanda) return;
            const teks = readBuffer(paneId, 60) || '';
            if (teks.includes(penanda)) {
              selesai(0);
              return;
            }
          }
        })();
        await ptyWrite(paneId, perintah + '\r');
        return true;
      }
      /* No pane could be created: fall through to the piped run. */
      O.append(ch, '[zephyr] terminal tidak bisa dibuka; menjalankan tanpa terminal interaktif.');
    }

    const runId = idBaru();
    // Errors of the previous build belong to the previous source; drop them
    // before the new compiler output starts arriving.
    mulaiDiag();
    /* Kept for the matcher: known only here, and the store has no workspace. */
    akarDiag = s.workspace;
    set({
      runId,
      path: berkas,
      recipe: rencana.recipe,
      status: 'running',
      phase: rencana.compile ? 'compile' : 'program',
      startedMs: Date.now(),
      endedMs: null,
      lines: 0,
      exitCode: null,
      error: null,
    });

    // Reveal the panel only after state is set, so the first streamed line has
    // a channel to land in.
    O.setActiveChannel(ch);

    /*
     * A `.sh` run has one trap the recipe table cannot see: on Windows the
     * `bash` on `PATH` is usually the WSL launcher in `System32`, which cannot
     * open a `D:\...` path and reports the file as missing. Probe first and
     * swap in Git's MSYS bash, which takes the same path verbatim.
     */
    let run = rencana.run;
    if (rencana.recipe.lang === 'shell') {
      const probe = await get().cekTool(['bash']);
      const b = probe['bash'];
      if (!b?.found || bashWsl(b.path)) {
        for (const alt of SHELL_ALTERNATIF) {
          const cek = await get().cekTool([alt.tool]);
          if (cek[alt.tool]?.found) {
            run = { tool: alt.tool, args: alt.arg(rencana.cwd + '/' + nama) };
            break;
          }
        }
        if (run === rencana.run) {
          O.append(ch, '[zephyr] bash here is the WSL launcher and no Git bash was found; install Git for Windows to run .sh files.');
        }
      }
    }

    try {
      await runStart({
        runId,
        cwd: rencana.cwd,
        compileCmd: rencana.compile?.tool,
        compileArgs: rencana.compile?.args,
        compileOut: rencana.compile?.out,
        runCmd: run.tool,
        runArgs: run.args,
      });
      return true;
    } catch (e) {
      // An invoke error is `{ code, message }`, not an `Error`; printing it raw
      // shows "[object Object]" in the panel.
      const err = asZephyrError(e);
      O.append(ch, `[zephyr] ${err.message}`);
      set({ status: 'idle', phase: null, error: err.message, endedMs: Date.now() });
      useNotif.getState().notify({
        severity: 'error',
        message: `Gagal menjalankan ${nama}`,
        detail: err.message,
        source: 'Run',
      });
      // The tool may simply not be installed - probe it so the panel can say
      // which one instead of leaving the reader with "not on PATH".
      if (rencana.recipe.needs) void get().cekTool([rencana.recipe.needs]);
      return false;
    }
  },

  hentikan: async () => {
    /*
     * Interactive runs own a terminal pane, not a Rust run id: the program is
     * a child of the pane's shell, so closing the pane is what stops it.
     * (Killing the shell alone would orphan a program that ignores SIGHUP.)
     */
    const { paneId } = get();
    if (paneId && get().status === 'running') {
      try {
        const { useTerminal } = await import('./terminalStore');
        await useTerminal.getState().closePane(paneId);
      } catch {
        /* pane already gone */
      }
      set({ status: 'killed', phase: null, paneId: null, endedMs: Date.now() });
      return true;
    }

    const id = get().runId;
    if (!id || get().status !== 'running') return false;
    try {
      return await runStop(id);
    } catch (e) {
      set({ error: asZephyrError(e).message });
      return false;
    }
  },

  cekTool: async (tools) => {
    try {
      const hasil = await runToolStatus(tools);
      const peta: Record<string, RunToolStatus> = { ...get().tools };
      for (const h of hasil) peta[h.tool] = h;
      set({ tools: peta });
      return peta;
    } catch {
      // A probe failure is not a run failure: the run already reported its own
      // error, and the UI falls back to "tool not found" without a version.
      return get().tools;
    }
  },

  kirimInput: async (teks) => {
    const st = get();
    const id = st.runId;
    // Only the program phase has a stdin pipe; a byte written during compile
    // would go nowhere and the box would look broken.
    if (!id || st.status !== 'running' || st.phase !== 'program') return false;
    try {
      const ok = await runInput(id, teks);
      if (!ok) {
        useOutput
          .getState()
          .append(kanalRun(namaBerkas(st.path)), '[zephyr] input rejected: the program is not reading stdin');
      }
      return ok;
    } catch {
      return false;
    }
  },

  akhiriInput: async () => {
    const st = get();
    const id = st.runId;
    if (!id || st.status !== 'running') return false;
    try {
      const ok = await runInputEof(id);
      if (ok) {
        useOutput
          .getState()
          .append(kanalRun(namaBerkas(st.path)), '[zephyr] end of input sent');
      }
      return ok;
    } catch {
      return false;
    }
  },

  reset: () => {
    const id = get().runId;
    if (id) void runSelesai(id).catch(() => {});
    /*
     * A terminal run's pane outlives the store reset: without closing it here,
     * `reset()` followed by another Run leaves the first program running in a
     * pane nothing points at any more (and `addPane` then hits the pane cap).
     */
    const paneLama = get().paneId;
    if (paneLama) {
      void import('./terminalStore')
        .then((m) => m.useTerminal.getState().closePane(paneLama))
        .catch(() => {});
    }
    mulaiDiag();
    set({
      phase: null,
      status: 'idle',
      runId: null,
      paneId: null,
      penanda: null,
      path: null,
      recipe: null,
      startedMs: null,
      endedMs: null,
      lines: 0,
      exitCode: null,
      error: null,
    });
  },

  _onOutput: ({ runId, phase, line, stderr }) => {
    const st = get();
    if (runId !== st.runId) return;
    const nama = namaBerkas(st.path);
    const ch = kanalRun(nama);
    useOutput.getState().append(ch, line);
    potong(ch);
    set({
      phase: phase === 'compile' ? 'compile' : 'program',
      lines: st.lines + 1,
      // A stderr line from the compile phase is a diagnostic; remember it so
      // the summary after the run can point at the first real problem.
      error: phase === 'compile' && stderr && !st.error ? line : st.error,
    });

    /*
     * Compiler diagnostics also go to the Problems panel, not just the
     * scrolling output.
     *
     * `RESEP` has carried a `matcher` per language from the start and nothing
     * read it, so `g++`/`javac`/`rustc` errors only existed as text and
     * clicking them was impossible. Parsing happens in Rust through
     * `tasks_match_line`, the same matcher engine `tasks.json` uses, because a
     * second regex table in TypeScript would drift from the first.
     *
     * Only the compile phase: the program's own stderr is not a diagnostic,
     * and running a matcher over arbitrary output turns a stack trace into a
     * fake "error" pointing at a random line.
     */
    const matcher = st.recipe?.matcher;
    if (phase === 'compile' && matcher) {
      matcherBaris(matcher, line);
    }
  },

  _onDone: ({ runId, status, exitCode, lines }) => {
    const st = get();
    if (runId !== st.runId) return;
    const selesai = status as RunStatus;
    set({
      status: selesai,
      phase: null,
      exitCode,
      lines,
      endedMs: Date.now(),
      // A clean run clears the diagnostic note; a failed one keeps it.
      error: selesai === 'ok' ? null : st.error,
    });
    void runSelesai(runId).catch(() => {});

    /*
     * Wait for the matcher queue before publishing: the last compiler line can
     * still be in flight, and publishing first would show a Problems list that
     * is missing its final error.
     */
    void antreDiag.then(() => {
      if (get().runId === runId) tulisDiag();
    });

    const nama = namaBerkas(st.path);
    const ch = kanalRun(nama);
    const O = useOutput.getState();
    if (selesai === 'build-failed') {
      O.append(ch, '[zephyr] build failed - program not started');
      useNotif.getState().notify({
        severity: 'error',
        message: `${nama}: build gagal`,
        detail: st.error ?? 'Lihat panel Output untuk pesan kompilator.',
        source: 'Run',
      });
    } else if (selesai === 'run-failed') {
      O.append(ch, `[zephyr] program exited with code ${exitCode ?? '?'}`);
    } else if (selesai === 'killed') {
      O.append(ch, '[zephyr] stopped');
    } else {
      O.append(ch, `[zephyr] done in ${((Date.now() - (st.startedMs ?? Date.now())) / 1000).toFixed(1)}s`);
    }
  },
}));

let runListenerBound = false;

/**
 * Bind the run events exactly once per process.
 *
 * Same guard as `pty-output` and `ai-chunk`: StrictMode in dev mounts effects
 * twice, and two listeners mean every output line is appended twice.
 */
export const bindRunListeners = () => {
  if (runListenerBound) return;
  runListenerBound = true;
  const R = () => useRun.getState();

  void listen<{ runId: string; phase: string; line: string; stderr: boolean }>(
    'run-output',
    (e) => R()._onOutput(e.payload),
  );
  void listen<{ runId: string; status: string; exitCode: number | null; lines: number }>(
    'run-done',
    (e) => R()._onDone(e.payload),
  );
};

/** Languages with a Run recipe, for menus that list what can be executed. */
export const bahasaBisaRun = BAHASA_RUN;
