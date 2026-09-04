// TrustDialog.tsx — dialog Workspace Trust (fase 29).
//
// Muncul saat folder belum pernah ditanya. Dua pilihan yang sama besar dan
// TIDAK ada tombol "X": brief menuntut keputusan, dan dialog yang bisa
// ditutup tanpa memilih akan meninggalkan folder di keadaan Unknown — yang
// artinya semua fitur eksekusi mati tanpa user tahu kenapa.
//
// Yang dijelaskan di sini adalah AKIBATNYA, bukan istilahnya: "tasks tidak
// akan jalan" lebih berguna daripada "restricted mode aktif".

import { useWs } from '../../lib/workspaceStore';

export default function TrustDialog() {
  const tanyaUntuk = useWs((s) => s.tanyaUntuk);
  const setTrust = useWs((s) => s.setTrust);
  const tanya = useWs((s) => s.tanya);
  const roots = useWs((s) => s.roots);

  if (!tanyaUntuk) return null;

  const root = roots.find((r) => r.path.toLowerCase() === tanyaUntuk.toLowerCase());
  const sudahRestricted = root?.trust === 'restricted';

  return (
    <div className="trust-overlay" data-testid="trust-dialog">
      <div className="trust-card" role="dialog" aria-modal="true" aria-labelledby="trust-title">
        <div className="trust-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path
              d="M12 3l7.5 3v6c0 4.2-3 7.6-7.5 9-4.5-1.4-7.5-4.8-7.5-9V6L12 3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M8.6 12.2l2.3 2.3 4.4-4.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h2 id="trust-title" className="trust-title">
          Percayai folder ini?
        </h2>
        <p className="trust-path" title={tanyaUntuk} data-testid="trust-path">
          {tanyaUntuk}
        </p>

        <p className="trust-text">
          Folder ini bisa memuat konfigurasi yang <strong>menjalankan program</strong> di komputer
          kamu — <code>tasks.json</code>, <code>launch.json</code>, language server, dan ekstensi.
        </p>

        <ul className="trust-list">
          <li>
            <strong>Percayai</strong> — tasks, debug, LSP, dan ekstensi berjalan normal.
          </li>
          <li>
            <strong>Restricted Mode</strong> — file tetap bisa dibuka dan diedit, tapi tidak ada
            yang dijalankan.
          </li>
        </ul>

        <div className="trust-actions">
          <button
            className="btn btn-primary"
            data-testid="trust-yes"
            onClick={() => void setTrust(tanyaUntuk, true)}
          >
            Percayai folder ini
          </button>
          <button
            className="btn"
            data-testid="trust-no"
            onClick={() => void setTrust(tanyaUntuk, false)}
          >
            Buka dalam Restricted Mode
          </button>
        </div>

        {sudahRestricted && (
          // Dialog yang dibuka lagi dari banner boleh ditutup: keputusan sudah
          // ada, jadi menutupnya tidak meninggalkan keadaan Unknown.
          <button className="trust-nanti" onClick={() => tanya(null)} data-testid="trust-close">
            Nanti saja
          </button>
        )}
      </div>
    </div>
  );
}
