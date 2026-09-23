import { useEffect, useRef } from 'react';
import { useGit } from '../../lib/gitStore';

import { useFocusTrap } from '../../lib/useFocusTrap';
import { useT } from '../../lib/i18n';

export default function ScmConfirmDialog() {
  const tr = useT();
  const confirm = useGit((s) => s.confirm);
  const setConfirm = useGit((s) => s.setConfirm);
  const resolveConfirm = useGit((s) => s.resolveConfirm);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirm) okRef.current?.focus();
  }, [confirm]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!confirm,
    onEscape: () => setConfirm(null),
  });

  if (!confirm) return null;

  const { title, body, ok, danger } = (() => {
    switch (confirm.kind) {
      case 'discard':
        return {
          title: `Buang perubahan pada ${confirm.paths[0]}?`,
          body: 'Perubahan akan hilang PERMANEN (tidak bisa undo).',
          ok: tr('Buang perubahan'),
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
          body: tr('Commit yang belum tergabung di branch lain akan hilang PERMANEN.'),
          ok: tr('Hapus branch'),
          danger: true,
        };
      case 'set-upstream':
        return {
          title: `Branch ${confirm.branch} belum punya upstream`,
          body: `Push sekaligus menyetel upstream ke origin/${confirm.branch}?`,
          ok: 'Push & set upstream',
          danger: false,
        };
      case 'pull-first':
        return {
          title: `Remote punya ${confirm.behind} commit baru`,
          body: tr('Push akan ditolak git selama commit itu belum ada di lokal. Pull dulu lalu push?'),
          ok: 'Pull lalu push',
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
      <div className="modal" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="scm-cf-title">
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
