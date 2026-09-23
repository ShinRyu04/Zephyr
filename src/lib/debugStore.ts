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
  dapLoadedSources,
} from './commands';
import type { AdapterSpec, DebugConfig, LaunchFile } from './types';
import { useStore } from './store';
import { useOutput } from './outputStore';
import { usePanel } from './panelStore';
import { useProblems } from './problemsStore';
import { useKb } from './keybindingStore';
import { notifyError, notifyInfo, notifyWarn } from './notificationStore';
import { kunciPath } from './pathKey';
import { tx } from './i18n';

export interface Breakpoint {
  path: string;
  line: number;
  enabled: boolean;
  
  verified: boolean;
  
  message?: string;
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
  pilihConfig: (nama: string) => void;

  toggleBreakpoint: (path: string, line: number) => Promise<void>;
  hapusBreakpoint: (path: string, line: number) => Promise<void>;
  hapusSemuaBreakpoint: () => Promise<void>;
  breakpointsUntuk: (path: string) => Breakpoint[];

  start: (nama?: string) => Promise<boolean>;
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
        notifyWarn(`${f.invalid.length} konfigurasi launch.json dilewati`, {
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

  hapusSemuaBreakpoint: async () => {
    const paths = [...new Set(get().breakpoints.map((b) => b.path))];
    set({ breakpoints: [] });
    for (const p of paths) await kirimBreakpoints(p);
  },

  start: async (nama) => {
    const s = get();
    const cfgNama = nama ?? s.configTerpilih;
    const cfg = s.launch?.configurations.find((c) => c.name === cfgNama);
    if (!cfg) {
      notifyError(tx('Tidak ada konfigurasi debug. Buat .zephyr/launch.json dulu.'), {
        source: 'debug',
      });
      return false;
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
      log(`GAGAL: ${m}`);
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
      notifyWarn(tx('Belum ada thread yang berhenti'), { source: 'debug' });
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
      notifyError(`Set Value gagal: ${pesan(e)}`, { source: 'debug' });
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
      const t = 'Tidak ada sesi debug aktif. Tekan F5 untuk mulai.';
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
    : String(e);

const kirimBreakpoints = async (path: string) => {
  const st = useDebug.getState();
  if (st.state === 'inactive') return;
  const lines = st.breakpoints
    .filter((b) => kunciPath(b.path) === kunciPath(path) && b.enabled)
    .map((b) => b.line);
  try {
    
    const body = await dapSetBreakpoints(path, lines);
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
  notifyInfo(tx('Exception dicatat di Problems'), { source: 'debug' });
};

export type { DebugConfig, LaunchFile, AdapterSpec };
