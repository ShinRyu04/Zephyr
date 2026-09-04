// RestrictedBanner.tsx — banner "Restricted Mode" (fase 29).
//
// Dipasang di atas area editor, bukan di sidebar: sidebar bisa disembunyikan
// dan banner keamanan tidak boleh ikut hilang. Selalu ada tombol Manage Trust
// supaya keadaan ini bisa diubah dari tempat ia diberitakan.

import { useWs } from '../../lib/workspaceStore';

export default function RestrictedBanner() {
  const alasan = useWs((s) => s.alasan);
  const activeRoot = useWs((s) => s.activeRoot);
  const tanya = useWs((s) => s.tanya);
  const perluTanya = useWs((s) => s.perluTanya);

  if (!alasan) return null;

  return (
    <div className="restricted-banner" data-testid="restricted-banner" role="status">
      <svg viewBox="0 0 16 16" className="rb-icon" aria-hidden="true">
        <path
          d="M8 2l6 12H2L8 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M8 6.5v3.2M8 11.6v.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span className="rb-text">{alasan}</span>
      <button
        className="btn btn-sm"
        data-testid="rb-manage"
        onClick={() => tanya(activeRoot || null)}
      >
        {perluTanya ? 'Pilih Trust' : 'Manage Trust'}
      </button>
    </div>
  );
}
