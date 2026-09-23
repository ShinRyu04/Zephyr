import * as cmd from './commands';
import { useNotif } from './notificationStore';
import { skripEkstensi } from './extRunner';
import { useStore } from './store';
import { useExtApproval } from './extApprovalStore';
import type { ExtManifestStatus } from './types';

type RegisterMsg = { type: 'register'; id: string; title: string };
type InvokeReq = { type: 'invoke'; id: string; seq: number; args: unknown[] };
type ResultMsg = { type: 'result'; seq: number; ok: boolean; value?: unknown; error?: string };

type NotifyMsg = { type: 'notify'; severity: 'info' | 'warn' | 'error'; message: string };

type ExecReq = {
  type: 'exec-req';
  seq: number;
  runtime: string;
  args: string[];
  cwd: string | null;
  timeoutMs: number;
};
type ExecResp = { type: 'exec-resp'; seq: number; ok: boolean; value?: unknown; error?: string };
type WorkerMsg = RegisterMsg | ResultMsg | NotifyMsg | ExecReq;

const INVOKE = `
self.onmessage = (e) => {
  const m = e.data;
  if (!m) return;
  // Jawaban eksekusi runtime — resolve/reject pending zephyr.exec.
  if (m.type === 'exec-resp') {
    const pe = __zhExecPending[m.seq];
    if (!pe) return;
    delete __zhExecPending[m.seq];
    if (m.ok) pe.resolve(m.value);
    else pe.reject(new Error(m.error || 'eksekusi runtime gagal'));
    return;
  }
  if (m.type !== 'invoke') return;
  const fn = __zh[m.id];
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
  
  if (m.type === 'exec-req') {
    void prosesExecReq(extId, m, rt);
    return;
  }
  
  if (m.type === 'notify') {
    
    const gagalAktivasi =
      m.severity === 'warn' &&
      (m.message.startsWith('aktivasi') || m.message.startsWith('tidak bisa dimuat'));
    if (gagalAktivasi) {
      void cmd.extensionsSetEnabled(extId, false).catch(() => {});
    }
    useNotif.getState().notify({
      severity: m.severity,
      message: `Ekstensi ${extId}: ${m.message}`,
      
      detail: gagalAktivasi
        ? 'Ekstensi VS Code penuh biasanya butuh runtime eksternal (Python/Java/Docker/Node) atau API host yang tidak tersedia di sandbox Zephyr v1 (manifest-only).'
        : undefined,
      source: 'extensions',
    });
    return;
  }
  const p = rt.pending.get(m.seq);
  if (!p) return;
  rt.pending.delete(m.seq);
  if (m.ok) p.resolve(m.value);
  else p.reject(new Error(m.error || 'gagal'));
}

async function prosesExecReq(extId: string, m: ExecReq, rt: ExtRuntime): Promise<void> {
  const jawab = (ok: boolean, value?: unknown, error?: string) =>
    rt.worker.postMessage({ type: 'exec-resp', seq: m.seq, ok, value, error } as ExecResp);
  try {
    const trust = useStore.getState().settings.extensions.trust?.[extId];
    let bin: string | null = trust?.runtimes?.[m.runtime] ?? null;
    if (!bin) {
      bin = await cmd.extWhich(m.runtime);
      if (!bin) {
        jawab(
          false,
          undefined,
          `runtime '${m.runtime}' tidak ditemukan di PATH — eksekusi ditolak. Pastikan ter-install, atau beri izin manual di Settings → Ekstensi.`,
        );
        return;
      }
      const disetujui = await useExtApproval.getState().minta({
        extId,
        runtime: m.runtime,
        binPath: bin,
        args: m.args,
        cwd: m.cwd,
      });
      if (!disetujui) {
        jawab(false, undefined, 'eksekusi ditolak user');
        return;
      }
    }
    const res = await cmd.extExec({
      extId,
      runtime: m.runtime,
      bin: bin,
      args: m.args,
      cwd: m.cwd,
      timeoutMs: m.timeoutMs,
    });
    jawab(true, res);
  } catch (e) {
    jawab(false, undefined, cmd.asZephyrError(e).message);
  }
}

function bukaRuntime(
  extId: string,
  code: string,
  files: Record<string, string>,
  mainRel: string,
  manifest: Record<string, unknown>,
  envPath = '',
): void {
  
  const blob = new Blob([skripEkstensi(code, files, mainRel, manifest, envPath), '\n', INVOKE], {
    type: 'application/javascript',
  });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  const rt: ExtRuntime = { worker, workerUrl, nextSeq: 1, pending: new Map() };
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => prosesPesan(extId, e.data, rt);
  worker.onerror = (e) => {
    useNotif.getState().notify({ severity: 'error', message: `Ekstensi ${extId} error`, detail: e.message, source: 'extensions' });
  };
  runtimes.set(extId, rt);
}

async function envPathUntukEkstensi(): Promise<string> {
  const dasar = [
    "C:\\Windows\\System32",
    "C:\\Windows",
    "C:\\Program Files\\Go\\bin",
    "C:\\Go\\bin",
  ].join(";");
  try {
    const go = await cmd.extWhich("go");
    if (go) {
      const dir = go.replace(/[\\/][^\\/]+$/, "");
      return dir + ";" + dasar;
    }
  } catch { /* abaikan */ }
  return dasar;
}

export async function muatEkstensiRuntime(daftar: ExtManifestStatus[]): Promise<void> {
  for (const st of daftar) {
    if (!st.enabled || st.error || !st.manifest) continue;
    const main = st.manifest.main;
    if (!main) continue;
    try {
      const code = await cmd.extensionsReadMain(st.manifest.id, main);
      const files = await cmd.extensionsReadFiles(st.manifest.id);
      bukaRuntime(st.manifest.id, code, files, main, st.manifest.raw ?? {}, await envPathUntukEkstensi());
    } catch (e) {
      
      void cmd.extensionsSetEnabled(st.manifest.id, false).catch(() => {});
      useNotif.getState().notify({
        severity: 'error',
        message: `Ekstensi ${st.manifest.id} dinonaktifkan: gagal dimuat di sandbox Zephyr v1`,
        detail: `${cmd.asZephyrError(e).message}. Kemungkinan besar ekstensi ini butuh runtime eksternal (Python/Java/Docker/Node) yang tidak didukung Zephyr v1 (manifest-only). Aktifkan lagi di Settings → Ekstensi kalau ingin mencoba ulang.`,
        source: 'extensions',
      });
    }
  }
}
