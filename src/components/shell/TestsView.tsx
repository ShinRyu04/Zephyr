import { useEffect } from 'react';
import { useTests } from '../../lib/testsStore';
import { useT, tx } from '../../lib/i18n';

export default function TestsView() {
  const tr = useT();
  const framework = useTests((s) => s.framework);
  const detecting = useTests((s) => s.detecting);
  const detected = useTests((s) => s.detected);
  const running = useTests((s) => s.running);
  const error = useTests((s) => s.error);
  const last = useTests((s) => s.last);
  const detect = useTests((s) => s.detect);
  const jalankanSemua = useTests((s) => s.jalankanSemua);
  const jalankanCoverage = useTests((s) => s.jalankanCoverage);
  const coverage = useTests((s) => s.coverage);
  const coverageRunning = useTests((s) => s.coverageRunning);

  useEffect(() => {
    if (!detected && !detecting) void detect();
  }, [detected, detecting, detect]);

  const counts = last?.counts ?? null;

  return (
    <div className="tests-root" data-testid="tests-view">
      <div className="tests-toolbar">
        <button
          className="btn btn-sm tests-run"
          data-testid="tests-run-all"
          disabled={running || detecting || !framework}
          onClick={() => void jalankanSemua()}
        >
          {running ? (
            <>
              <span className="tests-spinner" data-testid="tests-spinner" aria-hidden="true" />
              {tr('Running…')}
            </>
          ) : (
            tr('Run all tests')
          )}
        </button>

        {/* Tombol coverage hanya muncul bila framework-nya punya jalur
            coverage. Tombol yang selalu ada lalu gagal dengan "tidak
            tersedia" lebih buruk daripada tombol yang memang tidak ada. */}
        {framework?.coverageCommand && (
          <button
            className="btn btn-sm"
            data-testid="tests-coverage-run"
            disabled={running || coverageRunning || detecting}
            title={framework.coverageCommand}
            onClick={() => void jalankanCoverage()}
          >
            {coverageRunning ? tr('Measuring coverage…') : tr('Run with coverage')}
          </button>
        )}

        {framework && (
          <span className="tests-framework" data-testid="tests-framework" title={framework.command}>
            {framework.label}
          </span>
        )}

        <span className="tests-spacer" />

        {last && (
          <span className="tests-time" data-testid="tests-time">
            {last.ms} ms
          </span>
        )}
      </div>

      {detecting && (
        <p className="tests-empty" data-testid="tests-detecting">
          {tr('Detecting test framework…')}
        </p>
      )}

      {!detecting && detected && !framework && (
        <p className="tests-empty" data-testid="tests-no-framework">
          {tr(
            'No test framework was detected. Add a "test" script to package.json, or a pyproject.toml / Cargo.toml / go.mod with tests.',
          )}
        </p>
      )}

      {error && (
        <p className="tests-error" data-testid="tests-error">
          {error}
        </p>
      )}

      {counts && (
        <div className="tests-summary" data-testid="tests-summary">
          <span className="tests-pill is-pass" data-testid="tests-passed">
            {counts.passed} {tr('passed')}
          </span>
          <span
            className={`tests-pill${counts.failed > 0 ? ' is-fail' : ''}`}
            data-testid="tests-failed"
          >
            {counts.failed} {tr('failed')}
          </span>
          {counts.skipped > 0 && (
            <span className="tests-pill" data-testid="tests-skipped">
              {counts.skipped} {tr('skipped')}
            </span>
          )}
        </div>
      )}

      {coverage && (
        <div className="tests-summary tests-cov" data-testid="tests-coverage">
          {coverage.lines !== null && (
            <span className="tests-pill" data-testid="tests-coverage-lines">
              {coverage.lines}% {tr('lines')}
            </span>
          )}
          {coverage.statements !== null && (
            <span className="tests-pill" data-testid="tests-coverage-statements">
              {coverage.statements}% {tr('statements')}
            </span>
          )}
          {coverage.branches !== null && (
            <span className="tests-pill" data-testid="tests-coverage-branches">
              {coverage.branches}% {tr('branches')}
            </span>
          )}
          {coverage.functions !== null && (
            <span className="tests-pill" data-testid="tests-coverage-functions">
              {coverage.functions}% {tr('functions')}
            </span>
          )}
          {coverage.lines === null &&
            coverage.statements === null &&
            coverage.branches === null &&
            coverage.functions === null && (
              <span className="tests-pill">{tr('No coverage summary in the output')}</span>
            )}
          <span className="tests-time" data-testid="tests-coverage-time">
            {coverage.ms} ms
          </span>
        </div>
      )}

      {last && !counts && (
        <p
          className={`tests-status${last.ok ? ' is-pass' : ' is-fail'}`}
          data-testid="tests-status"
        >
          {last.timedOut
            ? tr('Run timed out')
            : last.ok
              ? tr('Tests finished with exit code 0')
              : `${tr('Tests failed')} (exit ${last.exitCode})`}
        </p>
      )}

      {last?.truncated && (
        <p className="tests-trunc" data-testid="tests-truncated">
          {tr('Output was truncated; showing the tail only.')}
        </p>
      )}

      {last ? (
        <pre className="tests-output" data-testid="tests-output" tabIndex={0}>
          {last.raw || tx('(no output)')}
        </pre>
      ) : (
        !detecting &&
        framework && (
          <p className="tests-empty" data-testid="tests-idle">
            {tr('Run the test suite to see results here.')}
          </p>
        )
      )}
    </div>
  );
}
