import { pathIkonCmd, warnaIkonCmd } from '../../lib/promptIcons';
import type { IkonCmd } from '../../lib/promptLibrary';

/*
 * A slash-command glyph.
 *
 * Same footprint as the file icon in the "@" list (16px, one column), so the
 * two popups line up when the user switches between them.
 *
 * The tint comes from the icon id, not from the row: session commands read blue,
 * prompt commands green, workspace commands amber. Shape still separates every
 * row on its own, so colour groups the list rather than carrying it alone.
 */
export default function CmdIkon({ nama }: { nama: IkonCmd | undefined }) {
  return (
    <span className="ai-cikon" data-ikon={nama} style={{ color: warnaIkonCmd(nama) }} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={pathIkonCmd(nama)} />
      </svg>
    </span>
  );
}
