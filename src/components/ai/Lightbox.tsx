import { useEffect, useState } from 'react';
import '../../styles/ai-lightbox.css';

/*
 * A full-screen viewer for an image attached to a message.
 *
 * WHY it exists: an attachment in the transcript renders at 88px, which is
 * enough to confirm it arrived and nowhere near enough to read it - a screenshot
 * of a UI, a photo of a receipt, a diagram with labels. Before this, clicking one
 * did nothing at all, so the only way to see an attached image properly was to
 * find the file on disk.
 *
 * Controls, and why each is here:
 * - Click anywhere / Escape / the X closes it. Three ways out because a modal
 *   that traps you is worse than no modal.
 * - Wheel (or +/-) zooms around the POINTER, not the centre: zooming toward a
 *   fixed centre means the detail you were looking at slides away, which is the
 *   single most annoying thing about a bad image viewer.
 * - Drag pans once the image is larger than the viewport.
 * - Double-click toggles between "fit" and 100%: the two positions that matter,
 *   without hunting for a zoom level.
 *
 * The backdrop is nearly opaque rather than pure black so the panel behind stays
 * faintly visible - it keeps the viewer feeling like part of the app instead of
 * a different program taking over the screen.
 */
export default function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(8, z * 1.25));
      if (e.key === '-') setZoom((z) => Math.max(0.2, z / 1.25));
      if (e.key === '0') { setZoom(1); setGeser({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ai-lb"
      data-testid="ai-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      onWheel={(e) => {
        e.preventDefault();
        const arah = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setZoom((z) => Math.min(8, Math.max(0.2, z * arah)));
      }}
      onMouseMove={(e) => {
        if (!drag) return;
        setGeser({ x: e.clientX - drag.x, y: e.clientY - drag.y });
      }}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
    >
      <img
        className="ai-lb-img"
        src={src}
        alt="Attachment"
        draggable={false}
        style={{ transform: `translate(${geser.x}px, ${geser.y}px) scale(${zoom})` }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag({ x: e.clientX - geser.x, y: e.clientY - geser.y });
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (zoom === 1) setZoom(2);
          else { setZoom(1); setGeser({ x: 0, y: 0 }); }
        }}
      />
      <div className="ai-lb-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ai-lb-btn" onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))} aria-label="Zoom out">−</button>
        <span className="ai-lb-zoom" data-testid="ai-lb-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="ai-lb-btn" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} aria-label="Zoom in">+</button>
        <button type="button" className="ai-lb-btn" onClick={() => { setZoom(1); setGeser({ x: 0, y: 0 }); }} aria-label="Reset">100%</button>
        <button type="button" className="ai-lb-btn is-close" data-testid="ai-lb-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
    </div>
  );
}
