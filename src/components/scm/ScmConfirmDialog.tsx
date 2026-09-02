// ScmConfirmDialog.tsx — konfirmasi operasi git yang tidak bisa di-undo
// (fase 10 §10.3). Dipisah dari ConfirmDialog editor supaya teks bahayanya
// spesifik: jumlah file + kata "PERMANEN".

import { useEffect, useRef } from 'react';
import { useGit } from '../../lib/gitStore';

export default function ScmConfirmDialog() {
  const confirm = useGit((s) => s.confirm);
  const setConfirm = useGit((s) => s.setConfirm);
  const resolveConfirm = useGit((s) => s.resolveConfirm);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirm) okRef.current?.focus();
  }, [confirm]);

  if (!confirm) return null;

  const { title, body, ok, danger } = (() => {
    switch (confirm.kind) {
      case 'discard':
        return {
          title: `Buang perubahan pada ${confirm.paths[0]}?`,
          body: 'Perubahan akan hilang PERMANEN (tidak bisa undo).',
          ok: 'Buang perubahan',
          danger: true,
        };
      case 'discard-all':
        return {
          title: `Buang perubahan pada ${confirm.paths.length} file?`,
          body: 'Perubahan akan hilang PERMANEN (tidak bisa undo).',
          ok: `Buang ${confirm.paths.length} file`,
          danger: true,
        };
      case 'delete-branch':
        return {
          title: `Hapus branch ${confirm.name}?`,
          body: 'Commit yang belum tergabung di branch lain akan hilang PERMANEN.',
          ok: 'Hapus branch',
          danger: true,
        };
      case 'set-upstream':
        return {
          title: `Branch ${confirm.branch} belum punya upstream`,
          body: `Push sekaligus menyetel upstream ke origin/${confirm.branch}?`,
          ok: 'Push & set upstream',
          danger: false,
        };
    }
  })();

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setConfirm(null);
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="scm-cf-title">
        <h2 className="modal-title" id="scm-cf-title" data-testid="scm-confirm-title">
          {title}
        </h2>
        <p className="modal-body" data-testid="scm-confirm-body">
          {body}
        </p>
        <div className="modal-actions">
          <button
            ref={okRef}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            data-testid="scm-confirm-ok"
            onClick={() => void resolveConfirm()}
          >
            {ok}
          </button>
          <button className="btn" data-testid="scm-confirm-cancel" onClick={() => setConfirm(null)}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
