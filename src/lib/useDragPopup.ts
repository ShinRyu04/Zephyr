import { useCallback, useRef } from 'react';

/**
 * Make a floating popup draggable by its header.
 *
 * Returns a ref to attach to the popup element, and a handler to put on the
 * drag handle (typically the popup's title/header row). The popup is moved by
 * setting `--drag-x` and `--drag-y` CSS custom properties on itself; the
 * popup's CSS uses `transform: translate(var(--drag-x), var(--drag-y))` so
 * layout is not disturbed during the drag.
 *
 * The drag only starts when the pointer goes down on an element marked with
 * `data-drag-handle` — the popup's title bar. Clicks on buttons, links, or any
 * other interactive element inside the popup do not trigger a drag.
 *
 * Usage:
 *   const { ref: popupRef, onPointerDown } = useDragPopup();
 *   <div ref={popupRef} style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}>
 *     <div data-drag-handle onPointerDown={onPointerDown}>Title</div>
 *     ...content...
 *   </div>
 */
export function useDragPopup() {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = popupRef.current;
    if (!el) return;

    // Only start drag from the handle, not from buttons/links inside it.
    const handle = (e.target as HTMLElement).closest('[data-drag-handle]');
    if (!handle || !el.contains(handle)) return;

    e.preventDefault();

    const style = window.getComputedStyle(el);
    const origX = parseFloat(style.getPropertyValue('--drag-x')) || 0;
    const origY = parseFloat(style.getPropertyValue('--drag-y')) || 0;

    dragState.current = { startX: e.clientX, startY: e.clientY, origX, origY };

    const onMove = (ev: PointerEvent) => {
      const s = dragState.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      el.style.setProperty('--drag-x', `${s.origX + dx}px`);
      el.style.setProperty('--drag-y', `${s.origY + dy}px`);
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return { popupRef, onPointerDown };
}
