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
          title: `Discard changes to ${confirm.paths[0]}?`,
          body: 'The changes will be lost PERMANENTLY (cannot be undone).',
          ok: tr('Discard changes'),
          danger: true,
        };
      case 'discard-all':
        return {
          title: `Discard changes to ${confirm.paths.length} files?`,
          body: 'The changes will be lost PERMANENTLY (cannot be undone).',
          ok: `Discard ${confirm.paths.length} files`,
          danger: true,
        };
      case 'delete-branch':
        return {
          title: `Delete branch ${confirm.name}?`,
          body: tr('Commits not merged into another branch will be lost PERMANENTLY.'),
          ok: tr('Delete branch'),
          danger: true,
        };
      case 'set-upstream':
        return {
          title: `Branch ${confirm.branch} has no upstream yet`,
          body: `Push and set the upstream to origin/${confirm.branch} at the same time?`,
          ok: 'Push & set upstream',
          danger: false,
        };
      case 'pull-first':
        return {
          title: `The remote has ${confirm.behind} new commits`,
          body: tr('Git will reject the push while those commits are not local. Pull first, then push?'),
          ok: 'Pull then push',
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
