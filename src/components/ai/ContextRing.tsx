import { memo } from 'react';

/*
 * The context ring: how full the window is, as one circle.
 *
 * This is the shape both transcripts use, and it exists so there is exactly one
 * of it. The ring was inside `ContextMeter`, which reads from the Chat AI store
 * — so the hosted Claude Code tab, whose numbers live in a different store
 * entirely, had no ring at all and no way to show that compaction was running.
 * Duplicating the SVG there would have produced two rings that drift apart on
 * the first change to either.
 *
 * The arc is drawn with `strokeDasharray` rather than a transform because that
 * is what makes the value legible at 11px: a partial arc reads as a quantity,
 * a rotated dot does not. The track underneath keeps the circle visible when
 * the value is near zero, which is when the reader most wants to know the ring
 * is there at all.
 */

/** Circumference of the r=6 circle, to two decimals. */
const KELILING = 2 * Math.PI * 6;

export type ContextRingProps = {
  /** 0..100, already clamped by the caller or here. */
  persen: number;
  /** Draws a moving arc and pulses, for "work is happening now". */
  sibuk?: boolean;
  size?: number;
  className?: string;
};

const ContextRing = memo(function ContextRing({
  persen,
  sibuk,
  size = 11,
  className,
}: ContextRingProps) {
  const p = Math.max(0, Math.min(100, Number.isFinite(persen) ? persen : 0));
  const panjang = (p / 100) * KELILING;
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      data-testid="ctx-ring"
      data-busy={sibuk ? '1' : '0'}
    >
      {/* The track: always the full circle, so a low value still reads as a
          ring rather than as nothing. */}
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${panjang} ${KELILING}`}
        transform="rotate(-90 8 8)"
        /* While compaction runs the arc is indeterminate: the model is deciding
           how much to keep, so there is no honest percentage to show and a
           frozen one would claim knowledge we do not have. */
        className={sibuk ? 'ctx-ring-spin' : undefined}
      />
    </svg>
  );
});

export default ContextRing;
