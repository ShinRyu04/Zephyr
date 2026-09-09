import * as cmd from './commands';
import { useNotif } from './notificationStore';
import { skripEkstensi } from './extRunner';
import type { ExtManifestStatus } from './types';

type RegisterMsg = { type: 'register'; id: string; title: string };
type InvokeReq = { type: 'invoke'; id: string; seq: number; args: unknown[] };
type ResultMsg = { type: 'result'; seq: number; ok: boolean; value?: unknown; error?: string };
/** Pesan dari worker yang diteruskan ke notifikasi Zephyr (fase 19.7). */
type NotifyMsg = { type: 'notify'; severity: 'info' | 'warn' | 'error'; message: string };
type WorkerMsg = RegisterMsg | ResultMsg | NotifyMsg;

/** Runner worker + shim CommonJS/vscode dihasilkan extRunner.ts (bisa diuji).
 *  Bagian invoke (panggil command) didefinisikan di sini supaya skrip utuh
 *  tetap satu sumber: PREAMBLE + kode ekstensi + TRAILER + handler invoke. */
const INVOKE = `
self.onmessage = (e) => {
  const m = e.data;
  if (!m || m.type !== 'invoke') return;
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
  // Pesan dari ekstensi (mis. vscode.window.showErrorMessage) → notifikasi app.
  if (m.type === 'notify') {
    // Aktivasi GAGAL → matikan ekstensi otomatis supaya error tidak muncul
    // terus di tiap pembukaan app. User bisa aktifkan lagi kalau mau coba
    // ulang (mis. setelah konfigurasi berubah).
    if (
      m.severity === 'warn' &&
      (m.message.startsWith('aktivasi') || m.message.startsWith('tidak bisa dimuat'))
    ) {
      void cmd.extensionsSetEnabled(extId, false).catch(() => {});
    }
    useNotif.getState().notify({
      severity: m.severity,
      message: `Ekstensi ${extId}: ${m.message}`,
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

function bukaRuntime(
  extId: string,
  code: string,
  files: Record<string, string>,
  mainRel: string,
): void {
  // Skrip utuh = shim CommonJS/vscode + peta file ekstensi (untuk require
  // relatif) + kode ekstensi + aktivasi + handler invoke. Dihasilkan
  // extRunner.ts supaya bisa diuji tanpa Worker sungguhan.
  const blob = new Blob([skripEkstensi(code, files, mainRel), '\n', INVOKE], {
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

export async function muatEkstensiRuntime(daftar: ExtManifestStatus[]): Promise<void> {
  for (const st of daftar) {
    if (!st.enabled || st.error || !st.manifest) continue;
    const main = st.manifest.main;
    if (!main) continue;
    try {
      const code = await cmd.extensionsReadMain(st.manifest.id, main);
      const files = await cmd.extensionsReadFiles(st.manifest.id);
      bukaRuntime(st.manifest.id, code, files, main);
    } catch (e) {
      // Gagal dimuat di sandbox → matikan otomatis supaya error tidak
      // berulang di tiap pembukaan app; pesan menjelaskan alasannya.
      void cmd.extensionsSetEnabled(st.manifest.id, false).catch(() => {});
      useNotif.getState().notify({
        severity: 'error',
        message: `Ekstensi ${st.manifest.id} dinonaktifkan: gagal dimuat di sandbox Zephyr`,
        detail: `${cmd.asZephyrError(e).message} — kemungkinan butuh runtime eksternal (Python/Java/Docker/dll) yang tidak tersedia di Zephyr. Aktifkan lagi di Settings → Ekstensi kalau ingin mencoba ulang.`,
        source: 'extensions',
      });
    }
  }
}
