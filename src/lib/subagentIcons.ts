/*
 * The icon set for custom sub-agents.
 *
 * Same language as the rest of Zephyr's chrome: one stroke weight (1.4), one
 * 16px grid, round caps, `currentColor`. These replaced a heavier, more
 * ornamental set, the app's own icons (see AiIkon.tsx) are quiet line art, and
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
  tulis: 'Subagent: writing icon',
  telaah: 'Subagent: ikon menelaah',
  audit: 'Subagent: ikon audit',
  jalan: 'Subagent: running icon',
  robot: 'Subagent: ikon robot agen',
  umum: 'Subagent: ikon serbaguna',
};

/** The definition for an id, falling back to the general mark. */
export function ikonSubagent(id: string | undefined): IkonDef {
  return IKON_SUBAGENT.find((i) => i.id === id) ?? IKON_SUBAGENT[5];
}

/*
 * ============================================================================
 * THE ROLE MARK FOR A PERSONA
 * ============================================================================
 *
 * Each built-in persona gets the mark that matches what it DOES, so the row can
 * be recognised by shape before the name is read. The mapping lives here, next
 * to the glyphs themselves, for one reason: an icon set with two owners drifts.
 * Adding a persona means picking an id from this table, not drawing a new glyph.
 *
 * Keyed by persona id, and the fallback is the general mark - a persona whose
 * id is not in this table (one the user created) still gets a sensible glyph
 * rather than a blank cell.
 *
 * The ids are the ones IKON_SUBAGENT already defines, and the choices are
 * deliberate rather than decorative:
 *   zeph      - two droplets: the orchestrator, several workers as one mark
 *   coder     - angle brackets, because that is code
 *   architect - a box with a line through it, the only "drawing" glyph here
 *   reviewer  - a magnifier: reading and reporting, changing nothing
 *   security  - a shield with a tick
 *   designer  - a pencil, because design work produces an artefact
 */
const IKON_PERSONA: Record<string, SubagentIkonId> = {
  zeph: 'robot',
  coder: 'kode',
  architect: 'umum',
  reviewer: 'telaah',
  security: 'audit',
  designer: 'tulis',
};

/** The mark for a persona id, falling back to the general one. */
export function ikonPersona(id: string | undefined): IkonDef {
  return ikonSubagent(id ? IKON_PERSONA[id] : undefined);
}

/*
 * ============================================================================
 * THE AGENTS PAGE MARK
 * ============================================================================
 *
 * Two marks, not one, and the reason is worth writing down: the first is
 * borrowed deliberately and the second is ours. Shipping only the borrowed one
 * would make Zephyr's agent page look like a copy of another app's, and
 * shipping only ours throws away the shape people already recognise.
 *
 * Both are drawn on the same 16px grid with the same 1.4 stroke as everything
 * else here, so they sit correctly next to `IKON_SUBAGENT` glyphs. Each is
 * exported as raw path data (not a component) because the two call sites want
 * different wrappers: a plain `<svg>` in the sidebar, and a sized, class-carrying
 * svg inside the page header.
 */

/**
 * The Terax-style mark: a ring with a spark inside it.
 *
 * A ring says "a closed loop that runs on its own", and the spark inside says
 * "it works" - which is exactly what an agent is. This is the shape the user
 * pointed at, kept recognisable on purpose: a mark someone already associates
 * with agents needs no legend.
 */
export const IKON_AGEN_TERAX = {
  /* Two arcs, not a closed circle: the gap at 1 and 5 o'clock keeps the point
   * where the spark touches from reading as a plain bullseye at 16px. */
  d: 'M13.1 10.6A5.6 5.6 0 1 0 5.4 13.05',
  /* The spark: a four-point star, drawn filled so it stays legible at 14px. */
  dFill: 'M10.6 4.4l.75 1.95 1.95.75-1.95.75-.75 1.95-.75-1.95L7.9 7.1l1.95-.75z',
};

/**
 * Zephyr's own mark: a bar, blown to two droplets, in a ring.
 *
 * The bar is the shape Zephyr already uses for the prompt (`>_` in AiIkon.tsx),
 * so this mark is built from the app's own vocabulary rather than borrowed. The
 * two dots ARE that underscore, broken into a pair that reads as both a caret
 * and a pair of agents: one mark, split, working together. The ring carries the
 * same "runs on its own" meaning as above, so the two marks differ in what sits
 * inside, which is the part that says whose page this is.
 */
export const IKON_AGEN_ZEPHYR = {
  d: 'M13.1 10.6A5.6 5.6 0 1 0 5.4 13.05 M5.4 6.2l1.7 1.9-1.7 1.9',
  /* Two droplets: the underscore of `>_`, split. Drawn filled - at 2.2px across
   * an outlined dot reads as a smudge, a filled one reads as a dot. */
  dFill: 'M9.6 9.3a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9z M12.05 9.3a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9z',
};

