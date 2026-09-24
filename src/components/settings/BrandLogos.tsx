/**
 * Brand logos for the About buttons and the donate dialog.
 *
 * These are the real marks, drawn as inline SVG so they inherit the theme
 * colour and stay sharp at any size. Keeping them here means the buttons do
 * not depend on an icon font or a network fetch.
 *
 * Path data:
 *   GitHub   — the official Octocat mark, 16x16 viewBox.
 *   WhatsApp — the handset inside the speech bubble, 16x16 viewBox.
 *   Trakteer — the jar with two coins and a heart cut out, 16x16 viewBox.
 *   Saweria  — the long-eared mascot face, 16x16 viewBox.
 *   Support  — a faceted gem used for the donate button.
 *
 * Marks with cut-outs (Trakteer's heart, Saweria's eyes, the gem's facets)
 * use a mask whose id comes from React's useId, because the same logo can be
 * mounted more than once at a time and duplicate ids would make every copy
 * read the first mask in the document.
 */

import { useId } from 'react';

interface LogoProps {
  size?: number;
}

export function GitHubLogo({ size = 13 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function WhatsAppLogo({ size = 13 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
    </svg>
  );
}

/**
 * Trakteer mark: a jar with a flat lid, two coins resting on the lid and a
 * heart cut out of the jar body — the shape of the official icon.
 */
export function TrakteerLogo({ size = 14 }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const heartMask = `tk-heart-${uid}`;

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={heartMask}>
        <rect width="16" height="16" fill="#fff" />
        {/* Hati di badan toples, dilubangi dari siluet. */}
        <path
          d="M8 13.3s-3.1-1.9-3.1-3.8c0-1.1.9-1.9 1.9-1.9.6 0 1 .3 1.2.7.2-.4.6-.7 1.2-.7 1 0 1.9.8 1.9 1.9 0 1.9-3.1 3.8-3.1 3.8z"
          fill="#000"
        />
      </mask>

      {/* Badan toples: sisi lurus, sudut bawah membulat. */}
      <path
        d="M4.2 6.4h7.6v5.1c0 1.6-1.3 2.9-2.9 2.9H7.1c-1.6 0-2.9-1.3-2.9-2.9z"
        mask={`url(#${heartMask})`}
      />
      {/* Tutup datar, sedikit lebih lebar dari badan. */}
      <rect x="3.3" y="4.9" width="9.4" height="1.5" rx="0.5" />
      {/* Dua koin bertumpuk miring di atas tutup. */}
      <circle cx="10.5" cy="2.9" r="1.9" />
      <circle cx="6.3" cy="3.3" r="2.1" />
    </svg>
  );
}

/**
 * Saweria mark: the mascot's head — long upright ears, round face and two
 * big eyes — with the eyes and nose cut out of the silhouette.
 */
export function SaweriaLogo({ size = 14 }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const faceMask = `sw-face-${uid}`;

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={faceMask}>
        <rect width="16" height="16" fill="#fff" />
        <circle cx="6" cy="9.4" r="1.4" fill="#000" />
        <circle cx="10" cy="9.4" r="1.4" fill="#000" />
        <ellipse cx="8" cy="11.9" rx="1" ry="0.8" fill="#000" />
      </mask>

      {/* Telinga panjang tegak, lalu kepala bulat — satu siluet. */}
      <g mask={`url(#${faceMask})`}>
        <rect x="4.3" y="0.7" width="2.7" height="6.4" rx="1.35" />
        <rect x="9" y="0.7" width="2.7" height="6.4" rx="1.35" />
        <path d="M8 4.1c3.1 0 5.7 2.4 5.7 5.5S11.1 15.3 8 15.3 2.3 12.7 2.3 9.6 4.9 4.1 8 4.1z" />
      </g>
    </svg>
  );
}

/**
 * Donate mark: a faceted gem, used for the "Dukung Zephyr" button and the
 * donate dialog header.
 */
export function SupportLogo({ size = 14 }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const facetMask = `sp-facet-${uid}`;

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={facetMask}>
        <rect width="16" height="16" fill="#fff" />
        {/* Sisi atas dan dua garis potong yang membentuk facet. */}
        <path d="M2.6 5.3h10.8v1.1H2.6z" fill="#000" />
        <path d="M5.5 1.3 8 6.4 10.5 1.3 8 15.4z" fill="#000" />
      </mask>

      <path d="M5.5 1.3h5l3.4 4-5.9 9.9-5.9-9.9z" mask={`url(#${facetMask})`} />
      {/* Sisi kiri-kanan digambar utuh supaya facet atas tetap terbaca. */}
      <path d="M2.6 5.3h10.8v1.1H2.6z" />
      <path d="M5.5 1.3 2.6 5.3h2.6zM10.5 1.3l2.9 4h-2.6z" />
    </svg>
  );
}
