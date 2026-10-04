/*
 * The dragon mark - Zeph's own icon.
 *
 * A filled dragon with a cyan-to-blue gradient, drawn on a 24px grid. It is a
 * single solid shape rather than line art, so it holds together at 16px in a
 * menu row where a stroked outline would close up into a tangle.
 *
 * WHY THE OLD MARK WAS WRONG
 *
 * Zeph wore a generic robot head at first: the "some agent" glyph, identical to
 * what every other agent could wear, so the orchestrator had no mark of its own.
 * The replacement attempt was worse - a dragon invented inside the icon set,
 * sitting beside the one NagaIkon.tsx already draws for "Zeph is working" and
 * looking nothing like it. Two dragons, both claiming to be Zeph, and no way for
 * the user to tell which was real. This is that resolved: one drawing, the one
 * the product actually ships.
 *
 * The gradient needs an id, and ids are document-global in SVG - two of these on
 * one screen would collide and the second would render unfilled. React's
 * useId() gives each instance its own, which keeps the mark safe to draw
 * anywhere, including next to itself.
 */

import { useId } from 'react';

export default function DragonIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  const gradId = `dragon-${id.replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>

      <path
        fill={`url(#${gradId})`}
        d="M12 2
           C9 5 5 5 4 9
           C3 13 6 16 10 16
           C8 18 7 20 8 22
           C10 20 12 19 14 17
           C17 18 20 16 21 13
           C18 14 16 13 15 11
           C17 10 18 8 17 6
           C16 8 14 8 12 7
           C11 6 12 4 12 2Z"
      />
    </svg>
  );
}
