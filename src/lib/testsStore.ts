import { create } from 'zustand';
import {
  agentExec,
  fsExists,
  fsRead,
  scanDir,
  asZephyrError,
  type AgentExecResult,
} from './commands';
import { useStore } from './store';
import { useNotif } from './notificationStore';

export interface TestFramework {
  id:
    | 'vitest'
    | 'jest'
    | 'mocha'
    | 'ava'
    | 'node'
    | 'playwright'
    | 'pytest'
    | 'cargo'
    | 'go'
    | 'phpunit'
    | 'rspec'
    | 'dotnet';
  label: string;
  command: string;
  /**
   * Perintah coverage, bila framework ini punya jalurnya sendiri.
   *
   * `null` berarti framework terdeteksi tapi coverage tidak tersedia tanpa
   * memasang alat tambahan — tombolnya lalu tidak ditampilkan, bukan
   * ditampilkan lalu gagal.
   */
  coverageCommand?: string | null;
  /** Bentuk keluaran coverage, supaya persentasenya bisa dibaca. */
  coverageKind?: 'istanbul' | 'pytest' | 'go' | null;
}

export interface TestCoverage {
  /** Persentase baris (atau statements bila laporan hanya memberi itu). */
  lines: number | null;
  statements: number | null;
  branches: number | null;
  functions: number | null;
  raw: string;
  atMs: number;
  ms: number;
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
  coverage: TestCoverage | null;
  coverageRunning: boolean;
}

interface TestsActions {
  detect: (root?: string | null) => Promise<TestFramework | null>;
  jalankanSemua: () => Promise<TestRunResult | null>;
  /** Jalankan suite dengan pengukur coverage, lalu baca persentasenya. */
  jalankanCoverage: () => Promise<TestCoverage | null>;
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
  /*
   * Urutan penting: yang disebut LANGSUNG di skrip test menang atas yang
   * kebetulan terpasang sebagai dependency. Sebuah proyek bisa punya Jest
   * untuk tes lama dan Vitest untuk yang baru; yang dijalankan `npm test`
   * adalah yang tertulis di skripnya, dan itulah yang harus ditampilkan.
   */
  const scripts = bacaScript(json);
  const s = scripts.test ?? '';
  const pilih = (): TestFramework | null => {
    if (/vitest/i.test(s) || adaDep(json, 'vitest')) {
      return {
        id: 'vitest',
        label: 'Vitest',
        command: 'npm test --silent',
        coverageCommand: 'npx vitest run --coverage',
        coverageKind: 'istanbul',
      };
    }
    if (/jest/i.test(s) || adaDep(json, 'jest')) {
      return {
        id: 'jest',
        label: 'Jest',
        command: 'npm test --silent',
        coverageCommand: 'npx jest --coverage',
        coverageKind: 'istanbul',
      };
    }
    if (/mocha/i.test(s) || adaDep(json, 'mocha')) {
      return { id: 'mocha', label: 'Mocha', command: 'npm test --silent' };
    }
    if (/\bava\b/i.test(s) || adaDep(json, 'ava')) {
      return { id: 'ava', label: 'AVA', command: 'npm test --silent' };
    }
    if (/playwright/i.test(s) || adaDep(json, '@playwright/test')) {
      return { id: 'playwright', label: 'Playwright', command: 'npm test --silent' };
    }
    if (/node\s+--test|\bnode:test\b/i.test(s)) {
      return { id: 'node', label: 'node --test', command: 'npm test --silent' };
    }
    return null;
  };

  if (scripts.test) {
    const fw = pilih();
    if (fw) return fw;
    /* Skrip test yang tidak dikenal tetap bisa dijalankan; labelnya jujur
       menyebut bahwa framework-nya tidak dikenali, bukan menebak Vitest. */
    return { id: 'node', label: 'npm test', command: 'npm test --silent' };
  }
  return pilih();
};

const potong = (teks: string) => teks.trim();

export const useTests = create<TestsState & TestsActions>((set, get) => ({
  framework: null,
  detecting: false,
  detected: false,
  running: false,
  error: null,
  last: null,
  coverage: null,
  coverageRunning: false,

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
          const fw: TestFramework = {
            id: 'pytest',
            label: 'pytest',
            command: 'python -m pytest',
            /* Hanya berguna bila pytest-cov terpasang; bila tidak, perintahnya
               gagal dengan pesan "unrecognized arguments", dan itu terlihat
               jelas di output — lebih baik daripada tidak ada jalur sama
               sekali. */
            coverageCommand: 'python -m pytest --cov --cov-report=term',
            coverageKind: 'pytest',
          };
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
        const fw: TestFramework = {
          id: 'go',
          label: 'go test',
          command: 'go test ./...',
          /* `go test -cover` mencetak persentase per paket dan satu baris
             total, tanpa alat tambahan. */
          coverageCommand: 'go test -cover ./...',
          coverageKind: 'go',
        };
        set({ framework: fw, detecting: false, detected: true });
        return fw;
      }

      /*
       * Tiga ekosistem berikut ditambahkan karena tanpanya panel Tests
       * menjawab "no test framework" pada proyek yang jelas punya test —
       * dan jawaban itu membuat fiturnya tampak rusak, bukan terbatas.
       * Perintah coverage sengaja hanya diberikan bila alatnya ikut framework
       * (pytest-cov tidak selalu ada), jadi `pytest --cov` butuh paket itu;
       * `coverage` di Settings bisa disetel sendiri lewat tasks.json.
       */
      if (await fsExists(pakai('composer.json'))) {
        const res = await fsRead(pakai('composer.json'), 'utf8').catch(() => null);
        if (res && /phpunit/i.test(res.content)) {
          const fw: TestFramework = {
            id: 'phpunit',
            label: 'PHPUnit',
            command: 'vendor/bin/phpunit',
          };
          set({ framework: fw, detecting: false, detected: true });
          return fw;
        }
      }
      if (
        (await fsExists(pakai('Gemfile'))) ||
        (await fsExists(pakai('.rspec'))) ||
        (await fsExists(pakai('spec')))
      ) {
        const fw: TestFramework = { id: 'rspec', label: 'RSpec', command: 'bundle exec rspec' };
        set({ framework: fw, detecting: false, detected: true });
        return fw;
      }
      /*
       * .NET tidak punya nama berkas tetap: proyeknya adalah `*.csproj` atau
       * `*.sln` dengan nama bebas. Jadi folder akar DIPINDAI, bukan ditebak —
       * menebak `project.csproj` akan melaporkan "tidak ada framework" pada
       * proyek yang sebenarnya ada.
       */
      if (
        (await fsExists(pakai('Directory.Build.props'))) ||
        (await fsExists(pakai('global.json')))
      ) {
        const fw: TestFramework = { id: 'dotnet', label: 'dotnet test', command: 'dotnet test' };
        set({ framework: fw, detecting: false, detected: true });
        return fw;
      }
      const isiAkar = await scanDir(dir).catch(() => []);
      if (isiAkar.some((n) => /\.(csproj|sln|fsproj)$/i.test(n.name))) {
        const fw: TestFramework = { id: 'dotnet', label: 'dotnet test', command: 'dotnet test' };
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
      set({ error: 'no test framework detected' });
      useNotif.getState().notify({
        severity: 'warn',
        message: 'No test framework',
        detail: 'package.json (test/vitest/jest), pyproject (pytest), Cargo.toml, atau go.mod was not found.',
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
        message: 'Failed to run the test',
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

  jalankanCoverage: async () => {
    let fw = get().framework;
    if (!fw) fw = await get().detect();
    if (!fw?.coverageCommand) {
      useNotif.getState().notify({
        severity: 'warn',
        message: 'Coverage is not available for this framework',
        detail: `${fw ? fw.label : 'The framework'} has no coverage command in Zephyr yet.`,
        source: 'Tests',
      });
      return null;
    }

    set({ coverageRunning: true, error: null });
    let r: AgentExecResult;
    try {
      r = await agentExec(fw.coverageCommand, 900_000);
    } catch (e) {
      const msg = asZephyrError(e).message;
      set({ coverageRunning: false, error: msg });
      useNotif.getState().notify({
        severity: 'error',
        message: 'Coverage run failed',
        detail: msg,
        source: 'Tests',
      });
      return null;
    }

    const raw = [r.stdout, r.stderr].filter(Boolean).join('\n');
    const angka = bacaCoverage(fw.coverageKind ?? null, raw);
    const hasil: TestCoverage = {
      ...angka,
      /* Potongan ekor saja: tabel coverage bisa ribuan baris dan tidak ada
         gunanya menyimpan seluruhnya di memori UI. */
      raw: potong(raw).slice(-6_000),
      atMs: Date.now(),
      ms: r.ms,
    };
    set({ coverageRunning: false, coverage: hasil });
    return hasil;
  },

  bersihkan: () => set({ last: null, error: null, coverage: null }),
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

/**
 * Baca persentase coverage dari keluaran alat yang berbeda-beda.
 *
 * Tidak ada format bersama di antara mereka: Istanbul mencetak tabel dengan
 * kolom Stmts/Branch/Funcs/Lines, pytest mencetak satu baris TOTAL, dan Go
 * mencetak satu baris per paket. Yang dibaca di sini hanya angka yang MEMANG
 * ada di keluaran; kolom yang tidak dilaporkan tetap `null`, bukan 0 — 0%
 * berarti "tidak ada yang tercakup", dan itu klaim yang berbeda.
 */
export function bacaCoverage(
  kind: 'istanbul' | 'pytest' | 'go' | null,
  teks: string,
): Omit<TestCoverage, 'raw' | 'atMs' | 'ms'> {
  const kosong = { lines: null, statements: null, branches: null, functions: null };
  if (!kind) return kosong;

  if (kind === 'istanbul') {
    /* Baris total tabel: `All files | 85.71 | 80 | 90 | 85.71 |` (atau dengan
       kolom tambahan di akhir, tergantung reporter). */
    const m = /^\s*All files\s*\|([^\n]+)$/m.exec(teks);
    if (!m) return kosong;
    const kolom = m[1].split('|').map((x) => x.trim());
    const angka = (i: number) => {
      const v = Number.parseFloat((kolom[i] ?? '').replace('%', ''));
      return Number.isFinite(v) ? v : null;
    };
    return {
      statements: angka(0),
      branches: angka(1),
      functions: angka(2),
      lines: angka(3),
    };
  }

  if (kind === 'pytest') {
    /* `TOTAL      123      45     85%` — kolom terakhir yang berakhiran %
       adalah cakupan baris. */
    const m = /^TOTAL\s+.*?(\d+(?:\.\d+)?)%/m.exec(teks);
    if (!m) return kosong;
    const v = Number.parseFloat(m[1]);
    return { ...kosong, lines: Number.isFinite(v) ? v : null };
  }

  /* Go mencetak satu baris per paket; baris terakhir adalah angka keseluruhan
     yang dicetak `go test -cover ./...` di akhir run. */
  const semua = [...teks.matchAll(/coverage:\s*(\d+(?:\.\d+)?)%/g)];
  if (semua.length === 0) return kosong;
  const v = Number.parseFloat(semua[semua.length - 1][1]);
  return { ...kosong, lines: Number.isFinite(v) ? v : null };
}

export const hitungHasil = (id: TestFramework['id'], teks: string): TestCounts | null => {
  const c: Hitung = { passed: 0, failed: 0, skipped: 0, total: 0 };

  /* Mocha: ringkasan berakhir dengan `  12 passing (34ms)` / `  1 failing`. */
  if (id === 'mocha' || /\n\s*\d+ passing \(/.test(teks)) {
    const lulus = ambilAngka(/(\d+) passing/, teks);
    if (lulus !== null) {
      c.passed = lulus;
      c.failed = ambilAngka(/(\d+) failing/, teks) ?? 0;
      c.skipped = ambilAngka(/(\d+) pending/, teks) ?? 0;
      c.total = c.passed + c.failed + c.skipped;
      return c;
    }
  }

  /* AVA: `  12 tests passed` / `  1 test failed` / `  2 tests skipped`. */
  if (id === 'ava') {
    const lulus = ambilAngka(/(\d+) tests? passed/, teks);
    if (lulus !== null) {
      c.passed = lulus;
      c.failed = ambilAngka(/(\d+) tests? failed/, teks) ?? 0;
      c.skipped = ambilAngka(/(\d+) tests? skipped/, teks) ?? 0;
      c.total = c.passed + c.failed + c.skipped;
      return c;
    }
  }

  /* node --test (spec reporter): `# pass 12` / `ℹ pass 12`. */
  if (id === 'node' || /(?:^|\n)[#ℹ ]*pass \d+/m.test(teks)) {
    const lulus = /(?:^|\n)\s*(?:#|ℹ)?\s*pass (\d+)/m.exec(teks);
    if (lulus) {
      c.passed = Number(lulus[1]);
      const gagal = /(?:^|\n)\s*(?:#|ℹ)?\s*fail (\d+)/m.exec(teks);
      const lewati = /(?:^|\n)\s*(?:#|ℹ)?\s*skipped (\d+)/m.exec(teks);
      c.failed = gagal ? Number(gagal[1]) : 0;
      c.skipped = lewati ? Number(lewati[1]) : 0;
      c.total = c.passed + c.failed + c.skipped;
      return c;
    }
  }

  /* PHPUnit: `OK (12 tests, 34 assertions)` atau `Tests: 12, ... Failures: 1`. */
  if (id === 'phpunit') {
    const ok = /OK \((\d+) tests?/.exec(teks);
    if (ok) {
      c.passed = Number(ok[1]);
      c.total = c.passed;
      return c;
    }
    const gagal = /Tests:\s*(\d+)[^\n]*?Failures:\s*(\d+)/.exec(teks);
    if (gagal) {
      const total = Number(gagal[1]);
      c.failed = Number(gagal[2]);
      c.passed = Math.max(0, total - c.failed);
      c.total = total;
      return c;
    }
  }

  /* RSpec: `12 examples, 1 failure, 2 pending`. */
  if (id === 'rspec') {
    const m = /(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/.exec(teks);
    if (m) {
      c.total = Number(m[1]);
      c.failed = Number(m[2]);
      c.skipped = m[3] ? Number(m[3]) : 0;
      c.passed = Math.max(0, c.total - c.failed - c.skipped);
      return c;
    }
  }

  /* dotnet test: `Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12`. */
  if (id === 'dotnet') {
    const m = /Failed:\s*(\d+), Passed:\s*(\d+), Skipped:\s*(\d+), Total:\s*(\d+)/.exec(teks);
    if (m) {
      c.failed = Number(m[1]);
      c.passed = Number(m[2]);
      c.skipped = Number(m[3]);
      c.total = Number(m[4]);
      return c;
    }
  }

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
