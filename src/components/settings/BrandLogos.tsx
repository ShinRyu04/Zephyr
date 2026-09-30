/**
 * Brand logos for the About buttons and the donate dialog.
 *
 * These are the real marks, drawn as inline SVG so they inherit the theme
 * colour and stay sharp at any size. Keeping them here means the buttons do
 * not depend on an icon font or a network fetch.
 *
 * Path data:
 *   GitHub   - the official Octocat mark, 16x16 viewBox.
 *   Discord  - the Clyde face, 24x24 viewBox (its native grid).
 *   Trakteer - the jar with two coins and a heart cut out, 16x16 viewBox.
 *   Saweria  - the long-eared mascot face, 16x16 viewBox.
 *   Support  - a faceted gem used for the donate button.
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

export function DiscordLogo({ size = 13 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/**
 * Trakteer mark: a jar with a flat lid, two coins resting on the lid and a
 * heart cut out of the jar body - the shape of the official icon.
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
 * Saweria mark: the mascot's head - long upright ears, round face and two
 * big eyes - with the eyes and nose cut out of the silhouette.
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

      {/* Telinga panjang tegak, lalu kepala bulat - satu siluet. */}
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
