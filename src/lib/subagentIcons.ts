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
  | 'naga'
  | 'umum';

export interface IkonDef {
  id: SubagentIkonId;
  /** Path data, 16x16 viewBox, stroked. */
  d: string;
  /** Extra path drawn filled (dots, fills) when the mark needs one. */
  dFill?: string;
  /**
   * True when this mark is drawn by a dedicated component rather than `d`.
   *
   * The dragon is a filled gradient shape and cannot go through the stroked
   * `<svg><path>` the rest of the set uses. Renderers check this flag and
   * delegate to `<DragonIcon />` instead of trying to stroke an empty path -
   * which would draw nothing at all, silently.
   */
  punyaKomponen?: boolean;
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

/*
 * The dragon - Zeph's mark alone.
 *
 * It is deliberately NOT in `IKON_SUBAGENT`. That list is what a user picks from
 * when creating a custom sub-agent, and the dragon is the product's own mark for
 * the orchestrator: offering it there invites every custom worker to wear Zeph's
 * face, which is the same problem as the robot head in reverse - a mark that
 * means "some agent" instead of "this one".
 *
 * Kept as a definition so `ikonPersona` can return an id for Zeph rather than
 * falling through to the generic star, but `d` is empty: the drawing lives in
 * `DragonIcon`, a filled gradient shape that cannot go through the stroked
 * `<svg><path>` the rest of this set uses.
 *
 * The history is worth keeping. Zeph wore the generic robot head first, so the
 * orchestrator looked like every other agent. Then a dragon was invented inside
 * this file, sitting beside the one NagaIkon.tsx draws and looking nothing like
 * it: two creatures both called Zeph, and no way to tell which was real. A mark
 * that exists twice is worse than one that exists once. There is now one drawing,
 * and it is the one the product ships.
 */
export const IKON_NAGA: IkonDef = {
  id: 'naga',
  d: '',
  punyaKomponen: true,
};

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
  naga: 'Subagent: ikon naga Zephyr',
  umum: 'Subagent: ikon serbaguna',
};

/** The definition for an id, falling back to the general mark. */
export function ikonSubagent(id: string | undefined): IkonDef {
  /* Zeph's dragon is not in the pickable list, but it must still resolve here:
     every agent can be asked for its mark, and falling through to the generic
     star would make Zeph look like a custom worker that never chose an icon. */
  if (id === 'naga') return IKON_NAGA;
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
 *   zeph      - the dragon, the product's own mark and the one the transcript
 *               already shows while Zeph works (NagaIkon.tsx)
 *   coder     - angle brackets, because that is code
 *   architect - a box with a line through it, the only "drawing" glyph here
 *   reviewer  - a magnifier: reading and reporting, changing nothing
 *   security  - a shield with a tick
 *   designer  - a pencil, because design work produces an artefact
 */
const IKON_PERSONA: Record<string, SubagentIkonId> = {
  /*
   * Zeph wore the generic robot head, which reads as "some agent" - and it was
   * the same glyph every other agent could wear, so the orchestrator had no mark
   * of its own. The dragon is Zephyr's mark: it is already the working indicator
   * in the transcript, so picking Zeph from a list now shows the same creature
   * that appears in the conversation. The comment here also used to claim "two
   * droplets" while the value said `robot`; a comment that contradicts its code
   * is worse than no comment, because it is believed.
   */
  zeph: 'naga',
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
 * Zephyr's own mark: the dragon.
 *
 * This was a ring containing `>_` blown into two droplets - a prompt inside a
 * closed loop, meaning "a loop that runs on its own". It was a good mark for the
 * AGENTS page and it was not Zeph. The page is Zeph's, the orchestrator is Zeph,
 * and Zeph is the dragon, so the two should be one thing rather than a dragon in
 * the transcript and a prompt in the sidebar.
 *
 * Kept as the same `IKON_NAGA` object `ikonPersona` hands out for Zeph, not a
 * second copy: a mark that exists twice is worse than one that exists once,
 * because the user cannot tell which is real. Rendering goes through the shared
 * `<IkonAgen />`, which sees `punyaKomponen` and delegates to `<DragonIcon />`.
 */
export const IKON_AGEN_ZEPHYR = IKON_NAGA;

