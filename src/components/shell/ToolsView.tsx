import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { ErrorBoundary } from './ErrorBoundary';

/*
 * The three workspace tools behind one rail entry.
 *
 * Dev Environment, API Client and SFTP all act on the local machine rather than
 * on the open file, and each already fills the editor area on its own — none of
 * them uses the side bar. Three rail icons for that was three entries doing the
 * same kind of job, so they share one entry and switch with a tab strip instead.
 *
 * TESTS WAS REMOVED, on request. It was a runner whose purpose was never
 * explained anywhere in the UI: a tab that listed commands nobody had written
 * yet, next to three tools that each do one obvious thing. A surface that has to
 * be asked about ("gunanya apa?") is a surface that has not earned its place, so
 * the tab is gone rather than documented. The command palette entry and the
 * Settings section went with it - three doors to a room nobody uses is worse
 * than no room.
 *
 * The views stay lazy: opening Tools costs one tab strip, and a view is only
 * fetched when its tab is first shown.
 */

const DevEnvView = lazy(() => import('../devenv/DevEnvView'));
const ApiClientView = lazy(() => import('../api/ApiClientView'));
const SftpView = lazy(() => import('../sftp/SftpView'));

type Tab = 'devenv' | 'api' | 'sftp';

const TABS: { id: Tab; label: string }[] = [
  { id: 'devenv', label: 'Dev Environment' },
  { id: 'api', label: 'API Client' },
  { id: 'sftp', label: 'SFTP' },
];

export default function ToolsView() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('devenv');

  /*
   * Another part of the app can ask for a specific tab — the Dev Environment view
   * jumps to its own settings. `toolsTab` is that request; it is consumed once
   * and then cleared so switching tabs by hand afterwards is not overridden on
   * the next render.
   *
   * A request for the removed 'tests' tab is IGNORED rather than throwing: a
   * saved layout or an old palette entry can still carry it, and a Tools window
   * that refuses to open because of a stale value is worse than one that opens
   * on Dev Environment.
   */
  const minta = useStore((s) => s.toolsTab);
  const setToolsTab = useStore((s) => s.setToolsTab);

  useEffect(() => {
    if (!minta) return;
    if (TABS.some((t) => t.id === minta)) setTab(minta as Tab);
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
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
