// debugStore.ts — state Run & Debug (fase 22).
//
// PEMBAGIAN KERJA dengan dap.rs
//
// Rust  : proses adapter, framing DAP, request/response, urutan startup
//         (initialize → initialized → setBreakpoints → configurationDone →
//         launch), kill pohon proses.
// Store : model UI. Breakpoint yang BELUM ada sesi (bisa dipasang kapan saja),
//         call stack, scope tree, watch, riwayat REPL, frame terpilih, dan
//         penerjemahan event DAP mentah jadi state yang bisa dirender.
//
// Rust sengaja tidak menyimpan model UI: kalau keduanya menyimpan, ada dua
// sumber kebenaran dan salah satunya pasti basi.

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

/** Breakpoint di sisi UI. Ada walau belum ada sesi debug. */
export interface Breakpoint {
  path: string;
  line: number;
  enabled: boolean;
  /** diverifikasi adapter (titik penuh vs kosong) */
  verified: boolean;
  /** pesan adapter bila tidak bisa dipasang */
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
  /** anak yang sudah dimuat (lazy expand) */
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

/** Status sesi, dipakai untuk mengaktifkan/menonaktifkan toolbar. */
export type DebugState = 'inactive' | 'starting' | 'running' | 'stopped';

interface DebugStoreState {
  launch: LaunchFile | null;
  adapters: AdapterSpec[];
  /** nama konfigurasi terpilih di dropdown */
  configTerpilih: string;
  state: DebugState;
  /** alasan berhenti terakhir (breakpoint / step / exception) */
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
  /** baris yang sedang dieksekusi — dipakai highlight editor */
  barisAktif: { path: string; line: number } | null;
  /** kapabilitas adapter (menentukan tombol Set Value tampil atau tidak) */
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
        // Pilihan lama dipertahankan bila masih ada; kalau tidak, ambil yang
        // pertama supaya tombol Start langsung berguna.
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
      notifyError('Tidak ada konfigurasi debug. Buat .zephyr/launch.json dulu.', {
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
    // Debug Console dibuka: kalau adapter gagal, pesannya di situ.
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
      // Tandai breakpoint yang diverifikasi adapter.
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
      // Adapter belum terpasang adalah kasus yang WAJAR (brief V5): tampilkan
      // instruksi install, jangan crash dan jangan diam.
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
    // Breakpoint TIDAK dihapus: user memasangnya untuk sesi berikutnya juga.
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
      notifyWarn('Belum ada thread yang berhenti', { source: 'debug' });
      return;
    }
    try {
      await dapKontrol(aksi, tid);
      if (aksi !== 'pause') {
        // Setelah continue/step, state kembali running sampai `stopped` datang.
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
      // Klik frame → editor lompat ke lokasi frame (brief fase 22).
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
      // Scope pertama (biasanya Local) langsung dimuat — itu yang dilihat user
      // lebih dulu; scope "expensive" (Global) dibiarkan sampai diklik.
      const pertama = scopes.find((s) => !s.expensive) ?? scopes[0];
      if (pertama) await get().expandVariable(pertama.variablesReference);
      await get().refreshWatch();
    } catch (e) {
      log(`scopes: ${pesan(e)}`);
    }
  },

  expandVariable: async (ref) => {
    if (ref <= 0) return;
    if (get().variables[ref]) return; // sudah dimuat
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
      // Muat ulang scope itu: nilai baru bisa berbeda dari yang dikirim
      // (adapter melakukan coercion).
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
      // Hasil dengan variablesReference > 0 adalah objek yang bisa di-expand;
      // di REPL cukup teksnya, tree-nya ada di panel VARIABLES.
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
        // threadId 0 ADALAH id yang sah — js-debug memakainya untuk thread
        // pertama. `Number(x ?? 0) || null` mengubah 0 menjadi null, sehingga
        // call stack tidak pernah dimuat padahal breakpoint sudah kena.
        const tid = body.threadId != null ? Number(body.threadId) : null;
        const alasan = String(body.reason ?? 'stop');
        set({ state: 'stopped', threadId: tid, alasanStop: alasan });
        void muatStack(tid);
        // Exception juga masuk Problems (brief: sumber "debug").
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
        // stdout/stderr program → Debug Console (itu yang dilihat user saat
        // debug), bukan hanya channel Output.
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
        // Adapter memverifikasi/menggeser breakpoint setelah source dimuat.
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

/** Ambil pesan error dari ZephyrError ({ code, message }) atau apa pun. */
const pesan = (e: unknown): string =>
  e && typeof e === 'object' && 'message' in e
    ? String((e as { message: unknown }).message)
    : String(e);

/** Kirim ulang seluruh breakpoint satu file ke adapter (kalau sesi hidup). */
const kirimBreakpoints = async (path: string) => {
  const st = useDebug.getState();
  if (st.state === 'inactive') return;
  const lines = st.breakpoints
    .filter((b) => kunciPath(b.path) === kunciPath(path) && b.enabled)
    .map((b) => b.line);
  try {
    // setBreakpoints MENGGANTI seluruh daftar satu source — jadi kirim semua
    // baris file itu, bukan hanya yang baru.
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

/** Setelah `stopped`: threads → stackTrace → scopes (urutan wajib DAP). */
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

    // Frame teratas dipilih otomatis: itu tempat eksekusi berhenti.
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

/**
 * Pasang listener `dap-event` + `dap-output` SEKALI per proses.
 *
 * Guard modul, bukan cleanup effect: StrictMode dev memasang effect dua kali
 * dan setiap event akan diproses dobel — pelajaran yang sama dari `pty-output`,
 * `ai-chunk`, `mcp-action`, `task-output`, dan `search-hit`.
 */
let debugListenerBound = false;

export const bindDebugListeners = () => {
  if (debugListenerBound) return;
  debugListenerBound = true;
  void listen<DapPesan>('dap-event', (e) => useDebug.getState()._onEvent(e.payload));
  void listen<{ category: string; output: string }>('dap-output', (e) => {
    log(`[adapter ${e.payload.category}] ${e.payload.output}`);
  });

  // Context key `debugActive` menentukan F10/F11/Shift+F5 berlaku atau tidak
  // (keybindings.ts: F11 = step-into saat debug, fullscreen di luar itu).
  // Disinkronkan dari state store, bukan disetel manual di setiap tempat yang
  // mengubah sesi — kalau manual, satu jalur yang lupa membuat shortcut mati.
  let aktifTerakhir = false;
  useDebug.subscribe((s) => {
    const aktif = s.state !== 'inactive';
    if (aktif !== aktifTerakhir) {
      aktifTerakhir = aktif;
      useKb.getState().setCtx('debugActive', aktif);
    }
  });
};

/** Dipakai Problems: exception debug boleh menambah entri (brief integrasi). */
export const catatExceptionKeProblems = (path: string, line: number, teks: string) => {
  // Bentuk Diagnostic memakai `file`/`column` (problemsStore.ts:17), bukan
  // `path`/`col` — tsc yang memberi tahu, bukan asumsi.
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
  notifyInfo('Exception dicatat di Problems', { source: 'debug' });
};

export type { DebugConfig, LaunchFile, AdapterSpec };
