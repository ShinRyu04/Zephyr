import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';

import { useFocusTrap } from '../../lib/useFocusTrap';
import { useDragEverywhere } from '../../lib/useDragPopup';
import { useT } from '../../lib/i18n';

export default function SaveIssueDialog() {
  const tr = useT();
  const issue = useStore((s) => s.saveIssue);
  const resolve = useStore((s) => s.resolveSaveIssue);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (issue) okRef.current?.focus();
  }, [issue]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!issue,
    onEscape: () => void resolve('cancel'),
  });
  const { popupRef, onPointerDown } = useDragEverywhere();

  if (!issue) return null;

  const missing = issue.kind === 'missing';
  const title = missing
    ? `${issue.name} no longer exists on disk`
    : `Save ${issue.name} as UTF-8?`;
  const body = missing
    ? `This file was deleted or moved outside Zephyr (${issue.path}). Create a new file at the same path with the current buffer contents?`
    : 'The original file is UTF-16. Zephyr will rewrite it as UTF-8 - the text contents stay the same, but the encoding on disk changes and the file becomes editable.';
  const ok = missing ? 'Create new' : tr('Write as UTF-8');

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') void resolve('cancel');
      }}
    >
      <div
        className="modal"
        ref={(el) => {
          /* Both refs on one node: the focus trap keeps Tab inside, the drag
             hook moves it. A wrapper would break the trap's own bounds. */
          trapRef.current = el;
          popupRef.current = el;
        }}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        onPointerDown={onPointerDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="si-title"
      >
        <h2 className="modal-title" id="si-title" data-testid="save-issue-title">
          {title}
        </h2>
        <p className="modal-body" data-testid="save-issue-body">
          {body}
        </p>
        <div className="modal-actions">
          <button
            ref={okRef}
            className="btn btn-primary"
            data-testid="save-issue-ok"
            onClick={() => void resolve('ok')}
          >
            {ok}
          </button>
          <button
            className="btn"
            data-testid="save-issue-cancel"
            onClick={() => void resolve('cancel')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
