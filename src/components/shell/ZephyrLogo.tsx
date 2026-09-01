// ZephyrLogo.tsx — logo resmi Zephyr sebagai SVG.
//
// SATU sumber bentuk untuk seluruh app (empty state, About, favicon).
// Geometrinya SAMA PERSIS dengan ikon aplikasi `src-tauri/icon-source.png`
// (lihat scripts/gen_icon.py): viewBox 1024, radius 208, huruf Z polygon
// x 268..756 / y 300..724 dengan batang 96, dua sapuan angin, dan titik
// aksen di kanan atas. Kalau ikon diubah, ubah keduanya bersamaan.

interface Props {
  /** ukuran sisi dalam px */
  size?: number;
  className?: string;
  /** true = pakai warna token tema, false = warna asli ikon (untuk favicon) */
  themed?: boolean;
}

/** Sapuan angin: garis melengkung (busur turun 26 unit di tengah). */
const WIND_TOP = 'M150 300 Q425 352 700 300';
const WIND_BOTTOM = 'M330 756 Q605 808 880 756';

/** Huruf Z — polygon, bukan font, supaya identik di semua mesin. */
const Z_PATH =
  'M268 300 L756 300 L756 396 L464 628 L756 628 L756 724 L268 724 L268 628 L560 396 L268 396 Z';

export default function ZephyrLogo({ size = 88, className, themed = true }: Props) {
  const bgTop = themed ? 'var(--surface-2)' : '#121826';
  const bgBottom = themed ? 'var(--bg)' : '#0a0e18';
  const zFill = themed ? 'var(--text)' : '#e8f0ff';
  const accent = themed ? 'var(--accent)' : '#3884ff';
  const stroke = themed ? 'var(--border)' : '#30363d';

  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Logo Zephyr"
    >
      <defs>
        <linearGradient id="zephyr-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bgTop} />
          <stop offset="1" stopColor={bgBottom} />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="1020" height="1020" rx="208" fill="url(#zephyr-bg)" stroke={stroke} strokeWidth="4" />

      {/* angin di belakang huruf */}
      <path d={WIND_TOP} fill="none" stroke={accent} strokeWidth="26" strokeLinecap="round" opacity="0.35" />
      <path d={WIND_BOTTOM} fill="none" stroke={accent} strokeWidth="26" strokeLinecap="round" opacity="0.27" />

      <path d={Z_PATH} fill={zFill} />
      <circle cx="834" cy="296" r="38" fill={accent} />
    </svg>
  );
}
