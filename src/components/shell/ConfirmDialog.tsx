import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';

import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm);
  const tabs = useStore((s) => s.tabs);
  const resolveConfirm = useStore((s) => s.resolveConfirm);
  const saveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirm) saveRef.current?.focus();
  }, [confirm]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!confirm,
    onEscape: () => void resolveConfirm('cancel'),
  });

  if (!confirm) return null;

  const currentId = confirm.tabIds[0];
  const tab = tabs.find((t) => t.id === currentId);
  const remaining = confirm.tabIds.length;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') void resolveConfirm('cancel');
      }}
    >
      <div className="modal" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <h2 className="modal-title" id="cf-title">
          Save changes to {tab?.name ?? 'this file'}?
        </h2>
        <p className="modal-body">
          Changes will be lost if you do not save.
          {remaining > 1 && ` (${remaining} unsaved files)`}
        </p>
        <div className="modal-actions">
          <button ref={saveRef} className="btn btn-primary" onClick={() => void resolveConfirm('save')}>
            Save
          </button>
          <button className="btn btn-danger" onClick={() => void resolveConfirm('discard')}>
            Don't Save
          </button>
          <button className="btn" onClick={() => void resolveConfirm('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
