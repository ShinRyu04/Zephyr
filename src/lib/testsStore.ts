import { create } from 'zustand';
import { agentExec, fsExists, fsRead, asZephyrError, type AgentExecResult } from './commands';
import { useStore } from './store';
import { useNotif } from './notificationStore';

export interface TestFramework {
  id: 'vitest' | 'jest' | 'pytest' | 'cargo' | 'go';
  label: string;
  command: string;
}

export interface TestCounts {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface TestRunResult {
  frameworkId: TestFramework['id'];
  command: string;
  counts: TestCounts | null;
  raw: string;
  exitCode: number;
  ok: boolean;
  timedOut: boolean;
  truncated: boolean;
  ms: number;
  atMs: number;
}

interface TestsState {
  framework: TestFramework | null;
  detecting: boolean;
  detected: boolean;
  running: boolean;
  error: string | null;
  last: TestRunResult | null;
}

interface TestsActions {
  detect: (root?: string | null) => Promise<TestFramework | null>;
  jalankanSemua: () => Promise<TestRunResult | null>;
  bersihkan: () => void;
}

const bacaScript = (json: unknown): Record<string, string> => {
  if (typeof json !== 'object' || json === null) return {};
  const scripts = (json as Record<string, unknown>).scripts;
  if (typeof scripts !== 'object' || scripts === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
};

const adaDep = (json: unknown, nama: string): boolean => {
  if (typeof json !== 'object' || json === null) return false;
  const o = json as Record<string, unknown>;
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const dep = o[key];
    if (typeof dep === 'object' && dep !== null && nama in (dep as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
};

const deteksiDariPackage = (teks: string): TestFramework | null => {
  let json: unknown;
  try {
    json = JSON.parse(teks);
  } catch {
    return null;
  }
  const scripts = bacaScript(json);
  if (scripts.test) {
    const sudahPakai = /vitest|jest|mocha|ava/i.test(scripts.test);
    if (/vitest/i.test(scripts.test) || adaDep(json, 'vitest')) {
      return { id: 'vitest', label: 'Vitest', command: 'npm test --silent' };
    }
    if (/jest/i.test(scripts.test) || adaDep(json, 'jest')) {
      return { id: 'jest', label: 'Jest', command: 'npm test --silent' };
    }
    if (sudahPakai) {
      return { id: adaDep(json, 'vitest') ? 'vitest' : 'jest', label: 'npm test', command: 'npm test --silent' };
    }
    return { id: 'vitest', label: 'npm test', command: 'npm test --silent' };
  }
  if (adaDep(json, 'vitest')) {
    return { id: 'vitest', label: 'Vitest', command: 'npx vitest run' };
  }
  if (adaDep(json, 'jest')) {
    return { id: 'jest', label: 'Jest', command: 'npx jest' };
  }
  return null;
};

const potong = (teks: string) => teks.trim();

export const useTests = create<TestsState & TestsActions>((set, get) => ({
  framework: null,
  detecting: false,
  detected: false,
  running: false,
  error: null,
  last: null,

  detect: async (root) => {
    const dir = root ?? useStore.getState().workspace;
    set({ detecting: true });
    if (!dir) {
      set({ detecting: false, detected: true, framework: null });
      return null;
    }
    const pakai = (p: string) => `${dir.replace(/[\\/]+$/, '')}${sep()}${p}`;
    try {
      if (await fsExists(pakai('package.json'))) {
        const res = await fsRead(pakai('package.json'), 'utf8').catch(() => null);
        const fw = res ? deteksiDariPackage(res.content) : null;
        if (fw) {
          set({ framework: fw, detecting: false, detected: true });
          return fw;
        }
      }
      if (await fsExists(pakai('pyproject.toml'))) {
        const res = await fsRead(pakai('pyproject.toml'), 'utf8').catch(() => null);
        const isi = res?.content ?? '';
        if (/pytest|\[tool\.pytest/i.test(isi)) {
          const fw: TestFramework = { id: 'pytest', label: 'pytest', command: 'python -m pytest' };
          set({ framework: fw, detecting: false, detected: true });
          return fw;
        }
      }
      if (await fsExists(pakai('Cargo.toml'))) {
        const fw: TestFramework = { id: 'cargo', label: 'cargo test', command: 'cargo test' };
        set({ framework: fw, detecting: false, detected: true });
        return fw;
      }
      if (await fsExists(pakai('go.mod'))) {
        const fw: TestFramework = { id: 'go', label: 'go test', command: 'go test ./...' };
        set({ framework: fw, detecting: false, detected: true });
        return fw;
      }
      set({ framework: null, detecting: false, detected: true });
      return null;
    } catch (e) {
      set({ detecting: false, detected: true, error: asZephyrError(e).message });
      return null;
    }
  },

  jalankanSemua: async () => {
    let fw = get().framework;
    if (!fw) fw = await get().detect();
    if (!fw) {
      set({ error: 'tidak ada test framework yang terdeteksi' });
      useNotif.getState().notify({
        severity: 'warn',
        message: 'Tidak ada test framework',
        detail: 'package.json (test/vitest/jest), pyproject (pytest), Cargo.toml, atau go.mod tidak ditemukan.',
        source: 'Tests',
      });
      return null;
    }

    set({ running: true, error: null });
    let r: AgentExecResult;
    try {
      r = await agentExec(fw.command, 600_000);
    } catch (e) {
      const msg = asZephyrError(e).message;
      set({ running: false, error: msg });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Gagal menjalankan test',
        detail: msg,
        source: 'Tests',
      });
      return null;
    }

    const raw = [r.stdout, r.stderr].filter(Boolean).join('\n');
    const counts = hitungHasil(fw.id, raw);
    const hasil: TestRunResult = {
      frameworkId: fw.id,
      command: fw.command,
      counts,
      raw: potong(raw),
      exitCode: r.exitCode,
      ok: !r.timedOut && r.exitCode === 0,
      timedOut: r.timedOut,
      truncated: r.truncated,
      ms: r.ms,
      atMs: Date.now(),
    };
    set({ running: false, last: hasil });
    return hasil;
  },

  bersihkan: () => set({ last: null, error: null }),
}));

const sep = () => (typeof navigator !== 'undefined' && /win/i.test(navigator.platform) ? '\\' : '/');

interface Hitung {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

const ambilAngka = (re: RegExp, teks: string): number | null => {
  const m = re.exec(teks);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

export const hitungHasil = (id: TestFramework['id'], teks: string): TestCounts | null => {
  const c: Hitung = { passed: 0, failed: 0, skipped: 0, total: 0 };

  if (id === 'cargo') {
    const m = /test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored[^\n]*/g;
    let mm: RegExpExecArray | null;
    let ketemu = false;
    while ((mm = m.exec(teks)) !== null) {
      ketemu = true;
      c.passed += Number(mm[2]);
      c.failed += Number(mm[3]);
      c.skipped += Number(mm[4]);
    }
    if (!ketemu) return null;
    c.total = c.passed + c.failed + c.skipped;
    return c;
  }

  const vitest = /Tests\s+(\d+) failed[^\n]*\n[^\n]*Tests\s+(\d+) passed/i.exec(teks);
  if (vitest) {
    c.failed = Number(vitest[1]);
    c.passed = Number(vitest[2]);
    c.skipped = ambilAngka(/Tests\s+(\d+) skipped/i, teks) ?? 0;
    c.total = c.passed + c.failed + c.skipped;
    return c;
  }

  const jest = /Tests:\s*([^\n]+)/.exec(teks);
  if (jest) {
    c.failed = ambilAngka(/(\d+) failed/, jest[1]) ?? 0;
    c.passed = ambilAngka(/(\d+) passed/, jest[1]) ?? 0;
    c.skipped = ambilAngka(/(\d+) skipped/, jest[1]) ?? 0;
    c.total = ambilAngka(/(\d+) total/, jest[1]) ?? c.passed + c.failed + c.skipped;
    return c;
  }

  const pytest = /(\d+) passed|(\d+) failed|(\d+) skipped/.test(teks);
  if (pytest && (id === 'pytest' || /===.*(passed|failed).*===/.test(teks))) {
    const baris = /(?:=+\s*)?([^\n=]*(?:\d+ (?:passed|failed|skipped|error)[^\n=]*))/.exec(teks);
    if (!baris) return null;
    const isi = baris[1];
    c.passed = ambilAngka(/(\d+) passed/, isi) ?? 0;
    c.failed = ambilAngka(/(\d+) failed/, isi) ?? 0;
    c.skipped = ambilAngka(/(\d+) skipped/, isi) ?? 0;
    const err = ambilAngka(/(\d+) error/, isi) ?? 0;
    c.failed += err;
    c.total = c.passed + c.failed + c.skipped;
    if (c.passed === 0 && c.failed === 0 && c.skipped === 0) return null;
    return c;
  }

  const go = /(?:^|\n)[\s]*ok\s+\S+/m.test(teks) || /FAIL\s+\S+/.test(teks);
  if (id === 'go' && go) {
    c.passed = new Set(teks.match(/(?:^|\n)ok\s+\S+/gm) ?? []).size;
    c.failed = new Set(teks.match(/(?:^|\n)FAIL\s+\S+/gm) ?? []).size;
    c.total = c.passed + c.failed;
    if (c.total === 0) return null;
    return c;
  }

  const total = /(\d+)\s+passed/.exec(teks);
  if (total) {
    c.passed = Number(total[1]);
    c.failed = ambilAngka(/(\d+)\s+failed/, teks) ?? 0;
    c.skipped = ambilAngka(/(\d+)\s+(?:skipped|pending)/, teks) ?? 0;
    c.total = c.passed + c.failed + c.skipped;
    return c;
  }

  return null;
};
