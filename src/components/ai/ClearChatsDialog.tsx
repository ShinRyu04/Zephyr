import { useT } from '../../lib/i18n';
import { useEffect, useRef } from 'react';
import { useAi } from '../../lib/aiStore';
import { useDragPopup } from '../../lib/useDragPopup';

import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ClearChatsDialog() {
  const tr = useT();
  const open = useAi((s) => s.clearAllOpen);
  const jumlah = useAi((s) => s.sessions.length);
  const setOpen = useAi((s) => s.setClearAllOpen);
  const clearAll = useAi((s) => s.clearAllChats);
  const batalRef = useRef<HTMLButtonElement | null>(null);
  const { popupRef, onPointerDown } = useDragPopup();

  useEffect(() => {
    if (open) batalRef.current?.focus();
  }, [open]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: open,
    onEscape: () => setOpen(false),
  });

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div
        className="modal"
        ref={(el) => {
          /* Both refs, one node: the focus trap needs it to keep Tab inside,
           * and the drag hook needs it to move. A single callback ref that
           * feeds both is the only way to attach two without a wrapper div —
           * and a wrapper would break the trap's own bounds. */
          trapRef.current = el;
          popupRef.current = el;
        }}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clr-title"
      >
        {/* The title is the drag handle: a modal with no title bar still has a
            heading, and dragging from the text is what every desktop dialog
            does. Buttons below are excluded by the hook itself. */}
        <h2
          className="modal-title"
          id="clr-title"
          data-testid="clr-title"
          data-drag-handle
          onPointerDown={onPointerDown}
          style={{ cursor: 'grab' }}
        >
          {tr('Delete all chat history?')}
        </h2>
        <p className="modal-body" data-testid="clr-body">
          {jumlah} conversations will be deleted PERMANENTLY and cannot be recovered.
          One empty session will be opened afterward.
        </p>
        <div className="modal-actions">
          <button
            ref={batalRef}
            className="btn"
            data-testid="clr-cancel"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            data-testid="clr-ok"
            onClick={() => clearAll()}
          >
            {tr('Delete all')}
          </button>
        </div>
      </div>
    </div>
  );
}
