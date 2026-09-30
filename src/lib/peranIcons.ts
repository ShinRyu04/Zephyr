import type { PeranIkon } from './subagentRoles';

/*
 * Glyphs for the six built-in roles.
 *
 * These were text characters before — "⌕" "◈" "≡" "✓" "⚒" "⊕" — which is why
 * the role badge looked like decoration: a font decides how much ink a glyph
 * gets, so the marks came out at different weights, drifted in size between
 * Windows and Linux, and several of them were indistinguishable at 12px.
 *
 * Drawn to match the app's own chrome (AiIkon.tsx): one 16px grid, one stroke
 * weight, round caps, `currentColor`. Shape is the channel that matters — a
 * magnifier, a lined page, a list, a check, a hammer, a compass are six
 * different silhouettes at a glance, which is what a role badge has to be.
 */

export const IKON_PERAN: Record<PeranIkon, string> = {
  // Magnifier: searching the code.
  cari: 'M7 2.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z M10.2 10.2 13.6 13.6',

  // A lined page: reading it closely.
  telaah: 'M4 2.4h5.4l2.6 2.6v8.6H4z M9.4 2.4V5H12 M6 8h4 M6 10.6h4',

  // A numbered list: an ordered plan.
  rencana: 'M6.4 4.2h7 M6.4 8h7 M6.4 11.8h7 M2.4 4.2h1.4 M2.4 8h1.4 M2.4 11.8h1.4',

  // A check inside a circle: verified.
  audit: 'M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4z M5.6 8.1l1.7 1.7 3.1-3.5',

  // A hammer: doing the work.
  kerja: 'M9.4 2.6l3 3-1.3 1.3-3-3z M8.4 5.4 3.2 10.6V12.8h2.2l5.2-5.2 M9.7 6.8l1.3 1.3',

  // A compass: exploring outside the project.
  jelajah: 'M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4z M10.4 5.6 8.9 9.1 5.4 10.6l1.5-3.5z',
};

/**
 * The robot, for a worker the user defined themselves.
 *
 * A custom sub-agent is not one of the six roles, so it must not borrow a
 * role's mark — a magnifier on "Ryuga" claims it searches code, which is only
 * true if its author said so. The robot already means "an agent I own" on the
 * sub-agent rows, so reusing it here makes a custom worker recognisable in the
 * picker and in the panel without inventing a second vocabulary.
 */
export const IKON_KUSTOM =
  'M8 2.2a1.5 1.5 0 0 1 1.4 1h3.2a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1h3.2a1.5 1.5 0 0 1 1.4-1z M8 1.2v1 M5.7 7.4v1.6 M10.3 7.4v1.6 M6.4 11h3.2';

/** The path for a role icon, with the search mark as the fallback. */
export function pathIkonPeran(id: PeranIkon | string | undefined): string {
  if (id === 'custom') return IKON_KUSTOM;
  return (id && IKON_PERAN[id as PeranIkon]) || IKON_PERAN.cari;
}
