interface Props {

  size?: number;
  className?: string;

  themed?: boolean;

  glyphOnly?: boolean;

  muted?: boolean;
}

const WIND_TOP = 'M150 300 Q425 352 700 300';
const WIND_BOTTOM = 'M330 756 Q605 808 880 756';

const Z_PATH =
  'M268 300 L756 300 L756 396 L464 628 L756 628 L756 724 L268 724 L268 628 L560 396 L268 396 Z';

const ISI_MIN_X = 129;
const ISI_MIN_Y = 257.5;
const ISI_W = 772;
const ISI_H = 545.5;

export default function ZephyrLogo({
  size = 88,
  className,
  themed = true,
  glyphOnly = false,
  muted = false,
}: Props) {
  const bgTop = themed ? 'var(--surface-2)' : '#121826';
  const bgBottom = themed ? 'var(--bg)' : '#0a0e18';

  const zFill = themed ? (muted ? 'var(--text-muted)' : 'var(--text)') : '#e8f0ff';
  const accent = themed ? 'var(--accent)' : '#3884ff';
  const stroke = themed ? 'var(--border)' : '#30363d';

  const viewBox = glyphOnly
    ? `${ISI_MIN_X} ${ISI_MIN_Y} ${ISI_W} ${ISI_H}`
    : '0 0 1024 1024';

  const boxW = glyphOnly ? Math.round((size * ISI_W) / ISI_H) : size;

  return (
    <svg
      viewBox={viewBox}
      width={boxW}
      height={size}
      className={className}
      role="img"
      aria-label="Logo Zephyr"
    >
      {!glyphOnly && (
        <>
          <defs>
            <linearGradient id="zephyr-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={bgTop} />
              <stop offset="1" stopColor={bgBottom} />
            </linearGradient>
          </defs>
          <rect
            x="2"
            y="2"
            width="1020"
            height="1020"
            rx="208"
            fill="url(#zephyr-bg)"
            stroke={stroke}
            strokeWidth="4"
          />
        </>
      )}

      {/* angin di belakang huruf */}
      <path d={WIND_TOP} fill="none" stroke={accent} strokeWidth="42" strokeLinecap="round" opacity="0.35" />
      <path d={WIND_BOTTOM} fill="none" stroke={accent} strokeWidth="42" strokeLinecap="round" opacity="0.27" />

      <path d={Z_PATH} fill={zFill} />
      <circle cx="834" cy="296" r="38" fill={accent} />
    </svg>
  );
}
