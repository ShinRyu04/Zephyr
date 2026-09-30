import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useTests, type TestFramework } from '../../lib/testsStore';
import { useT } from '../../lib/i18n';

const DEFAULT_TESTS = {
  framework: 'auto' as const,
  autoRunOnOpen: false,
  runOnSave: false,
  timeoutSeconds: 300,
};

const PILIHAN: { id: TestFramework['id'] | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'vitest', label: 'Vitest' },
  { id: 'jest', label: 'Jest' },
  { id: 'pytest', label: 'pytest' },
  { id: 'cargo', label: 'cargo test' },
  { id: 'go', label: 'go test' },
];

export default function TestsSection() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);

  const terdeteksi = useTests((s) => s.framework);
  const mendeteksi = useTests((s) => s.detecting);
  const detect = useTests((s) => s.detect);
  const jalankanSemua = useTests((s) => s.jalankanSemua);
  const sedangJalan = useTests((s) => s.running);

  const cfg =
    (settings as unknown as { tests?: Partial<typeof DEFAULT_TESTS> }).tests ?? DEFAULT_TESTS;

  const [hasil, setHasil] = useState<string | null>(null);

  useEffect(() => {
    void detect();
  }, [detect]);

  const jalankan = async () => {
    setHasil(null);
    const r = await jalankanSemua();
    if (!r) {
      setHasil(tr('Cannot run: this workspace has no test framework.'));
      return;
    }
    const c = r.counts;
    setHasil(
      c
        ? `${r.frameworkId}: ${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped (${r.ms} ms)`
        : `${r.frameworkId}: exit ${r.exitCode} (${r.ms} ms)`,
    );
  };

  const labelAuto = terdeteksi
    ? `${tr('Auto-detect')} (${terdeteksi.label})`
    : `${tr('Auto-detect')} (${tr('none')})`;

  return (
    <section className="set-section" data-testid="set-tests">
      <h2 className="set-h2">{tr('settings.tests')}</h2>
      <p className="set-note">
        {tr(
          'Zephyr finds the test framework from the project files. Override it here when the project mixes frameworks, then run the suite from the Tests panel at the bottom.',
        )}
      </p>

      <label className="set-row">
        <span className="set-label">{tr('Framework')}</span>
        <select
          className="set-input"
          data-testid="tests-framework"
          value={cfg.framework ?? 'auto'}
          onChange={(e) =>
            void applySettings({ tests: { framework: e.target.value as typeof cfg.framework } })
          }
        >
          {PILIHAN.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'auto' ? labelAuto : p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="set-row">
        <input
          type="checkbox"
          data-testid="tests-autorun"
          checked={cfg.autoRunOnOpen === true}
          onChange={(e) => void applySettings({ tests: { autoRunOnOpen: e.target.checked } })}
        />
        <span>{tr('Run tests when the workspace opens')}</span>
      </label>

      <label className="set-row">
        <input
          type="checkbox"
          data-testid="tests-runsave"
          checked={cfg.runOnSave === true}
          onChange={(e) => void applySettings({ tests: { runOnSave: e.target.checked } })}
        />
        <span>{tr('Re-run the test file when it is saved')}</span>
      </label>

      <label className="set-row">
        <span className="set-label">{tr('Stop tests after (seconds)')}</span>
        <input
          className="set-input set-input-num"
          type="number"
          min={10}
          max={3600}
          data-testid="tests-timeout"
          value={cfg.timeoutSeconds ?? 300}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 10 && n <= 3600) {
              void applySettings({ tests: { timeoutSeconds: n } });
            }
          }}
        />
      </label>

      <div className="set-row">
        <button
          className="btn btn-sm"
          data-testid="tests-run"
          disabled={sedangJalan}
          onClick={() => void jalankan()}
        >
          {sedangJalan ? tr('Running...') : tr('Run all tests')}
        </button>
        <button
          className="btn btn-sm"
          data-testid="tests-redetect"
          onClick={() => void detect()}
        >
          {mendeteksi ? tr('Detecting...') : tr('Re-detect')}
        </button>
        <span className="set-hint" data-testid="tests-detected">
          {tr('Terdeteksi')}: {terdeteksi ? `${terdeteksi.label} (${terdeteksi.command})` : tr('none')}
        </span>
      </div>

      {hasil && (
        <p className="set-note" data-testid="tests-last-run">
          {hasil}
        </p>
      )}
    </section>
  );
}
