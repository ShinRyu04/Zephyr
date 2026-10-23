import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  dapLoad,
  dapAdapters,
  dapStart,
  dapStop,
  dapKontrol,
  dapThreads,
  dapStack,
  dapScopes,
  dapVariables,
  dapEvaluate,
  dapSetVariable,
  dapSetBreakpoints,
  dapSetBreakpointsEx,
  dapLoadedSources,
  scanDir,
  fsExists,
  fsCreateDir,
  fsWrite,
  asZephyrError,
} from './commands';
import type { AdapterSpec, DebugConfig, LaunchFile } from './types';
import { useStore } from './store';
import { useOutput } from './outputStore';
import { usePanel } from './panelStore';
import { useProblems } from './problemsStore';
import { useKb } from './keybindingStore';
import { notifyError, notifyInfo, notifyWarn } from './notificationStore';
import { kunciPath } from './pathKey';
import { tf, tx } from './i18n';
import { deteksiDebug } from './debugDetect';

export interface Breakpoint {
  path: string;
  line: number;
  enabled: boolean;
  
  verified: boolean;
  
  message?: string;
  /** Ekspresi DAP: berhenti hanya bila bernilai benar. */
  condition?: string;
  /** Angka DAP: berhenti pada hit ke-n. */
  hitCondition?: string;
  /** Logpoint: cetak pesan ini alih-alih berhenti. */
  logMessage?: string;
}

export interface StackFrame {
  id: number;
  name: string;
  path: string;
  line: number;
  column: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  
  anak?: Variable[];
  terbuka?: boolean;
}

export interface WatchItem {
  expr: string;
  value: string;
  error: boolean;
}

export interface ReplLine {
  kind: 'input' | 'output' | 'error';
  text: string;
}

export type DebugState = 'inactive' | 'starting' | 'running' | 'stopped';

interface DebugStoreState {
  launch: LaunchFile | null;
  adapters: AdapterSpec[];
  
  configTerpilih: string;
  state: DebugState;
  
  alasanStop: string;
  error: string | null;

  breakpoints: Breakpoint[];
  /** Breakpoint yang opsinya sedang diedit; `null` = dialog tertutup. */
  editBp: { path: string; line: number } | null;
  threadId: number | null;
  threads: { id: number; name: string }[];
  frames: StackFrame[];
  frameTerpilih: number | null;
  scopes: Scope[];
  variables: Record<number, Variable[]>;
  watch: WatchItem[];
  repl: ReplLine[];
  loadedSources: { name: string; path: string }[];
  
  barisAktif: { path: string; line: number } | null;
  
  caps: Record<string, unknown>;
}

interface DebugActions {
  muatLaunch: () => Promise<void>;
  muatAdapters: () => Promise<void>;
  /**
   * Write a starter .zephyr/launch.json for the open workspace.
   *
   * WHY this exists: without a launch.json, pressing Run does nothing but show
   * "create launch.json first", and there was no way to create it from inside
   * the editor. The user had to know the file name, the folder, and the schema
   * by heart. This detects the project type and writes a config that works.
   */
  buatLaunch: () => Promise<boolean>;
  pilihConfig: (nama: string) => void;

  toggleBreakpoint: (path: string, line: number) => Promise<void>;
  hapusBreakpoint: (path: string, line: number) => Promise<void>;
  bukaEditBreakpoint: (path: string, line: number) => void;
  tutupEditBreakpoint: () => void;
  simpanBreakpointOpsi: (
    path: string,
    line: number,
    opsi: { condition?: string; hitCondition?: string; logMessage?: string },
  ) => Promise<void>;
  hapusSemuaBreakpoint: () => Promise<void>;
  breakpointsUntuk: (path: string) => Breakpoint[];

  start: (nama?: string) => Promise<boolean>;
  /** Jalankan konfigurasi terpilih TANPA debugger, di terminal. */
  runTanpaDebug: (nama?: string) => Promise<boolean>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  kontrol: (aksi: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause') => Promise<void>;

  pilihFrame: (frameId: number) => Promise<void>;
  expandVariable: (ref: number) => Promise<void>;
  setVariable: (ref: number, nama: string, nilai: string) => Promise<boolean>;

  tambahWatch: (expr: string) => Promise<void>;
  hapusWatch: (expr: string) => void;
  refreshWatch: () => Promise<void>;

  evalRepl: (expr: string) => Promise<string>;
  bersihkanRepl: () => void;

  _onEvent: (msg: DapPesan) => void;
}

interface DapPesan {
  type: string;
  event?: string;
  command?: string;
  body?: Record<string, unknown>;
}

const log = (teks: string) => useOutput.getState().append('debug', teks);

export const useDebug = create<DebugStoreState & DebugActions>((set, get) => ({
  launch: null,
  adapters: [],
  configTerpilih: '',
  state: 'inactive',
  alasanStop: '',
  error: null,

  breakpoints: [],
  editBp: null,
  threadId: null,
  threads: [],
  frames: [],
  frameTerpilih: null,
  scopes: [],
  variables: {},
  watch: [],
  repl: [],
  loadedSources: [],
  barisAktif: null,
  caps: {},

  muatLaunch: async () => {
    try {
      const f = await dapLoad();
      set((s) => ({
        launch: f,
        
        configTerpilih:
          f.configurations.some((c) => c.name === s.configTerpilih) && s.configTerpilih
            ? s.configTerpilih
            : (f.configurations[0]?.name ?? ''),
      }));
      if (f.invalid.length > 0) {
        notifyWarn(`${f.invalid.length} launch.json configuration(s) skipped`, {
          source: 'debug',
          detail: f.invalid.map((i) => `#${i.index} ${i.name}: ${i.reason}`).join('\n'),
        });
      }
    } catch (e) {
      set({ launch: null });
      log(`launch.json: ${pesan(e)}`);
    }
  },

  muatAdapters: async () => {
    try {
      set({ adapters: await dapAdapters() });
    } catch {
      set({ adapters: [] });
    }
  },

  /**
   * Write a starter .zephyr/launch.json for the open workspace.
   *
   * WHY detection instead of one fixed template: a launch.json that points at
   * a file the project does not have fails the moment the user presses Run,
   * which is the same dead end as having no file at all. The config is chosen
   * from what is actually in the workspace.
   */
  buatLaunch: async () => {
    const ws = useStore.getState().workspace;
    if (!ws) {
      notifyError(tx('Open a folder first to debug.'), {
        source: 'debug',
      });
      return false;
    }

    let nama: string[] = [];
    try {
      nama = (await scanDir(ws)).map((n) => n.name);
    } catch {
      /* an unreadable folder falls through to the generic config below */
    }
    const ada = (f: string) => nama.some((n) => n.toLowerCase() === f.toLowerCase());

    const konfigurasi: Record<string, unknown>[] = [];

    if (ada('package.json')) {
      konfigurasi.push({
        type: 'node',
        request: 'launch',
        name: 'Node: Debug Program',
        program: '${workspaceFolder}/index.js',
        skipFiles: ['<node_internals>/**'],
      });
      konfigurasi.push({
        type: 'node',
        request: 'launch',
        name: 'Node: npm start',
        runtimeExecutable: 'npm',
        runtimeArgs: ['start'],
        console: 'integratedTerminal',
        skipFiles: ['<node_internals>/**'],
      });
      konfigurasi.push({
        type: 'node',
        request: 'attach',
        name: 'Node: Attach to Process',
        port: 9229,
      });
    }

    if (ada('manage.py')) {
      konfigurasi.push({
        type: 'debugpy',
        request: 'launch',
        name: 'Python: Django',
        program: '${workspaceFolder}/manage.py',
        args: ['runserver'],
        django: true,
      });
    }

    if (ada('pyproject.toml') || ada('requirements.txt') || ada('setup.py')) {
      konfigurasi.push({
        type: 'debugpy',
        request: 'launch',
        name: 'Python: Current File',
        program: '${file}',
        console: 'integratedTerminal',
      });
    }

    /*
     * ATTACH configs exist for every adapter that can join a process which is
     * already running, not just Node.
     *
     * The reason is practical: the interesting failures in Python, Go, Java and
     * Rust usually happen inside a server the reader started themselves (a
     * Django dev server, `dlv --headless`, a JVM under `-agentlib`), and those
     * processes cannot be launched by a `request: "launch"` config without
     * changing how the program is started. Node had an Attach entry from the
     * start; the others simply had no way in.
     *
     * `processId: 0` means "ask me which process" in the VS Code adapters, so
     * the entry is useful before the reader knows the PID.
     */
    if (ada('pyproject.toml') || ada('requirements.txt') || ada('setup.py')) {
      konfigurasi.push({
        type: 'debugpy',
        request: 'attach',
        name: 'Python: Attach to Process',
        processId: 0,
      });
      konfigurasi.push({
        type: 'debugpy',
        request: 'attach',
        name: 'Python: Attach by Port (5678)',
        connect: { host: '127.0.0.1', port: 5678 },
      });
    }

    if (ada('cargo.toml')) {
      konfigurasi.push({
        type: 'rust',
        request: 'attach',
        name: 'Rust: Attach to Process',
        processId: 0,
      });
    }

    if (ada('go.mod')) {
      konfigurasi.push({
        type: 'go',
        request: 'attach',
        name: 'Go: Attach to Process',
        mode: 'local',
        processId: 0,
      });
    }

    if (ada('pom.xml') || ada('build.gradle')) {
      konfigurasi.push({
        type: 'java',
        request: 'attach',
        name: 'Java: Attach to Process',
        processId: 0,
      });
    }

    /* C/C++ has no marker file; any translation unit in the workspace makes an
       attach entry worth offering, and codelldb can join a running binary. */
    if (nama.some((n) => /\.(c|cc|cpp|cxx)$/i.test(n))) {
      konfigurasi.push({
        type: 'cppdbg',
        request: 'attach',
        name: 'C/C++: Attach to Process',
        processId: 0,
      });
    }

    if (ada('cargo.toml')) {
      konfigurasi.push({
        type: 'lldb',
        request: 'launch',
        name: 'Rust: Debug Binary',
        cargo: { args: ['build'] },
      });
    }

    if (ada('go.mod')) {
      konfigurasi.push({
        type: 'go',
        request: 'launch',
        name: 'Go: Debug Package',
        mode: 'auto',
        program: '${fileDirname}',
      });
    }

    if (ada('pom.xml')) {
      konfigurasi.push({
        type: 'java',
        request: 'launch',
        name: 'Java: Main Class',
        mainClass: '${file}',
      });
    }

    /*
     * No recognised marker: pick the debug type from the FILE that is open,
     * not from a fixed guess.
     *
     * This used to write `{ type: 'node', program: '${file}' }` for every
     * workspace without a marker, so pressing F5 on a .cpp file asked the Node
     * adapter to debug it - and the reader got "The Node adapter (js-debug) is
     * not present", which says nothing about the real problem (there is no
     * C++ debugger). A `.cpp` file now gets a `cppdbg` entry served by the
     * bundled codelldb adapter, which fails with "LLDB is not installed"
     * instead of pointing at the wrong adapter.
     *
     * Files whose language has no debugger at all get the `type` guessed from
     * the extension and an empty list, so the UI can say "Run this file
     * instead" rather than offering a config that cannot work.
     */
    if (konfigurasi.length === 0) {
      const s = useStore.getState();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const deteksi = deteksiDebug(tab?.path ?? null);
      /*
       * Only a language with a REAL adapter gets written. `adapter === ''`
       * means the extension is recognised but this build has no debugger for
       * it (Ruby, PHP) - writing `{type:'…'}` there would just move the
       * failure from "wrong adapter" to "unknown type", so the file is left
       * without a config and the UI points at Run instead.
       */
      if (deteksi && deteksi.adapter) {
        konfigurasi.push(deteksi.konfig(tab?.path ?? '${file}'));
      }
    }

    const isi =
      JSON.stringify(
        {
          version: '0.2.0',
          configurations: konfigurasi,
        },
        null,
        2,
      ) + '\n';

    const folder = `${ws}\\.zephyr`;
    const file = `${folder}\\launch.json`;

    /*
     * No debugger for this file: do not write an empty launch.json at all.
     * An empty file would replace a working one from another project open in
     * the same folder, and it tells the reader nothing - the caller shows the
     * "use Run instead" message.
     */
    if (konfigurasi.length === 0) return false;

    try {
      if (!(await fsExists(folder))) await fsCreateDir(folder);
      await fsWrite(file, isi);
    } catch (e) {
      notifyError(tx('debug.createFailed'), {
        source: 'debug',
        detail: pesan(e),
      });
      return false;
    }

    notifyInfo(tf('debug.createdCount', { n: konfigurasi.length }), {
      source: 'debug',
      detail: file,
    });
    await get().muatLaunch();
    return true;
  },

  pilihConfig: (nama) => set({ configTerpilih: nama }),

  breakpointsUntuk: (path) =>
    get().breakpoints.filter((b) => kunciPath(b.path) === kunciPath(path)),

  toggleBreakpoint: async (path, line) => {
    const ada = get().breakpoints.find(
      (b) => kunciPath(b.path) === kunciPath(path) && b.line === line,
    );
    if (ada) {
      await get().hapusBreakpoint(path, line);
      return;
    }
    set((s) => ({
      breakpoints: [...s.breakpoints, { path, line, enabled: true, verified: false }],
    }));
    await kirimBreakpoints(path);
  },

  hapusBreakpoint: async (path, line) => {
    set((s) => ({
      breakpoints: s.breakpoints.filter(
        (b) => !(kunciPath(b.path) === kunciPath(path) && b.line === line),
      ),
    }));
    await kirimBreakpoints(path);
  },

  bukaEditBreakpoint: (path, line) => set({ editBp: { path, line } }),
  tutupEditBreakpoint: () => set({ editBp: null }),

  /*
   * Simpan condition / hitCondition / logMessage untuk satu baris.
   *
   * Breakpoint yang belum ada DIBUAT di sini: orang bisa langsung membuka
   * dialog dari gutter pada baris yang belum punya titik, dan menolak dengan
   * "buat breakpoint dulu" membuat satu klik menjadi tiga.
   *
   * Field kosong DISIMPAN sebagai `undefined`, bukan string kosong: DAP
   * memperlakukan `condition: ""` sebagai kondisi yang selalu benar, dan
   * logpoint dengan pesan kosong mencetak baris kosong.
   */
  simpanBreakpointOpsi: async (path, line, opsi) => {
    const bersih = {
      condition: opsi.condition?.trim() || undefined,
      hitCondition: opsi.hitCondition?.trim() || undefined,
      logMessage: opsi.logMessage?.trim() || undefined,
    };
    set((s) => {
      const ada = s.breakpoints.some(
        (b) => kunciPath(b.path) === kunciPath(path) && b.line === line,
      );
      const daftar = ada
        ? s.breakpoints.map((b) =>
            kunciPath(b.path) === kunciPath(path) && b.line === line ? { ...b, ...bersih } : b,
          )
        : [...s.breakpoints, { path, line, enabled: true, verified: false, ...bersih }];
      return { breakpoints: daftar, editBp: null };
    });
    await kirimBreakpoints(path);
  },

  hapusSemuaBreakpoint: async () => {
    const paths = [...new Set(get().breakpoints.map((b) => b.path))];
    set({ breakpoints: [] });
    for (const p of paths) await kirimBreakpoints(p);
  },

  /*
   * Run Without Debugging.
   *
   * Start Debugging always spends a DAP session; when the reader only wants
   * the program running, that session also wraps the process in a debugger
   * that slows it down and stops on breakpoints they forgot about. The command
   * that VS Code calls "Run Without Debugging" exists for that case.
   *
   * It is built from the SAME launch config, so the arguments, cwd and program
   * path match exactly what debugging would have used. Attach configs are
   * refused: there is no program to start, only a process that already exists.
   */
  runTanpaDebug: async (nama) => {
    let s = get();
    const cfgNama = nama ?? s.configTerpilih;
    let cfg = s.launch?.configurations.find((c) => c.name === cfgNama);
    if (!cfg) {
      if (!(await get().buatLaunch())) return false;
      s = get();
      cfg = s.launch?.configurations.find((c) => c.name === s.configTerpilih);
    }
    if (!cfg) return false;

    if (cfg.request === 'attach') {
      notifyWarn(tf('“{name}” attaches to a process that is already running.', { name: cfg.name }), {
        source: 'debug',
        detail: tx('Start the program yourself, then use Start Debugging to attach to it.'),
      });
      return false;
    }

    const toko = useStore.getState();
    const ws = toko.workspace ?? '';
    const tab = toko.tabs.find((t) => t.id === toko.activeTabId);
    const berkas = tab?.path ?? '';
    const namaWs = ws.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
    const ganti = (v: string) =>
      v
        .replace(/\$\{workspaceFolder\}/g, ws)
        .replace(/\$\{workspaceFolderBasename\}/g, namaWs)
        .replace(/\$\{file\}/g, berkas)
        .replace(/\$\{fileDirname\}/g, berkas.replace(/[\\/][^\\/]+$/, ''));
    const kutip = (v: string) => (/\s/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v);
    const apaAdanya = (v: unknown) => (typeof v === 'string' ? v : '');

    const bagian: string[] = [];
    const rt = apaAdanya(cfg.runtimeExecutable);
    const rtArgs = Array.isArray(cfg.runtimeArgs) ? (cfg.runtimeArgs as unknown[]) : [];
    if (rt) {
      bagian.push(kutip(ganti(rt)), ...rtArgs.map((a) => kutip(ganti(String(a)))));
    } else if (cfg.program) {
      bagian.push(kutip(ganti(cfg.program)));
    } else if (typeof cfg.module === 'string') {
      bagian.push('-m', kutip(ganti(cfg.module)));
    }
    bagian.push(...(Array.isArray(cfg.args) ? cfg.args : []).map((a) => kutip(ganti(String(a)))));

    const perintah = bagian.filter(Boolean).join(' ');
    if (!perintah) {
      notifyWarn(tx('This configuration has nothing to run.'), {
        source: 'debug',
        detail: cfg.name,
      });
      return false;
    }

    /* Diimpor malas: terminalStore mengimpor store.ts, jadi impor statis di
       sini akan menutup siklus (pola yang sama dipakai `jalankan`). */
    const { useTerminal } = await import('./terminalStore');
    const t = useTerminal.getState();
    let pane = t
      .allPanes()
      .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
    if (!pane) {
      const id = await t.addPane('shell', cfg.cwd ? { cwd: ganti(cfg.cwd) } : undefined);
      if (!id) {
        notifyError(tx('Could not open a terminal to run this configuration.'), { source: 'debug' });
        return false;
      }
      await new Promise((r) => setTimeout(r, 700));
      pane = useTerminal.getState().findPane(id);
    }
    if (!pane) return false;

    useTerminal.getState().setVisible(true);
    useTerminal.getState().setActivePane(
      useTerminal.getState().activeTabId ?? '',
      pane.id,
    );
    const { writeChunked } = await import('./terminalClipboard');
    await writeChunked(pane.id, `${perintah}\r`);
    return true;
  },

  start: async (nama) => {
    const s = get();
    const cfgNama = nama ?? s.configTerpilih;
    let cfg = s.launch?.configurations.find((c) => c.name === cfgNama);

    /*
     * No config yet: create one instead of stopping at an error.
     *
     * The old behaviour showed "create .zephyr/launch.json first" and left it
     * there, so pressing Run on a fresh project always ended in a dead end
     * unless the user already knew the file name, the folder, and the schema.
     * Writing a detected config and continuing is what the Run button is for.
     */
    if (!cfg) {
      const dibuat = await get().buatLaunch();
      if (!dibuat) {
        /*
         * `buatLaunch` refuses when the open file's language has no debugger
         * (a .cpp file, a .go file, ...). Say so once, and point at Run -
         * which exists for exactly those languages - instead of leaving the
         * reader with a missing js-debug message.
         */
        const s3 = get();
        if (s3.launch && s3.launch.configurations.length === 0) {
          const tab = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId);
          const det = deteksiDebug(tab?.path ?? null);
          notifyWarn(
            det ? `Debug ${det.label} belum tersedia` : 'Debug belum tersedia untuk file ini',
            {
              source: 'debug',
              detail: 'Pakai Run (Ctrl+Shift+B) untuk menjalankannya tanpa debugger.',
            },
          );
        }
        return false;
      }
      const s2 = get();
      cfg = s2.launch?.configurations.find((c) => c.name === s2.configTerpilih);
      if (!cfg) return false;
    }

    set({
      state: 'starting',
      error: null,
      frames: [],
      scopes: [],
      variables: {},
      barisAktif: null,
      alasanStop: '',
    });
    
    usePanel.getState().focusTab('debug');
    log(`— start "${cfg.name}" (${cfg.type}) —`);

    try {
      const hasil = await dapStart(
        cfg,
        s.breakpoints.filter((b) => b.enabled).map((b) => ({ path: b.path, line: b.line })),
      );
      set({ state: 'running', caps: (hasil.capabilities ?? {}) as Record<string, unknown> });
      log(
        `adapter ${hasil.adapter} (${hasil.transport}${hasil.port ? ' :' + hasil.port : ''}) pid ${hasil.pid}`,
      );
      
      for (const grup of hasil.breakpoints ?? []) {
        const bps = (grup.body?.breakpoints ?? []) as {
          verified?: boolean;
          line?: number;
          message?: string;
        }[];
        set((st) => ({
          breakpoints: st.breakpoints.map((b) => {
            if (kunciPath(b.path) !== kunciPath(grup.path)) return b;
            const cocok = bps.find((x) => x.line === b.line);
            return cocok
              ? { ...b, verified: cocok.verified ?? false, message: cocok.message }
              : b;
          }),
        }));
      }
      return true;
    } catch (e) {
      const m = pesan(e);
      set({ state: 'inactive', error: m });
      
      notifyError(m, { source: 'debug' });
      log(`FAILED: ${m}`);
      return false;
    }
  },

  stop: async () => {
    try {
      await dapStop();
    } catch (e) {
      log(`stop: ${pesan(e)}`);
    }
    set({
      state: 'inactive',
      threadId: null,
      threads: [],
      frames: [],
      frameTerpilih: null,
      scopes: [],
      variables: {},
      barisAktif: null,
      loadedSources: [],
      alasanStop: '',
    });
    
    set((s) => ({ breakpoints: s.breakpoints.map((b) => ({ ...b, verified: false })) }));
    log('— sesi debug dihentikan —');
  },

  restart: async () => {
    const nama = get().configTerpilih;
    await get().stop();
    await new Promise((r) => setTimeout(r, 250));
    await get().start(nama);
  },

  kontrol: async (aksi) => {
    const tid = get().threadId;
    if (tid == null) {
      notifyWarn(tx('No stopped threads'), { source: 'debug' });
      return;
    }
    try {
      await dapKontrol(aksi, tid);
      if (aksi !== 'pause') {
        
        set({ state: 'running', barisAktif: null, frames: [], scopes: [] });
      }
    } catch (e) {
      log(`${aksi}: ${pesan(e)}`);
    }
  },

  pilihFrame: async (frameId) => {
    const f = get().frames.find((x) => x.id === frameId);
    set({ frameTerpilih: frameId, variables: {} });
    if (f && f.path) {
      
      await useStore.getState().openPath(f.path);
      const { revealPosition } = await import('./editorRegistry');
      revealPosition(f.line, f.column || 1);
      set({ barisAktif: { path: f.path, line: f.line } });
    }
    try {
      const body = await dapScopes(frameId);
      const scopes = ((body.scopes ?? []) as Record<string, unknown>[]).map((s) => ({
        name: String(s.name ?? ''),
        variablesReference: Number(s.variablesReference ?? 0),
        expensive: Boolean(s.expensive),
      }));
      set({ scopes });
      
      const pertama = scopes.find((s) => !s.expensive) ?? scopes[0];
      if (pertama) await get().expandVariable(pertama.variablesReference);
      await get().refreshWatch();
    } catch (e) {
      log(`scopes: ${pesan(e)}`);
    }
  },

  expandVariable: async (ref) => {
    if (ref <= 0) return;
    if (get().variables[ref]) return; 
    try {
      const body = await dapVariables(ref);
      const vars = ((body.variables ?? []) as Record<string, unknown>[]).map((v) => ({
        name: String(v.name ?? ''),
        value: String(v.value ?? ''),
        type: v.type ? String(v.type) : undefined,
        variablesReference: Number(v.variablesReference ?? 0),
      }));
      set((s) => ({ variables: { ...s.variables, [ref]: vars } }));
    } catch (e) {
      log(`variables: ${pesan(e)}`);
    }
  },

  setVariable: async (ref, nama, nilai) => {
    try {
      await dapSetVariable(ref, nama, nilai);
      
      set((s) => {
        const v = { ...s.variables };
        delete v[ref];
        return { variables: v };
      });
      await get().expandVariable(ref);
      return true;
    } catch (e) {
      notifyError(`Set Value failed: ${pesan(e)}`, { source: 'debug' });
      return false;
    }
  },

  tambahWatch: async (expr) => {
    const t = expr.trim();
    if (!t || get().watch.some((w) => w.expr === t)) return;
    set((s) => ({ watch: [...s.watch, { expr: t, value: '…', error: false }] }));
    await get().refreshWatch();
  },

  hapusWatch: (expr) => set((s) => ({ watch: s.watch.filter((w) => w.expr !== expr) })),

  refreshWatch: async () => {
    const s = get();
    if (s.watch.length === 0) return;
    if (s.state !== 'stopped') return;
    const hasil: WatchItem[] = [];
    for (const w of s.watch) {
      try {
        const body = await dapEvaluate(w.expr, s.frameTerpilih ?? undefined, 'watch');
        hasil.push({ expr: w.expr, value: String(body.result ?? ''), error: false });
      } catch (e) {
        hasil.push({ expr: w.expr, value: pesan(e), error: true });
      }
    }
    set({ watch: hasil });
  },

  evalRepl: async (expr) => {
    set((s) => ({ repl: [...s.repl, { kind: 'input', text: expr }] }));
    if (get().state === 'inactive') {
      const t = 'No active debug session. Press F5 to start.';
      set((s) => ({ repl: [...s.repl, { kind: 'error', text: t }] }));
      return t;
    }
    try {
      const body = await dapEvaluate(expr, get().frameTerpilih ?? undefined, 'repl');
      const teks = String(body.result ?? '');
      set((s) => ({ repl: [...s.repl, { kind: 'output', text: teks }] }));
      
      return teks;
    } catch (e) {
      const m = pesan(e);
      set((s) => ({ repl: [...s.repl, { kind: 'error', text: m }] }));
      return m;
    }
  },

  bersihkanRepl: () => set({ repl: [] }),

  _onEvent: (msg) => {
    if (msg.type === 'request') {
      log(`reverse request "${msg.command}" dibalas sukses (v1 satu sesi)`);
      return;
    }
    const ev = msg.event ?? '';
    const body = (msg.body ?? {}) as Record<string, unknown>;

    switch (ev) {
      case 'stopped': {
        
        const tid = body.threadId != null ? Number(body.threadId) : null;
        const alasan = String(body.reason ?? 'stop');
        set({ state: 'stopped', threadId: tid, alasanStop: alasan });
        void muatStack(tid);
        
        if (alasan === 'exception') {
          const teks = String(body.text ?? body.description ?? 'exception');
          log(`EXCEPTION: ${teks}`);
        }
        break;
      }
      case 'continued':
        set({ state: 'running', barisAktif: null, frames: [], scopes: [] });
        break;
      case 'terminated':
      case 'exited': {
        const kode = body.exitCode;
        log(kode == null ? '— program berakhir —' : `— program keluar dengan kode ${kode} —`);
        set({
          state: 'inactive',
          threadId: null,
          frames: [],
          scopes: [],
          variables: {},
          barisAktif: null,
        });
        break;
      }
      case 'output': {
        const kategori = String(body.category ?? 'console');
        const teks = String(body.output ?? '');
        
        set((s) => ({
          repl: [
            ...s.repl,
            { kind: kategori === 'stderr' ? 'error' : 'output', text: teks.replace(/\n$/, '') },
          ],
        }));
        log(`[${kategori}] ${teks.replace(/\n$/, '')}`);
        break;
      }
      case 'breakpoint': {
        
        const bp = (body.breakpoint ?? {}) as Record<string, unknown>;
        const src = (bp.source ?? {}) as Record<string, unknown>;
        const p = String(src.path ?? '');
        const line = Number(bp.line ?? 0);
        set((s) => ({
          breakpoints: s.breakpoints.map((b) =>
            kunciPath(b.path) === kunciPath(p) && (b.line === line || bp.id != null)
              ? { ...b, verified: Boolean(bp.verified), message: bp.message as string | undefined }
              : b,
          ),
        }));
        break;
      }
      case 'thread': {
        void dapThreads()
          .then((r) =>
            set({
              threads: ((r.threads ?? []) as Record<string, unknown>[]).map((t) => ({
                id: Number(t.id ?? 0),
                name: String(t.name ?? ''),
              })),
            }),
          )
          .catch(() => {});
        break;
      }
      default:
        break;
    }
  },
}));

const pesan = (e: unknown): string =>
  e && typeof e === 'object' && 'message' in e
    ? String((e as { message: unknown }).message)
    : asZephyrError(e).message;

const kirimBreakpoints = async (path: string) => {
  const st = useDebug.getState();
  if (st.state === 'inactive') return;
  const milik = st.breakpoints.filter(
    (b) => kunciPath(b.path) === kunciPath(path) && b.enabled,
  );
  if (milik.length === 0) {
    /* Tanpa breakpoint sama sekali, server tetap harus diberi tahu bahwa
       daftarnya kosong — kalau tidak, titik lama tetap aktif di sesi berjalan. */
    try {
      await dapSetBreakpoints(path, []);
    } catch {
      /* sesi mungkin sudah berhenti */
    }
    return;
  }

  /* Opsi hanya dikirim untuk breakpoint yang memilikinya: `condition: ""`
     dibaca DAP sebagai "selalu benar", dan itu bukan arti dari field kosong. */
  const denganOpsi = milik.some((b) => b.condition || b.hitCondition || b.logMessage);
  try {
    const body = denganOpsi
      ? await dapSetBreakpointsEx(
          path,
          milik.map((b) => ({
            line: b.line,
            ...(b.condition ? { condition: b.condition } : {}),
            ...(b.hitCondition ? { hitCondition: b.hitCondition } : {}),
            ...(b.logMessage ? { logMessage: b.logMessage } : {}),
          })),
        )
      : await dapSetBreakpoints(path, milik.map((b) => b.line));
    const bps = (body.breakpoints ?? []) as { verified?: boolean; line?: number }[];
    useDebug.setState((s) => ({
      breakpoints: s.breakpoints.map((b) => {
        if (kunciPath(b.path) !== kunciPath(path)) return b;
        const cocok = bps.find((x) => x.line === b.line);
        return cocok ? { ...b, verified: cocok.verified ?? false } : b;
      }),
    }));
  } catch (e) {
    log(`setBreakpoints: ${pesan(e)}`);
  }
};

const muatStack = async (tid: number | null) => {
  if (tid == null) return;
  try {
    const th = await dapThreads();
    useDebug.setState({
      threads: ((th.threads ?? []) as Record<string, unknown>[]).map((t) => ({
        id: Number(t.id ?? 0),
        name: String(t.name ?? ''),
      })),
    });

    const st = await dapStack(tid);
    const frames = ((st.stackFrames ?? []) as Record<string, unknown>[]).map((f) => {
      const src = (f.source ?? {}) as Record<string, unknown>;
      return {
        id: Number(f.id ?? 0),
        name: String(f.name ?? ''),
        path: String(src.path ?? ''),
        line: Number(f.line ?? 0),
        column: Number(f.column ?? 1),
      };
    });
    useDebug.setState({ frames });

    if (frames[0]) await useDebug.getState().pilihFrame(frames[0].id);

    const ls = await dapLoadedSources().catch(() => ({ sources: [] }));
    useDebug.setState({
      loadedSources: ((ls.sources ?? []) as Record<string, unknown>[]).map((s) => ({
        name: String(s.name ?? ''),
        path: String(s.path ?? ''),
      })),
    });
  } catch (e) {
    log(`stack: ${pesan(e)}`);
  }
};

let debugListenerBound = false;

export const bindDebugListeners = () => {
  if (debugListenerBound) return;
  debugListenerBound = true;
  void listen<DapPesan>('dap-event', (e) => useDebug.getState()._onEvent(e.payload));
  void listen<{ category: string; output: string }>('dap-output', (e) => {
    log(`[adapter ${e.payload.category}] ${e.payload.output}`);
  });

  let aktifTerakhir = false;
  useDebug.subscribe((s) => {
    const aktif = s.state !== 'inactive';
    if (aktif !== aktifTerakhir) {
      aktifTerakhir = aktif;
      useKb.getState().setCtx('debugActive', aktif);
    }
  });
};

export const catatExceptionKeProblems = (path: string, line: number, teks: string) => {
  
  useProblems.getState().setDiagnostics(path, [
    {
      file: path,
      line,
      column: 1,
      severity: 'error',
      message: teks,
      source: 'debug',
    },
  ]);
  notifyInfo(tx('Exception recorded in Problems'), { source: 'debug' });
};

export type { DebugConfig, LaunchFile, AdapterSpec };
