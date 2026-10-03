import { useEffect, useState } from 'react';

/*
 * The AI side of the chat avatar column, and the user side beside it.
 *
 * Why this is an SVG in the bundle and not a picture fetched from a URL:
 * Zephyr is a code editor that is expected to work with the network down. An
 * icon that has to be downloaded is missing exactly when the editor is being
 * used offline, arrives a beat late every time the panel opens (the bubble
 * jumps as it lands), and turns a third party's uptime into a dependency of
 * our own UI. Fetching it on every open would also be an outbound request the
 * user never asked for, which this project forbids. Drawing it locally costs a
 * few hundred bytes and has none of those failure modes.
 *
 * The colour is not decoration: it is what tells the two sides apart at a
 * glance when neither avatar is a photo. It is themeable through CSS variables
 * so it stays legible on a light theme as well - see `.ai-avatar-bot` in
 * ai-avatar.css, which owns both colours.
 *
 * A `title` is attached by the caller rather than drawn here, so the same
 * glyph can be labelled differently by whoever uses it.
 */

export function RobotAvatar({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="ai-avatar-bot"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      /* Decorative: the adjacent bubble already says who is speaking, and the
         label is repeated by the caller when it is not obvious. */
      aria-hidden="true"
      focusable="false"
    >
      {/* Antenna. The one asymmetric part, so the head reads as a robot rather
          than as a generic rounded badge at 22px. */}
      <line x1="12" y1="1.75" x2="12" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="1.9" r="1.35" fill="currentColor" />

      {/* Head. `fill` is the tinted plate, `stroke` the outline, so the shape
          survives being scaled down to 18px on a dense transcript. */}
      <rect
        className="ai-avatar-bot-head"
        x="3.6"
        y="5.2"
        width="16.8"
        height="12.4"
        rx="3.4"
        stroke="currentColor"
        strokeWidth="1.6"
      />

      {/* Eyes. Two, because one reads as a camera lens and none reads as a
          blank box - a face needs two marks to be seen as a face. */}
      <circle cx="9.1" cy="11.4" r="1.5" fill="currentColor" />
      <circle cx="14.9" cy="11.4" r="1.5" fill="currentColor" />

      {/* Mouth: a short bar, which is what makes the eyes read as eyes. */}
      <line x1="9.6" y1="14.5" x2="14.4" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

      {/* Ear pieces, which break the silhouette out of a plain rectangle. */}
      <line x1="1.9" y1="9.2" x2="1.9" y2="13.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="22.1" y1="9.2" x2="22.1" y2="13.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/*
 * The user's side.
 *
 * A photo when one is available, an initial when it is not. The initial is not
 * a placeholder standing in for something better - it is a complete answer for
 * anyone who has not chosen a photo and has not signed in to GitHub, and it is
 * derived from the name rather than hardcoded so it stays right after a rename.
 *
 * `onError` exists because a photo whose file was moved or deleted would
 * otherwise leave a broken-image glyph in the transcript forever: the element
 * is swapped for the initial, which is the same fallback the empty case uses.
 */
export function UserAvatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const [gagal, setGagal] = useState(false);
  /*
   * Reset the failure flag when the source changes: picking a NEW photo must
   * get a fresh chance even if the previous one was unreadable. Without this
   * the flag sticks and the new photo never appears.
   */
  useEffect(() => setGagal(false), [src]);

  const inisial = (name.trim()[0] ?? '?').toUpperCase();
  const tampil = src && !gagal;

  return tampil ? (
    <img
      className="ai-avatar-user"
      data-testid="ai-avatar-user"
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setGagal(true)}
    />
  ) : (
    <span className="ai-avatar-user ai-avatar-inisial" data-testid="ai-avatar-inisial" aria-hidden="true">
      {inisial}
    </span>
  );
}
