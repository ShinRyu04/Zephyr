import { useEffect } from 'react';
import { useAiChatSettings } from '../../lib/chatSettingsStore';
import { useDragPopup } from '../../lib/useDragPopup';
import ChatSettingsPage from './ChatSettingsPage';

/*
 * The Chat Settings overlay — the page, floating over the chat.
 *
 * The page itself is `ChatSettingsPage`, unchanged: same sections, same search,
 * same rows. Only the frame differs, so a setting can never exist in one home
 * and not the other. The "Open in Editor" button in its header hands the reader
 * over to the full-height home, which is where VSCode puts the same choice.
 *
 * Rendered by `AiPanel` so it lands inside the chat surface; the editor host
 * draws the same page in `SplitEditor`. The store's `mode` decides which of the
 * two is showing, so they are never on screen together.
 */
export default function ChatSettingsPopup() {
  const { popupRef, onPointerDown } = useDragPopup();
  const buka = useAiChatSettings((s) => s.buka);
  const mode = useAiChatSettings((s) => s.mode);
  const tutup = useAiChatSettings((s) => s.tutup);
  const keEditor = useAiChatSettings((s) => s.keEditor);

  /* Escape closes the overlay. Capture phase, so the chat's own Escape
     handling does not also fire and treat the key as "stop the run". */
  useEffect(() => {
    if (!buka || mode !== 'popup') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        tutup();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, mode, tutup]);

  if (!buka || mode !== 'popup') return null;

  return (
    <>
      <div className="cset-scrim" data-testid="cset-scrim" onClick={tutup} />
      <div
        ref={popupRef}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        className="cset-pop"
        data-testid="cset-pop"
        role="dialog"
        aria-label="Chat Settings"
      >
        {/* The page's own header is the drag handle: it already carries the
            title and the buttons, and a second bar above it would be a frame
            around a frame. */}
        <div className="cset-pop-inner" data-drag-handle onPointerDown={onPointerDown}>
          <ChatSettingsPage onClose={tutup} onOpenEditor={keEditor} />
        </div>
      </div>
    </>
  );
}
