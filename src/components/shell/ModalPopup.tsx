import { useEffect, type ReactNode } from 'react';
import { useDragPopup } from '../../lib/useDragPopup';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useT } from '../../lib/i18n';

/*
 * One floating surface for Settings, Extensions and Dev Tools.
 *
 * Why a shared frame: all three used to take over the whole editor area. The
 * reader lost the file they were reading to look at a preference, and "back"
 * meant finding the tab they had. VS Code and Zed both float these panels over
 * the work, and so does this: the editor stays visible behind the scrim, Escape
 * closes, and a click outside closes.
 *
 * The frame is deliberately dumb. It owns the scrim, the centring, the drag
 * handle, the Escape key and the focus trap; each page supplies its own body.
 * That way a page can never behave differently depending on how it was opened.
 */

export interface ModalPopupProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name AND the visible title in the header. */
  title: string;
  /** `data-testid` of the popup box, e.g. `settings-pop`. */
  testid: string;
  /** Optional extra button in the header ("Open in Editor"). */
  onOpenEditor?: () => void;
  /** Header button label for `onOpenEditor`. */
  openEditorLabel?: string;
  /** CSS width of the box; the frame never goes wider than the viewport. */
  width?: string;
  /** CSS height of the box. */
  height?: string;
  /** `data-testid` for the scrim, so a harness can assert the backdrop exists. */
  scrimTestid?: string;
  children: ReactNode;
}

export default function ModalPopup({
  open,
  onClose,
  title,
  testid,
  onOpenEditor,
  openEditorLabel,
  width = 'min(1080px, 92vw)',
  height = 'min(760px, 86vh)',
  scrimTestid,
  children,
}: ModalPopupProps) {
  const tr = useT();
  const { popupRef, onPointerDown } = useDragPopup();

  /* Focus trap: owns its own ref, so the same node must be handed to it. The
     drag hook needs the SAME element - one ref, passed to both. */
  const trapRef = useFocusTrap<HTMLDivElement>({ aktif: open, onEscape: onClose });

  /*
   * Escape closes, in the CAPTURE phase.
   *
   * Capture matters: the chat and the editor both listen for Escape (stop the
   * run / close find). Without capture, a Settings popup open over the chat
   * would close the run behind it instead of itself.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="mpop-scrim"
        data-testid={scrimTestid ?? `${testid}-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={(el) => {
          popupRef.current = el;
          trapRef.current = el;
        }}
        className="mpop"
        data-testid={testid}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width,
          height,
          transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))',
        }}
        onPointerDown={onPointerDown}
      >
        <div className="mpop-head" data-drag-handle>
          <span className="mpop-title">{title}</span>
          <span className="mpop-head-actions">
            {onOpenEditor && (
              <button
                className="btn btn-sm"
                data-testid={`${testid}-open-editor`}
                onClick={onOpenEditor}
              >
                {openEditorLabel ?? tr('Open in Editor')}
              </button>
            )}
            <button
              className="btn btn-sm"
              data-testid={`${testid}-close`}
              onClick={onClose}
            >
              {tr('Close')}
            </button>
          </span>
        </div>
        <div className="mpop-body">{children}</div>
      </div>
    </>
  );
}
