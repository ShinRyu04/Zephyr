import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { ErrorBoundary } from './ErrorBoundary';

/*
 * The four workspace tools behind one rail entry.
 *
 * Dev Environment, API Client, SFTP and Tests all act on the local machine
 * rather than on the open file, and each already fills the editor area on its
 * own — none of them uses the side bar. Four rail icons for that was four
 * entries doing the same kind of job, so they share one entry and switch with
 * a tab strip instead.
 *
 * The views stay lazy: opening Tools costs one tab strip, and a view is only
 * fetched when its tab is first shown.
 */

const DevEnvView = lazy(() => import('../devenv/DevEnvView'));
const ApiClientView = lazy(() => import('../api/ApiClientView'));
const SftpView = lazy(() => import('../sftp/SftpView'));
const TestsView = lazy(() => import('./TestsView'));

type Tab = 'devenv' | 'api' | 'sftp' | 'tests';

const TABS: { id: Tab; label: string }[] = [
  { id: 'devenv', label: 'Dev Environment' },
  { id: 'api', label: 'API Client' },
  { id: 'sftp', label: 'SFTP' },
  { id: 'tests', label: 'Tests' },
];

export default function ToolsView() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('devenv');

  /*
   * Another part of the app can ask for a specific tab — the command palette
   * opens "Tests" directly, and the Dev Environment view jumps to its own
   * settings. `toolsTab` is that request; it is consumed once and then cleared
   * so switching tabs by hand afterwards is not overridden on the next render.
   */
  const minta = useStore((s) => s.toolsTab);
  const setToolsTab = useStore((s) => s.setToolsTab);

  useEffect(() => {
    if (!minta) return;
    setTab(minta as Tab);
    setToolsTab(null);
  }, [minta, setToolsTab]);

  return (
    <div className="tools-root" data-testid="tools-view">
      <div className="tools-tabs" role="tablist" aria-label={tr('Tools')}>
        {TABS.map((t) => {
          const aktif = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={aktif}
              className={`tools-tab${aktif ? ' is-active' : ''}`}
              data-testid={`tools-tab-${t.id}`}
              onClick={() => setTab(t.id)}
            >
              {tr(t.label)}
            </button>
          );
        })}
      </div>

      <div className="tools-body">
        <ErrorBoundary nama="Tools">
          <Suspense fallback={null}>
            {tab === 'devenv' && <DevEnvView />}
            {tab === 'api' && <ApiClientView />}
            {tab === 'sftp' && <SftpView />}
            {tab === 'tests' && <TestsView />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
