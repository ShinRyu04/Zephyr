import { useEffect } from 'react';

import { useWs } from '../../lib/workspaceStore';
import { useT } from '../../lib/i18n';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function SecuritySection() {
  const tr = useT();
  const daftar = useWs((s) => s.daftarTrust);
  const roots = useWs((s) => s.roots);
  const trusted = useWs((s) => s.trusted);
  const activeRoot = useWs((s) => s.activeRoot);
  const muatDaftarTrust = useWs((s) => s.muatDaftarTrust);
  const setTrust = useWs((s) => s.setTrust);
  const lupakanTrust = useWs((s) => s.lupakanTrust);
  const tanya = useWs((s) => s.tanya);

  useEffect(() => {
    void muatDaftarTrust();
  }, [muatDaftarTrust]);

  return (
    <div className="set-section" data-testid="set-security">
      <h2 className="set-h2">Workspace Trust</h2>
      <p className="set-note">
        {tr('Untrusted folders run in')} <strong>Restricted Mode</strong>
        {tr(': files can still be opened and edited, but tasks, debug, language servers, and extensions are not run. The decision is stored in')}{' '}
        <code>%APPDATA%\zephyr\trust.json</code>{' '}
        {tr('and also applies to subfolders.')}
      </p>

      <div className="set-row">
        <div className="set-row-label">
          <span>Current workspace</span>
          <span className="set-hint" title={activeRoot}>
            {activeRoot ? baseOf(activeRoot) : tr('no folder open yet')}
          </span>
        </div>
        <div className="set-row-control">
          <span
            className={`trust-row-level ${trusted ? 'is-trusted' : 'is-restricted'}`}
            data-testid="sec-status"
          >
            {trusted ? 'trusted' : 'restricted'}
          </span>
          {activeRoot && (
            <button className="btn btn-sm" data-testid="sec-manage" onClick={() => tanya(activeRoot)}>
              Manage Trust
            </button>
          )}
        </div>
      </div>

      {roots.length > 1 && (
        <>
          <h3 className="set-h2 set-h2-sub">Roots in this workspace ({roots.length})</h3>
          <div className="trust-rows" data-testid="sec-roots">
            {roots.map((r) => (
              <div className="trust-row" key={r.path}>
                <span className="trust-row-path" title={r.path}>
                  {r.path}
                </span>
                <span
                  className={`trust-row-level ${
                    r.trust === 'trusted' ? 'is-trusted' : 'is-restricted'
                  }`}
                >
                  {r.trust}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => void setTrust(r.path, r.trust !== 'trusted')}
                >
                  {r.trust === 'trusted' ? 'Make Restricted' : 'Trust'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="set-h2 set-h2-sub">Saved decisions ({daftar.length})</h3>
      {daftar.length === 0 ? (
        <p className="set-note">{tr('No folder has ever been given a trust decision.')}</p>
      ) : (
        <div className="trust-rows" data-testid="sec-trust-list">
          {daftar.map((d) => (
            <div className="trust-row" key={d.path} data-trust-path={d.path}>
              <span className="trust-row-path" title={d.path}>
                {d.path}
              </span>
              <span
                className={`trust-row-level ${
                  d.trust === 'trusted' ? 'is-trusted' : 'is-restricted'
                }`}
              >
                {d.trust}
              </span>
              <button
                className="btn btn-sm"
                title={tr('Forget the decision - the folder will be asked again when opened')}
                onClick={() => void lupakanTrust(d.path)}
              >
                Forget
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
