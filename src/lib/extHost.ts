import * as cmd from './commands';
import { useNotif } from './notificationStore';
import type { ExtManifestStatus } from './types';

type RegisterMsg = { type: 'register'; id: string; title: string };
type InvokeReq = { type: 'invoke'; id: string; seq: number; args: unknown[] };
type ResultMsg = { type: 'result'; seq: number; ok: boolean; value?: unknown; error?: string };
type WorkerMsg = RegisterMsg | ResultMsg;

const RUNNER = `
let handlers = {};
const zephyr = {
  registerCommand: (id, title, fn) => {
    handlers[String(id)] = fn;
    self.postMessage({ type: 'register', id: String(id), title: String(title || id) });
  },
};
self.onmessage = (e) => {
  const m = e.data;
  if (!m || m.type !== 'invoke') return;
  const fn = handlers[m.id];
  if (!fn) {
    self.postMessage({ type: 'result', seq: m.seq, ok: false, error: 'command tak dikenal: ' + m.id });
    return;
  }
  try {
    Promise.resolve(fn(...(m.args || []))).then(
      (v) => self.postMessage({ type: 'result', seq: m.seq, ok: true, value: v }),
      (err) => self.postMessage({ type: 'result', seq: m.seq, ok: false, error: String((err && err.message) || err) }),
    );
  } catch (err) {
    self.postMessage({ type: 'result', seq: m.seq, ok: false, error: String((err && err.message) || err) });
  }
};
`;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface ExtRuntime {
  worker: Worker;
  workerUrl: string;
  nextSeq: number;
  pending: Map<number, Pending>;
}

const runtimes = new Map<string, ExtRuntime>();
const registri = new Map<string, { extId: string; title: string }>();

export function sandboxCommands(): { id: string; extId: string; title: string }[] {
  return Array.from(registri.entries()).map(([id, r]) => ({ id, extId: r.extId, title: r.title }));
}

export function runEkstensiCommand(extId: string, commandId: string, args: unknown[]): Promise<unknown> {
  const rt = runtimes.get(extId);
  if (!rt) return Promise.reject(new Error('ekstensi tidak dimuat'));
  const seq = rt.nextSeq++;
  return new Promise((resolve, reject) => {
    rt.pending.set(seq, { resolve, reject });
    rt.worker.postMessage({ type: 'invoke', id: commandId, seq, args } as InvokeReq);
  });
}

export function tutupEkstensi(extId: string): void {
  const rt = runtimes.get(extId);
  if (!rt) return;
  rt.worker.terminate();
  URL.revokeObjectURL(rt.workerUrl);
  runtimes.delete(extId);
  for (const [id, r] of registri) if (r.extId === extId) registri.delete(id);
}

function prosesPesan(extId: string, m: WorkerMsg, rt: ExtRuntime): void {
  if (m.type === 'register') {
    if (!registri.has(m.id)) {
      registri.set(m.id, { extId, title: m.title });
    }
    return;
  }
  const p = rt.pending.get(m.seq);
  if (!p) return;
  rt.pending.delete(m.seq);
  if (m.ok) p.resolve(m.value);
  else p.reject(new Error(m.error || 'gagal'));
}

function bukaRuntime(extId: string, code: string): void {
  const blob = new Blob([RUNNER, '\n', code], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  const rt: ExtRuntime = { worker, workerUrl, nextSeq: 1, pending: new Map() };
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => prosesPesan(extId, e.data, rt);
  worker.onerror = (e) => {
    useNotif.getState().notify({ severity: 'error', message: `Ekstensi ${extId} error`, detail: e.message, source: 'extensions' });
  };
  runtimes.set(extId, rt);
}

export async function muatEkstensiRuntime(daftar: ExtManifestStatus[]): Promise<void> {
  for (const st of daftar) {
    if (!st.enabled || st.error || !st.manifest) continue;
    const main = st.manifest.main;
    if (!main) continue;
    try {
      const code = await cmd.extensionsReadMain(st.manifest.id, main);
      bukaRuntime(st.manifest.id, code);
    } catch (e) {
      useNotif.getState().notify({
        severity: 'error',
        message: `Ekstensi ${st.manifest.id} gagal dimuat`,
        detail: cmd.asZephyrError(e).message,
        source: 'extensions',
      });
    }
  }
}
