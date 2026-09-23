import { useEffect, useRef } from 'react';

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
  
  aktif: boolean;
  
  onEscape?: () => void;
  
  fokusOtomatis?: boolean;
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  aktif,
  onEscape,
  fokusOtomatis = true,
}: OpsiFocusTrap) {
  const ref = useRef<T | null>(null);
  
  const sebelumnya = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aktif) return;
    const el = ref.current;
    if (!el) return;

    sebelumnya.current = document.activeElement as HTMLElement | null;

    if (fokusOtomatis) {
      const daftar = daftarFokusabel(el);
      
      const target = daftar.find((x) => x.hasAttribute('autofocus')) ?? daftar[0] ?? el;
      
      requestAnimationFrame(() => target.focus());
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
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
  }, [aktif, onEscape, fokusOtomatis]);

  return ref;
}
