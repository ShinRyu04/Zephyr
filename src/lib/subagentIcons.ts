/*
 * The icon set for custom sub-agents.
 *
 * Same language as the rest of Zephyr's chrome: one stroke weight (1.4), one
 * 16px grid, round caps, `currentColor`. These replaced a heavier, more
 * ornamental set — the app's own icons (see AiIkon.tsx) are quiet line art, and
 * a sub-agent badge sitting in the same row as them has to match.
 *
 * They differ in SHAPE, not only in tint: the mark appears at 14px in a list,
 * where two round glyphs in different colours are one glyph to a colour-blind
 * reader and to anyone scanning quickly.
 */

export type SubagentIkonId =
  | 'kode'
  | 'tulis'
  | 'telaah'
  | 'audit'
  | 'jalan'
  | 'robot'
  | 'umum';

export interface IkonDef {
  id: SubagentIkonId;
  /** Path data, 16x16 viewBox, stroked. */
  d: string;
  /** Extra path drawn filled (dots, fills) when the mark needs one. */
  dFill?: string;
}

export const IKON_SUBAGENT: IkonDef[] = [
  {
    // Angle brackets: reading and navigating code.
    id: 'kode',
    d: 'M5.6 4.2 2.4 8l3.2 3.8 M10.4 4.2 13.6 8l-3.2 3.8 M9.2 3.2l-2.4 9.6',
  },
  {
    // Pencil: writing code or files.
    id: 'tulis',
    d: 'M11.2 2.8l2 2L5.4 12.6l-2.8.6.6-2.8z M10 4l2 2',
  },
  {
    // Magnifier with a line: reading and reporting, no changes.
    id: 'telaah',
    d: 'M7 2.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z M10.2 10.2 13.6 13.6 M5.2 7h3.6',
  },
  {
    // Shield with a tick: checking for problems and risks.
    id: 'audit',
    d: 'M8 1.8l5 1.8v4.6c0 2.8-2.1 4.7-5 5.8-2.9-1.1-5-3-5-5.8V3.6z M5.9 7.9l1.5 1.5 2.8-3.1',
  },
  {
    // Play in a box: running commands and tests.
    id: 'jalan',
    d: 'M2.6 3.6h10.8v8.8H2.6z M6.6 6.4l3.2 1.6-3.2 1.6z',
  },
  {
    /*
     * A robot head: the agent mark.
     *
     * It sits next to `umum` because both mean "no speciality", but they are
     * not the same claim: the star is a neutral placeholder, while the robot is
     * the glyph Zephyr already uses for an agent row and a sub-agent in flight.
     * A worker the user named and gave a persona to should be able to wear the
     * agent mark rather than a generic star.
     */
    id: 'robot',
    d: 'M8 2.2a1.5 1.5 0 0 1 1.4 1h3.2a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1h3.2a1.5 1.5 0 0 1 1.4-1z M8 1.2v1 M5.7 7.4v1.6 M10.3 7.4v1.6 M6.4 11h3.2',
  },
  {
    // A four-point star: general purpose, no speciality.
    id: 'umum',
    d: 'M8 2.2l1.4 4.4 4.4 1.4-4.4 1.4L8 13.8l-1.4-4.4L2.2 8l4.4-1.4z',
  },
];

/**
 * Human names for the picker.
 *
 * The keys are the stored values, so they never change; the strings are what
 * the user reads and go through `tr()` at the call site.
 */
export const IKON_LABEL: Record<SubagentIkonId, string> = {
  kode: 'Subagent: ikon baca kode',
  tulis: 'Subagent: ikon menulis',
  telaah: 'Subagent: ikon menelaah',
  audit: 'Subagent: ikon audit',
  jalan: 'Subagent: ikon menjalankan',
  robot: 'Subagent: ikon robot agen',
  umum: 'Subagent: ikon serbaguna',
};

/** The definition for an id, falling back to the general mark. */
export function ikonSubagent(id: string | undefined): IkonDef {
  return IKON_SUBAGENT.find((i) => i.id === id) ?? IKON_SUBAGENT[5];
}
