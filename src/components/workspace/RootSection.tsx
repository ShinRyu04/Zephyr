// RootSection.tsx — satu root di Explorer multi-root (fase 29).
//
// Satu komponen per root: header bisa dilipat, badge git/trust, dan aksi
// per-root (jadikan aktif, hapus dari workspace). FileTree menerima prop
// `root` supaya isinya benar-benar milik root itu — bukan tree global yang
// difilter, karena `children` di explorerStore memang berkunci path.

import { useState } from 'react';

import { useStore } from '../../lib/store';
import { useWs } from '../../lib/workspaceStore';
import type { WsRoot } from '../../lib/types';
import FileTree from '../explorer/FileTree';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="ex-icon rs-chev" aria-hidden="true">
      <path
        d={open ? 'M4 6.5l4 4 4-4' : 'M6.5 4l4 4-4 4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function RootSection({ root, tunggal }: { root: WsRoot; tunggal: boolean }) {
  const [terbuka, setTerbuka] = useState(true);
  const aktifPath = useStore((s) => s.workspace);
  const jadikanAktif = useWs((s) => s.jadikanAktif);
  const hapusRoot = useWs((s) => s.hapusRoot);
  const tanya = useWs((s) => s.tanya);

  const isAktif = (aktifPath || '').toLowerCase() === root.path.toLowerCase();

  return (
    <div className={`root-section${isAktif ? ' is-active' : ''}`} data-root={root.path}>
      <div className="rs-head" data-testid="root-head">
        <button
          className="rs-toggle"
          onClick={() => setTerbuka((v) => !v)}
          title={root.path}
          aria-expanded={terbuka}
        >
          <Chevron open={terbuka} />
          <span className="rs-name">{root.name}</span>
        </button>

        <div className="rs-badges">
          {root.isRepo && (
            <span className="rs-badge rs-git" title="Folder ini repo git">
              git
            </span>
          )}
          {root.trust !== 'trusted' && (
            <button
              className="rs-badge rs-restricted"
              data-testid="root-restricted"
              title="Folder belum dipercaya — klik untuk mengatur trust"
              onClick={() => tanya(root.path)}
            >
              {root.trust === 'unknown' ? 'belum dipercaya' : 'restricted'}
            </button>
          )}
        </div>

        <div className="rs-actions">
          {!isAktif && (
            <button
              className="ex-btn"
              title="Jadikan root aktif"
              aria-label="Jadikan root aktif"
              data-testid="root-activate"
              onClick={() => void jadikanAktif(root.path)}
            >
              <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
                <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          )}
          {!tunggal && (
            <button
              className="ex-btn"
              title="Hapus folder dari workspace"
              aria-label="Hapus folder dari workspace"
              data-testid="root-remove"
              onClick={() => void hapusRoot(root.path)}
            >
              <svg viewBox="0 0 16 16" className="ex-icon" aria-hidden="true">
                <path d="M4 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {terbuka && (
        <div className="rs-body">
          <FileTree root={root.path} />
        </div>
      )}
    </div>
  );
}
