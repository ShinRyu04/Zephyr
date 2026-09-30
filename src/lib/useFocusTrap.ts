import { useEffect, useRef } from 'react';

/*
 * Keeps Tab inside a dialog and restores focus to whatever was focused before
 * it opened.
 *
 * Two things this must not do, both learned the hard way:
 *
 *  - Re-focus the first field on every render. The dialog passes `onEscape` as
 *    an inline arrow, so a naive effect keyed on it re-ran on every keystroke
 *    (each keystroke re-renders, which makes a new arrow). Typing a name in the
 *    sub-agent dialog threw focus onto the header's close button after the
 *    first character. The callback now lives in a ref, and the listener is
 *    attached once.
 *  - Auto-focus more than once. The initial focus belongs to opening the
 *    dialog, not to the component updating.
 */

const FOKUSABEL = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function daftarFokusabel(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOKUSABEL)].filter((el) => {
    if (el.hasAttribute('aria-hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

export interface OpsiFocusTrap {
  /** Trap is live. False leaves the dialog unmanaged (e.g. it is closing). */
  aktif: boolean;
  /** Escape pressed inside the trap. */
  onEscape?: () => void;
  /** Focus the first field when the trap turns on. Default true. */
  fokusOtomatis?: boolean;
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  aktif,
  onEscape,
  fokusOtomatis = true,
}: OpsiFocusTrap) {
  const ref = useRef<T | null>(null);

  /** Element that had focus before the dialog opened, so it can be restored. */
  const sebelumnya = useRef<HTMLElement | null>(null);

  /*
   * The latest callbacks, read at event time. Keeping them out of the effect's
   * dependency list is what stops the trap from re-arming on every render.
   */
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  const otomatisRef = useRef(fokusOtomatis);
  otomatisRef.current = fokusOtomatis;

  // Initial focus: runs when the trap turns on, and only then.
  useEffect(() => {
    if (!aktif) return;
    const el = ref.current;
    if (!el) return;

    sebelumnya.current = document.activeElement as HTMLElement | null;
    if (!otomatisRef.current) return;

    const daftar = daftarFokusabel(el);
    const target = daftar.find((x) => x.hasAttribute('autofocus')) ?? daftar[0] ?? el;
    requestAnimationFrame(() => target.focus());
  }, [aktif]);

  // Tab cycling and Escape: one listener for the lifetime of the trap.
  useEffect(() => {
    if (!aktif) return;
    const el = ref.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const cb = escRef.current;
        if (!cb) return;
        e.preventDefault();
        cb();
        return;
      }
      if (e.key !== 'Tab') return;

      const daftar = daftarFokusabel(el);
      if (daftar.length === 0) {
        e.preventDefault();
        return;
      }
      const pertama = daftar[0];
      const terakhir = daftar[daftar.length - 1];
      const aktifSekarang = document.activeElement as HTMLElement | null;

      if (!aktifSekarang || !el.contains(aktifSekarang)) {
        e.preventDefault();
        (e.shiftKey ? terakhir : pertama).focus();
        return;
      }

      if (e.shiftKey && aktifSekarang === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && aktifSekarang === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const balik = sebelumnya.current;
      if (balik && document.contains(balik)) balik.focus();
    };
  }, [aktif]);

  return ref;
}
