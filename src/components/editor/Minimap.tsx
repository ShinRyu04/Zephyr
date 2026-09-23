import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useProblems, kunciPath } from '../../lib/problemsStore';

const LEBAR = 84;

const TINGGI_BARIS = 3;

const MAX_BARIS = 12000;

export const minimapDebug: {
  panggil: number;
  gambar: number;
  alasan: string | null;
  w: number;
  h: number;
} = { panggil: 0, gambar: 0, alasan: null, w: 0, h: 0 };

interface Props {
  view: EditorView | null;
  
  path?: string;
  renderCharacters: boolean;
  
  docVersion: number;
}

const bacaVar = (el: HTMLElement, nama: string, fallback: string): string => {
  const v = getComputedStyle(el).getPropertyValue(nama).trim();
  return v || fallback;
};

export default function Minimap({ view, path, renderCharacters, docVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  
  const timerRef = useRef<number | null>(null);
  
  const fnRef = useRef<{ gambar: () => void; viewport: () => void }>({
    gambar: () => {},
    viewport: () => {},
  });
  const [viewport, setViewport] = useState({ atas: 0, tinggi: 0 });

  const diagList = useProblems((s) =>
    path ? (s.byFile.get(kunciPath(path))?.length ?? 0) : 0,
  );

  const gambar = useCallback(() => {
    minimapDebug.panggil++;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !view) {
      minimapDebug.alasan = `canvas=${!!canvas} host=${!!host} view=${!!view}`;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tinggiHost = host.clientHeight;
    if (tinggiHost <= 0) {
      minimapDebug.alasan = `tinggiHost=${tinggiHost}`;
      return;
    }

    canvas.width = Math.floor(LEBAR * dpr);
    canvas.height = Math.floor(tinggiHost * dpr);
    canvas.style.width = `${LEBAR}px`;
    canvas.style.height = `${tinggiHost}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      minimapDebug.alasan = 'getContext null';
      return;
    }
    minimapDebug.gambar++;
    minimapDebug.alasan = null;
    minimapDebug.w = canvas.width;
    minimapDebug.h = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LEBAR, tinggiHost);

    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, tinggiHost / Math.max(barisTampil, 1));

    const warnaTeks = bacaVar(host, '--fg2', '#8b98a5');
    const warnaKomentar = bacaVar(host, '--syntax-comment', '#5c6773');
    const warnaError = bacaVar(host, '--danger', '#f04747');

    ctx.globalAlpha = 0.75;

    for (let i = 0; i < barisTampil; i++) {
      const nomor = i * langkah + 1;
      if (nomor > totalBaris) break;
      const teks = doc.line(nomor).text;
      if (teks.trim().length === 0) continue;

      const y = i * skala;
      const indent = teks.length - teks.trimStart().length;
      const komentar = /^\s*(\/\/|#|\*|--|<!--)/.test(teks);
      ctx.fillStyle = komentar ? warnaKomentar : warnaTeks;

      if (renderCharacters) {
        
        const maxKar = Math.min(teks.length, Math.floor(LEBAR / 1.1));
        for (let k = indent; k < maxKar; k++) {
          if (teks[k] === ' ' || teks[k] === '\t') continue;
          ctx.fillRect(k * 1.1, y, 0.9, Math.max(skala - 0.6, 0.8));
        }
      } else {
        const x = Math.min(indent * 1.1, LEBAR - 4);
        const panjang = Math.min((teks.trimEnd().length - indent) * 1.1, LEBAR - x);
        ctx.fillRect(x, y, Math.max(panjang, 1), Math.max(skala - 0.8, 0.8));
      }
    }

    if (path) {
      const list = useProblems.getState().byFile.get(kunciPath(path)) ?? [];
      ctx.globalAlpha = 0.95;
      for (const d of list) {
        if (d.severity !== 'error' && d.severity !== 'warning') continue;
        ctx.fillStyle = d.severity === 'error' ? warnaError : bacaVar(host, '--warning', '#e0a030');
        const y = ((d.line - 1) / langkah) * skala;
        ctx.fillRect(0, Math.max(y - 0.5, 0), LEBAR, Math.max(skala, 2));
      }
    }
    ctx.globalAlpha = 1;
  }, [view, path, renderCharacters]);

  const perbaruiViewport = useCallback(() => {
    const host = hostRef.current;
    if (!host || !view) return;
    const tinggiHost = host.clientHeight;
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, tinggiHost / Math.max(barisTampil, 1));

    const scroller = view.scrollDOM;
    const barisAtas = doc.lineAt(view.lineBlockAtHeight(scroller.scrollTop).from).number;
    const barisBawah = doc.lineAt(
      view.lineBlockAtHeight(scroller.scrollTop + scroller.clientHeight - 1).from,
    ).number;

    setViewport({
      atas: ((barisAtas - 1) / langkah) * skala,
      tinggi: Math.max(((barisBawah - barisAtas + 1) / langkah) * skala, 6),
    });
  }, [view]);

  const jadwalkan = useCallback(() => {
    
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      
      fnRef.current.gambar();
      fnRef.current.viewport();
    }, 16);
  }, []);

  fnRef.current = { gambar, viewport: perbaruiViewport };

  useLayoutEffect(() => {
    jadwalkan();
  }, [jadwalkan, view, docVersion, diagList, renderCharacters]);

  useEffect(() => {
    if (!view) return;
    const scroller = view.scrollDOM;
    const onScroll = () => perbaruiViewport();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    
    jadwalkan();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view, perbaruiViewport, jadwalkan]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => jadwalkan());
    ro.observe(host);
    return () => ro.disconnect();
  }, [jadwalkan]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        
        timerRef.current = null;
      }
    },
    [],
  );

  const lompat = (clientY: number) => {
    const host = hostRef.current;
    if (!host || !view) return;
    const rect = host.getBoundingClientRect();
    const doc = view.state.doc;
    const totalBaris = doc.lines;
    const langkah = totalBaris > MAX_BARIS ? Math.ceil(totalBaris / MAX_BARIS) : 1;
    const barisTampil = Math.ceil(totalBaris / langkah);
    const skala = Math.min(TINGGI_BARIS, rect.height / Math.max(barisTampil, 1));
    const baris = Math.min(
      Math.max(Math.round(((clientY - rect.top) / skala) * langkah) + 1, 1),
      totalBaris,
    );
    const pos = doc.line(baris).from;
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lompat(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) lompat(e.clientY);
  };

  return (
    <div
      ref={hostRef}
      className="cm-minimap"
      data-testid="minimap"
      data-chars={renderCharacters ? '1' : '0'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      role="presentation"
    >
      <canvas ref={canvasRef} data-testid="minimap-canvas" />
      <div
        className="cm-minimap-viewport"
        data-testid="minimap-viewport"
        style={{ transform: `translateY(${viewport.atas}px)`, height: `${viewport.tinggi}px` }}
      />
    </div>
  );
}
