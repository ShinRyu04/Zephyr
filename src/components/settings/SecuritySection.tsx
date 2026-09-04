// SecuritySection.tsx — Settings → Keamanan (fase 29).
//
// Isinya keputusan Workspace Trust yang sudah tersimpan di trust.json.
// Yang ditampilkan STATUS NYATA dari Rust, bukan salinan frontend: daftar ini
// yang menentukan apakah tasks/debug/LSP/ekstensi boleh jalan, jadi kalau UI
// dan Rust berbeda, user akan mengira sudah percaya padahal ditolak.

import { useEffect } from 'react';

import { useWs } from '../../lib/workspaceStore';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function SecuritySection() {
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
        Folder yang belum dipercaya berjalan dalam <strong>Restricted Mode</strong>: file tetap bisa
        dibuka dan diedit, tapi tasks, debug, language server, dan ekstensi tidak dijalankan.
        Keputusan disimpan di <code>%APPDATA%\zephyr\trust.json</code> dan berlaku juga untuk
        subfolder.
      </p>

      <div className="set-row">
        <div className="set-row-label">
          <span>Workspace sekarang</span>
          <span className="set-hint" title={activeRoot}>
            {activeRoot ? baseOf(activeRoot) : 'belum ada folder terbuka'}
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
          <h3 className="set-h2 set-h2-sub">Root di workspace ini ({roots.length})</h3>
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
                  {r.trust === 'trusted' ? 'Jadikan Restricted' : 'Percayai'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="set-h2 set-h2-sub">Keputusan tersimpan ({daftar.length})</h3>
      {daftar.length === 0 ? (
        <p className="set-note">Belum ada folder yang pernah diberi keputusan trust.</p>
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
                title="Lupakan keputusan — folder akan ditanya lagi saat dibuka"
                onClick={() => void lupakanTrust(d.path)}
              >
                Lupakan
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
