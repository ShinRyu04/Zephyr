import { useEffect, useRef } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';

import { useFocusTrap } from '../../lib/useFocusTrap';

export default function ConfirmDialog() {
  const tr = useT();
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

  /*
   * Some close confirmations have NO unsaved file behind them.
   *
   * `requestCloseWindow` opens this dialog with an empty `tabIds` when
   * "Confirm before closing the window" is on and everything is already saved.
   * The dialog then asked "Save changes to this file?" with no file named and
   * nothing to save, and offered "Don't Save" - three buttons for a question
   * that is really yes/no. The text below is that second case, written as the
   * question actually being asked.
   */
  const keluarBiasa = confirm.intent === 'close-window' && remaining === 0;

  if (keluarBiasa) {
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
            {tr('Close Zephyr?')}
          </h2>
          <p className="modal-body">
            {tr(
              'The window will close. Your files are already saved, so nothing is lost. Turn this question off in Settings, General if you do not want to be asked.',
            )}
          </p>
          <div className="modal-actions">
            {/* Focus lands on the primary action so Enter closes; Escape cancels.
                A confirmation whose default key is "cancel" trains people to
                press Enter expecting it to proceed. */}
            <button ref={saveRef} className="btn btn-primary" onClick={() => void resolveConfirm('discard')}>
              {tr('Close')}
            </button>
            <button className="btn" onClick={() => void resolveConfirm('cancel')}>
              {tr('Cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
