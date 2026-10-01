/*
 * The dragon mark: Zephyr's "Zeph is working" glyph.
 *
 * WHY a dragon: the wait indicator used to be a pulsing circle, then briefly a
 * rotating arc. Both are shapes anyone could ship and neither says whose work
 * is being waited on. The dragon is the product's own mark, so the row reads as
 * "Zeph is thinking" instead of "something is loading".
 *
 * Drawn as an actual dragon, not a ring with decoration: a serpentine body that
 * curves like an S, a head with a long snout and a jaw open to the right, two
 * horns swept back, a filled eye, four small legs with claws, a ridge of spines
 * down the back, and a spade tail. It is built on a 24x24 grid so the anatomy
 * survives being rendered at 15px, the size the transcript uses, and it stays
 * readable at 40px in the settings preview.
 *
 * When `terbang` is true the whole body bobs on a short arc — a wingbeat — and
 * the mark does NOT spin. Spinning a creature reads as a loading wheel; a small
 * vertical bob reads as something alive that is moving of its own accord, which
 * is what "still working" should look like.
 */
export default function NagaIkon({
  size = 15,
  terbang = false,
}: {
  size?: number;
  /** True while the model is still producing output. */
  terbang?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ai-naga${terbang ? ' is-terbang' : ''}`}
      aria-hidden="true"
    >
      {/*
       * Head and neck. The head sits at the left, higher than the body, facing
       * left; the neck runs down to the chest. Both jaw lines meet at the snout
       * tip so the mouth reads as open even at 15px.
       */}
      <path d="M5.1 5.2 C4.1 5.1 3.2 5.5 2.4 6.3" />
      <path d="M5.1 5.2 C4.3 4.6 3.4 4.3 2.5 4.4" />
      {/* Neck into the chest. */}
      <path d="M5.1 5.2 C6.0 6.1 6.2 7.4 5.8 8.6" />
      {/* Horns swept back from the skull. */}
      <path d="M6.6 5.0 L8.4 3.2" />
      <path d="M7.4 5.8 L9.3 4.6" />
      {/* Eye: filled, because an outline closes up into a blob at this size. */}
      <circle cx="4.5" cy="5.0" r="0.62" fill="currentColor" stroke="none" />

      {/*
       * Body: a serpentine S through the middle, then the tail sweeping up to
       * the right and ending in a spade. Two strokes so the curve keeps an even
       * thickness where it crosses itself.
       */}
      <path d="M5.8 8.6 C6.9 10.2 9.0 10.4 10.6 9.6 C12.6 8.6 14.8 8.8 16.2 10.4" />
      <path d="M16.2 10.4 C18.0 12.4 20.2 12.2 21.4 10.2" />
      {/* Spade tail. */}
      <path d="M21.4 10.2 L22.6 8.6 L21.0 8.3 Z" fill="currentColor" />

      {/* Spine ridge along the back. */}
      <path d="M8.2 9.5 L7.6 7.9" />
      <path d="M10.4 9.9 L10.2 8.2" />
      <path d="M12.6 9.5 L12.9 7.9" />
      <path d="M14.8 9.9 L15.4 8.4" />

      {/*
       * Legs. Four short strokes with a claw splay, placed where the belly
       * curves nearest the ground so they look attached rather than floating.
       */}
      <path d="M7.6 10.3 L6.9 12.7 M6.9 12.7 L6.1 13.4 M6.9 12.7 L7.1 13.7" />
      <path d="M11.4 10.0 L11.9 12.6 M11.9 12.6 L11.2 13.4 M11.9 12.6 L12.3 13.6" />
      <path d="M16.8 11.4 L17.4 13.8 M17.4 13.8 L16.6 14.5 M17.4 13.8 L17.9 14.7" />
    </svg>
  );
}
