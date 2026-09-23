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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) return;

    const hitung = () => {
      const a = anchor.getBoundingClientRect();
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
  }, [anchor, arah, sisi, children]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor?.contains(t)) return;
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
  }, [anchor, onClose]);

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
