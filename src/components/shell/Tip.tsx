import { useEffect, useRef, useState } from 'react';

/*
 * A hover label that cannot cover what it describes.
 *
 * The title-bar buttons used the browser's native `title`, which renders a wide
 * OS-drawn tooltip below the cursor. Anchored near the right edge it grew left
 * across the window and landed on the subagent panel's "Parallel tasks" button
 * directly underneath, so the button was unreadable and unclickable while the
 * tooltip was up.
 *
 * This one is ours: small, single-line, drawn above the button (the title bar
 * has nothing above it), and `pointer-events: none` so it can never intercept a
 * click even when it overlaps something.
 *
 * It also only shows after a short delay, so sweeping the mouse across the
 * title bar does not flash a label at every button.
 */

interface Props {
  label: string;
  /** Keyboard shortcut, shown as a separate key cap. */
  kbd?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Tip({ label, kbd, children, className }: Props) {
  const [tampil, setTampil] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const masuk = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTampil(true), 420);
  };

  const keluar = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setTampil(false);
  };

  return (
    <span
      className={`tip-wrap${className ? ` ${className}` : ''}`}
      onMouseEnter={masuk}
      onMouseLeave={keluar}
      onFocus={masuk}
      onBlur={keluar}
    >
      {children}
      {tampil && (
        <span className="tip" role="tooltip" data-testid="tip">
          {label}
          {kbd && <kbd className="tip-kbd">{kbd}</kbd>}
        </span>
      )}
    </span>
  );
}
