/**
 * Geometry and surface tokens for the rebuilt Agents chrome.
 *
 * Every number is measured on the reference at 1x. They live in one module so
 * the two composer shapes (centred on the starting screen, docked inside the
 * chat card) cannot drift apart, and so a future measurement change is a single
 * edit rather than a hunt through CSS.
 */

export const agSurface = {
  titlebar: '#303030',
  sidebar: '#262626',
  canvas: '#171717',
  composerBox: '#222222',
} as const;

export const agBorder = {
  soft: '#3F4046',
  strong: '#5A5B63',
} as const;

export const agText = {
  primary: '#E5E5E5',
  secondary: '#D4D4D4',
  muted: '#A3A3A3',
  faint: '#737373',
} as const;

export const agMetrics = {
  /* Starting screen: composer centred in the canvas. */
  composerWidth: 772,
  boxHeight: 127,
  fieldHeight: 88,
  controlRowHeight: 39,
  folderBoxHeight: 45,

  /* Conversation: a 520px card, its composer 486px inside it. */
  chatCardWidth: 520,
  chatCardInset: 16,
  chatComposerWidth: 486,
  chatBoxHeight: 125,
  chatFieldHeight: 86,
  chatFolderBoxHeight: 42,
  chatCardRadius: 16,

  radius: 8,
  controlSize: 32,
  cardHeight: 37,
  cardGap: 28,
  cardIconSize: 14,
  headingSize: 26,
  headingGap: 55,
  cardsGap: 32,
} as const;
