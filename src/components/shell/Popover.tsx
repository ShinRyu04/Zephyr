// Popover.tsx — dropdown yang TIDAK bisa dipotong induknya.
//
// Kenapa ada: dropdown toolbar terminal (pilih shell, + Agent, kebab) dulu
// `position: absolute` di dalam `.tt-picker-wrap`. Panel bawah punya rantai
// `overflow: hidden` berlapis (.panel-root → .panel-body → .panel-term-host →
// .term-embedded), jadi menu yang naik ke atas KEPOTONG di batas panel dan
// `z-index` setinggi apa pun tidak menolong — clipping terjadi sebelum urutan
// tumpukan dipertimbangkan.
//
// Solusinya: render ke `document.body` lewat portal dengan `position: fixed`,
// koordinat dihitung dari rect tombol pemicunya. Karena di luar semua kontainer
// ber-overflow, menu selalu utuh; posisinya juga dijepit ke dalam viewport
// supaya tidak keluar layar di jendela kecil.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** elemen pemicu; posisi popover dihitung dari rect-nya */
  anchor: HTMLElement | null;
  /** 'up' = di atas anchor (default, panel ada di bawah layar) */
  arah?: 'up' | 'down';
  /** 'left' = tepi kiri sejajar anchor; 'right' = tepi kanan sejajar */
  sisi?: 'left' | 'right';
  onClose: () => void;
  className?: string;
  testid?: string;
  children: React.ReactNode;
}

/** Jarak popover dari tombol (px). */
const JARAK = 6;
/** Margin minimum dari tepi jendela. */
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

  // Hitung posisi setelah popover ada di DOM (butuh ukuran nyatanya).
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

      // Coba arah yang diminta; kalau tidak cukup ruang, balik.
      let top = arah === 'up' ? a.top - p.height - JARAK : a.bottom + JARAK;
      if (arah === 'up' && top < TEPI) top = a.bottom + JARAK;
      if (arah === 'down' && top + p.height > vh - TEPI) top = a.top - p.height - JARAK;
      top = Math.max(TEPI, Math.min(top, vh - p.height - TEPI));

      setPos({ left, top });
    };

    hitung();
    // Scroll/resize apa pun bisa menggeser anchor.
    window.addEventListener('resize', hitung);
    window.addEventListener('scroll', hitung, true);
    return () => {
      window.removeEventListener('resize', hitung);
      window.removeEventListener('scroll', hitung, true);
    };
  }, [anchor, arah, sisi, children]);

  // Klik di luar (popover DAN anchor) atau Escape menutup.
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
      // Sebelum posisi terhitung, sembunyikan supaya tidak berkedip di 0,0.
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
