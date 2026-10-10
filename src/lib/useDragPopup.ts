import { useCallback, useEffect, useRef } from 'react';

/**
 * Make a floating popup draggable.
 *
 * The popup is moved by setting `--drag-x` / `--drag-y` CSS custom properties on
 * itself; its CSS uses `transform: translate(var(--drag-x), var(--drag-y))` so
 * layout is not disturbed during the drag.
 *
 * TWO WAYS TO START A DRAG, and the difference matters:
 *
 *  - `useDragPopup()` — only from an element marked `[data-drag-handle]`. For a
 *    popup with a title bar, that is the title. Use this when the body contains
 *    controls that would fight a drag (a list, a form, a canvas).
 *
 *  - `useDragEverywhere()` — from anywhere in the popup EXCEPT an interactive
 *    element. For dialogs whose whole surface is a short message and a couple of
 *    buttons: there is no title bar to grab, and "drag the box" is what every
 *    desktop dialog does.
 *
 * WHY THE INTERACTIVE CHECK IS A LIST, NOT A CLASS: the thing being excluded is
 * "whatever the browser would give the click to" — buttons, links, inputs,
 * selects, textareas, and anything explicitly marked `[data-no-drag]`. A single
 * marker class would require editing every dialog to add it, and the one that
 * forgot would produce a control that drags instead of pressing.
 */

/** Elements that keep their own pointer behaviour: pressing one must never drag. */
const INTERAKTIF = 'button, a, input, select, textarea, label, [contenteditable], [data-no-drag]';

function mulaiDrag(
  el: HTMLElement,
  e: React.PointerEvent,
): void {
  const style = window.getComputedStyle(el);
  const origX = parseFloat(style.getPropertyValue('--drag-x')) || 0;
  const origY = parseFloat(style.getPropertyValue('--drag-y')) || 0;

  const startX = e.clientX;
  const startY = e.clientY;
  let hidup = true;

  const onMove = (ev: PointerEvent) => {
    if (!hidup) return;
    el.style.setProperty('--drag-x', `${origX + (ev.clientX - startX)}px`);
    el.style.setProperty('--drag-y', `${origY + (ev.clientY - startY)}px`);
  };

  const onUp = () => {
    hidup = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  /* A cancelled pointer (the OS taking it away, a touch turning into a scroll)
     must end the drag too, or the popup follows the next gesture. */
  window.addEventListener('pointercancel', onUp);
}

export function useDragPopup() {
  const popupRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = popupRef.current;
    if (!el) return;

    // Only start drag from the handle, not from buttons/links inside it.
    const handle = (e.target as HTMLElement).closest('[data-drag-handle]');
    if (!handle || !el.contains(handle)) return;

    e.preventDefault();
    mulaiDrag(el, e);
  }, []);

  return { popupRef, onPointerDown };
}

/**
 * Drag from anywhere in the popup except its controls.
 *
 * Attach the handler to the POPUP CONTAINER, not to a header — it fires for
 * every press inside and decides for itself whether that press was meant to
 * move the box or press something.
 */
export function useDragEverywhere<T extends HTMLElement = HTMLDivElement>() {
  const popupRef = useRef<T | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = popupRef.current;
    if (!el) return;

    const target = e.target as HTMLElement;
    /* A press on a control belongs to that control. `closest` walks up, so this
       also excludes a press on an icon INSIDE a button. */
    if (target.closest(INTERAKTIF)) return;
    /* Text selection inside a dialog is a legitimate thing to want. Dragging
       from selected text would fight it, so a press that lands on a selection
       is left alone. */
    const pilihan = window.getSelection();
    if (pilihan && !pilihan.isCollapsed && pilihan.toString().trim() !== '') return;

    e.preventDefault();
    mulaiDrag(el, e);
  }, []);

  /*
   * Clear the offset when the popup unmounts.
   *
   * The custom properties live on the element, which React discards, so this is
   * belt-and-braces for the case where the same DOM node is reused (a portal
   * host, a keyed list): without it the next popup in that slot would open
   * already displaced by the last one's drag.
   */
  useEffect(
    () => () => {
      const el = popupRef.current;
      if (!el) return;
      el.style.removeProperty('--drag-x');
      el.style.removeProperty('--drag-y');
    },
    [],
  );

  return { popupRef, onPointerDown };
}
