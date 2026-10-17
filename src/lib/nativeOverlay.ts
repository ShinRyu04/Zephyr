/**
 * Does the app currently draw something ON TOP of a native webview pane?
 *
 * WHY THIS EXISTS. A browser pane is a native child WebView2 positioned over a
 * DOM rectangle, not an iframe. It is a real OS-level surface, so it sits ABOVE
 * the whole HTML document: z-index, stacking contexts and `position: fixed` do
 * not apply to it at all. Anything the app draws over that rectangle — a
 * dropdown menu, a modal, the command palette, a popup — is therefore covered
 * by the page, and the reader sees the menu "disappear" behind the browser.
 *
 * The only fix available is to HIDE the child webview while an overlay is up and
 * show it again when the overlay closes, which is what the two panes
 * (`components/agents/AgentsBrowser.tsx` and
 * `components/terminal/BrowserPane.tsx`) do with this predicate.
 *
 * Two rules keep it from hiding too eagerly:
 *
 *  1. An element counts only when it is ACTUALLY RENDERED. Plenty of menus in
 *     this app live in the DOM permanently and are shown by toggling a class, so
 *     matching on the selector alone would hide the page forever.
 *  2. Only overlays that can plausibly cover a pane are listed. Tooltips
 *     (`.tip-wrap`) are deliberately excluded: they follow the pointer, so
 *     including them would flicker the page off and on while the reader moves
 *     the mouse across the toolbar.
 */

/** Overlays that can cover a pane. Kept in one place so both panes agree. */
const SELEKTOR_OVERLAY = [
  /* Modals and full-screen overlays. */
  '.modal-backdrop',
  '.cp-overlay',
  '.cp-modal',
  '.trust-overlay',
  '[data-modal-terbuka]',
  '.ai-models-modal',
  /* Menus and popups — the case reported live ("menunya ketutup browsernya"). */
  '[role="menu"]',
  '[role="dialog"]',
  '[role="listbox"]',
  '.ag-menu',
  '.ai-model-menu',
  '.menubar-menu',
  '.ctx-menu',
  '.dropdown-menu',
].join(',');

/** True when an overlay is rendered over the page right now. */
export function overlayMenutupi(): boolean {
  let daftar: NodeListOf<Element>;
  try {
    daftar = document.querySelectorAll(SELEKTOR_OVERLAY);
  } catch {
    return false;
  }
  for (const el of daftar) {
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (Number(cs.opacity) === 0) continue;
    /* `getClientRects()` is the honest test for "has a box on screen": it is
       empty for `display: none`, for a detached node, and for a zero-size
       element — unlike `offsetParent`, which is also null for every
       `position: fixed` element. */
    if (el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    return true;
  }
  return false;
}

/**
 * Should the pane at this rectangle be visible?
 *
 * `rect` is the stage the native webview is positioned over. A pane is shown
 * only when its stage is really on screen AND nothing is drawn over it.
 */
export function paneHarusTampil(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (document.hidden) return false;
  if (overlayMenutupi()) return false;
  /* `offsetParent === null` means "no ancestor is laid out" — the tab is not the
     active one, the panel is closed, or an ancestor is `display: none`. */
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (r.bottom <= 0 || r.right <= 0) return false;
  if (r.top >= window.innerHeight || r.left >= window.innerWidth) return false;
  return true;
}
