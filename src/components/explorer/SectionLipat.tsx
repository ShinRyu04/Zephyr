import { useState, type ReactNode } from 'react';

/**
 * A collapsible section, shaped like VS Code's `> OUTLINE` / `> TIMELINE`.
 *
 * WHY THIS EXISTS: Outline and Timeline used to be their own icons in the
 * activity bar, which meant three rail buttons for one idea ("things about the
 * file I am looking at"). VS Code puts both at the BOTTOM of the Explorer as
 * collapsible sections, and Qoder copies it - so a reader coming from either
 * looks for them there, not in the rail.
 *
 * The header is a button, not a div with a click handler: it is keyboard
 * reachable, it reports `aria-expanded`, and a screen reader announces it as
 * something that opens. A `div` would look the same and be invisible to anyone
 * not using a mouse.
 *
 * COLLAPSED STATE IS LOCAL, deliberately. Remembering it across sessions would
 * mean a new settings key for something that describes how the reader is looking
 * at the tree RIGHT NOW; VS Code forgets it too, and the default (collapsed) is
 * the one that leaves the file tree the most room.
 */
export default function SectionLipat({
  judul,
  testid,
  bawaanBuka = false,
  jumlah,
  children,
}: {
  judul: string;
  testid: string;
  /** Start open. Off by default: the file tree is the reason the column exists. */
  bawaanBuka?: boolean;
  /** Optional count shown beside the title, like VS Code's symbol count. */
  jumlah?: number;
  children: ReactNode;
}) {
  const [buka, setBuka] = useState(bawaanBuka);

  return (
    <div className="sec-lipat" data-buka={buka ? '1' : '0'} data-testid={testid}>
      <button
        type="button"
        className="sec-lipat-head"
        data-testid={`${testid}-head`}
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        {/* A chevron that ROTATES rather than two different glyphs: the same
            element turning is what makes the state change read as movement
            instead of as a swap. */}
        <svg
          viewBox="0 0 16 16"
          className={`sec-lipat-chev${buka ? ' is-open' : ''}`}
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="sec-lipat-judul">{judul}</span>
        {typeof jumlah === 'number' && jumlah > 0 && (
          <span className="sec-lipat-jum" data-testid={`${testid}-jumlah`}>
            {jumlah}
          </span>
        )}
      </button>
      {buka && (
        <div className="sec-lipat-isi" data-testid={`${testid}-isi`}>
          {children}
        </div>
      )}
    </div>
  );
}
