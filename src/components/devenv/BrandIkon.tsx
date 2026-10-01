// Brand marks for the Dev Environment rows.
//
// The glyphs and colours come from `simple-icons` (CC0), so these are the
// tools' real marks rather than something redrawn by hand. Brand colour is
// intentionally literal: a Python mark in the theme's text colour would no
// longer be a Python mark.

import type { JSX } from 'react';
import {
  siNodedotjs,
  siPhp,
  siPython,
  siRust,
  siGit,
  siNginx,
  siApache,
  siMysql,
  siRedis,
  siPostgresql,
} from 'simple-icons/icons';

type Ikon = { title: string; hex: string; path: string };
type Props = { size?: number };

/** One official mark, tinted with its own brand colour. */
function Mark({ ikon, size = 18 }: { ikon: Ikon; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={ikon.title}
      fill={`#${ikon.hex}`}
    >
      <path d={ikon.path} />
    </svg>
  );
}

// A few marks are pure black by design, which disappears on a dark theme.
// For those the theme's own text colour reads better and still looks right.
const GELAP = new Set(['000000']);

export function BrandIkon({ id, size = 18 }: { id: string; size?: number }): JSX.Element | null {
  const ikon = PETA[id];
  if (!ikon) return null;
  if (GELAP.has(ikon.hex)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={ikon.title} fill="currentColor">
        <path d={ikon.path} />
      </svg>
    );
  }
  return <Mark ikon={ikon} size={size} />;
}

const PETA: Record<string, Ikon> = {
  node: siNodedotjs,
  php: siPhp,
  python: siPython,
  rust: siRust,
  git: siGit,
  nginx: siNginx,
  apache: siApache,
  mysql: siMysql,
  redis: siRedis,
  postgres: siPostgresql,
};

/** A folder for a project row: the accent colour, not a brand. */
export function FolderLogo({ size = 18 }: Props): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Project" fill="none">
      <path
        d="M3 6.4h5.6l1.8 2h10.6v9.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.6V6.4Z"
        fill="var(--accent)"
        opacity="0.9"
      />
    </svg>
  );
}

/** The clock for the job scheduler; there is no brand behind it. */
export function CronLogo({ size = 18 }: Props): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Jobs" fill="none">
      <circle cx="12" cy="12" r="9.4" fill="var(--accent)" />
      <path
        d="M12 6.6V12l3.6 2.4"
        stroke="var(--bg)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A terminal prompt for the PATH row. */
export function TerminalLogo({ size = 18 }: Props): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Terminal" fill="none">
      <rect x="2.6" y="4.2" width="18.8" height="15.6" rx="2" fill="var(--accent)" opacity="0.9" />
      <path
        d="M6.8 10.2l2.8 2.4-2.8 2.4M12.4 15h4.6"
        stroke="var(--bg)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A wrench for the runtimes-and-tools row. */
export function ToolsLogo({ size = 18 }: Props): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Tools" fill="none">
      <path
        d="M14.7 6.3a4.2 4.2 0 0 1 5.2-4 4.2 4.2 0 0 0-5.4 5.4L5.9 16.3a2.1 2.1 0 1 0 3 3l8.6-8.6"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
