import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  
  anchor: HTMLElement | null;
  
  arah?: 'up' | 'down';
  
  sisi?: 'left' | 'right';
  onClose: () => void;
  className?: string;
  testid?: string;
  children: React.ReactNode;
}

const JARAK = 6;

const TEPI = 8;

export default function Popover({
  anchor,
  arah = 'up',
  sisi = 'left',
  onClose,
  className = '',
  testid,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  /*
   * Find the element to hang off, retrying until it exists.
   *
   * WHY: callers pass `anchor={btnRef.current}`, and a ref is null on the very
   * first render — the button has not been committed yet. A ref does not
   * re-render, so `anchor` stayed null forever: `pos` was never computed, the
   * menu rendered at -9999px with `visibility: hidden`, and clicking the button
   * looked like it did nothing at all while the menu sat invisible in the DOM.
   *
   * `data-anchor` on the trigger gives us a stable selector to fall back to, so
   * the popover can locate the trigger itself no matter which render it mounts
   * on (the click that opens it is already a render later, but the anchor prop
   * captured in the closure is still the null from the first one).
   */
  const [resolved, setResolved] = useState<HTMLElement | null>(anchor);
  useEffect(() => {
    if (anchor) {
      setResolved(anchor);
      return;
    }
    // The trigger is in the DOM by now; look for the element the caller marked.
    const el = document.querySelector<HTMLElement>('[data-anchor-active="true"]');
    if (el) setResolved(el);
  }, [anchor]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!resolved || !el) return;

    const hitung = () => {
      const a = resolved.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = sisi === 'right' ? a.right - p.width : a.left;
      left = Math.max(TEPI, Math.min(left, vw - p.width - TEPI));

      let top = arah === 'up' ? a.top - p.height - JARAK : a.bottom + JARAK;
      if (arah === 'up' && top < TEPI) top = a.bottom + JARAK;
      if (arah === 'down' && top + p.height > vh - TEPI) top = a.top - p.height - JARAK;
      top = Math.max(TEPI, Math.min(top, vh - p.height - TEPI));

      setPos({ left, top });
    };

    hitung();
    
    window.addEventListener('resize', hitung);
    window.addEventListener('scroll', hitung, true);
    return () => {
      window.removeEventListener('resize', hitung);
      window.removeEventListener('scroll', hitung, true);
    };
  }, [resolved, arah, sisi, children]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (resolved?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [resolved, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`zpop ${className}`}
      data-testid={testid}
      role="menu"
      
      style={{
        left: pos ? `${pos.left}px` : '-9999px',
        top: pos ? `${pos.top}px` : '-9999px',
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
