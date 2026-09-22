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
  /**
   * true = hanya glyph Z + sapuan angin, tanpa kotak latar & tanpa padding.
   * Dipakai di ruang sempit (menubar) supaya bentuknya mengisi penuh sisi
   * `size` — ikon ber-kotak menyisakan ~50% area jadi padding, sehingga
   * huruf Z-nya cuma ~7px saat size=15 dan tampak jauh lebih kecil daripada
   * logo aplikasi lain di bar tinggi 28px.
   */
  glyphOnly?: boolean;
  /**
   * true = warna glyph ikut teks di sekitarnya (--text-dim), bukan --text
   * terang. Dipakai di menubar supaya bobot visual logo seimbang dengan
   * label menu yang berwarna dim.
   */
  muted?: boolean;
}

/** Sapuan angin: garis melengkung (busur turun 26 unit di tengah). */
const WIND_TOP = 'M150 300 Q425 352 700 300';
const WIND_BOTTOM = 'M330 756 Q605 808 880 756';

/** Huruf Z — polygon, bukan font, supaya identik di semua mesin. */
const Z_PATH =
  'M268 300 L756 300 L756 396 L464 628 L756 628 L756 724 L268 724 L268 628 L560 396 L268 396 Z';

/**
 * Bounding box nyata isi logo (semua elemen kecuali kotak latar), diukur dari
 * DOM termasuk lebar stroke: gabungan path Z (268..756 / 300..724), dua sapuan
 * angin (stroke 42 melebar 21 unit ke luar), dan titik aksen (796..872 /
 * 257.5..334 — sisi atas dibulatkan setengah unit karena stroke titik aksen
 * menjorok 0.5 di luar lingkarnya). Dipakai sebagai viewBox di mode `glyphOnly`.
 */
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
  // muted = huruf memakai --text-muted supaya bobotnya setara label menu.
  // Di menubar TIDAK dipakai: logo di sana adalah brand mark, dan VS Code
  // (acuan terukur: logo 19px, 1.58x cap-height) justru memakai warna cerah
  // agar logo tetap jadi identitas walau teks di sebelahnya redup.
  const zFill = themed ? (muted ? 'var(--text-muted)' : 'var(--text)') : '#e8f0ff';
  const accent = themed ? 'var(--accent)' : '#3884ff';
  const stroke = themed ? 'var(--border)' : '#30363d';

  // Mode glyph: pangkas viewBox ke isi logo dan buang kotak latar, jadi
  // tinggi glyph benar-benar = `size` (bukan ~55% dari `size`).
  const viewBox = glyphOnly
    ? `${ISI_MIN_X} ${ISI_MIN_Y} ${ISI_W} ${ISI_H}`
    : '0 0 1024 1024';

  // Isi logo lebih lebar daripada tinggi; di kotak persegi ia harus muat,
  // jadi tinggi render = size, lebar mengikuti rasio.
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
