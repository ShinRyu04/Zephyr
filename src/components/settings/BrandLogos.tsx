/**
 * Brand logos for the About buttons.
 *
 * These are the real marks, drawn as inline SVG so they inherit the theme
 * colour and stay sharp at any size. Keeping them here means the buttons do
 * not depend on an icon font or a network fetch.
 *
 * Path data:
 *   GitHub  — the official Octocat mark, 16x16 viewBox.
 *   WhatsApp — the handset inside the speech bubble, 16x16 viewBox.
 */

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
 * Trakteer mark: a cup with a heart, drawn as a single filled path so it
 * inherits the button colour like the other brand marks.
 */
export function TrakteerLogo({ size = 14 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.4 4.2h9.1a.6.6 0 0 1 .6.6v3.4a4.3 4.3 0 0 1-4.3 4.3h-1.6a4.3 4.3 0 0 1-4.3-4.3V4.8a.6.6 0 0 1 .5-.6zm9.7 1.9h.7a1.9 1.9 0 0 1 0 3.8h-.7a5.6 5.6 0 0 1-1 2.3 3 3 0 0 0 1.9-2.9 3 3 0 0 0-.9-2.1zM4.6 1.6c0 .9-.7 1.1-.7 1.9 0 .5.3.8.3.8a.55.55 0 0 1-.8.7S2.7 4.4 2.7 3.5c0-1.4 1.1-1.7 1.1-2.5 0-.3-.2-.5-.2-.5a.55.55 0 0 1 .8-.7s.2.4.2 1.3zm2.6 0c0 .9-.7 1.1-.7 1.9 0 .5.3.8.3.8a.55.55 0 0 1-.8.7s-.7-.6-.7-1.5c0-1.4 1.1-1.7 1.1-2.5 0-.3-.2-.5-.2-.5a.55.55 0 0 1 .8-.7s.2.4.2 1.3z" />
      <path d="M7 6.4c.9-1 2.3-.4 2.3.7 0 .9-1.2 1.7-2.3 2.6-1.1-.9-2.3-1.7-2.3-2.6 0-1.1 1.4-1.7 2.3-.7z" opacity=".55" />
    </svg>
  );
}

/**
 * Saweria mark: a simple speech-bubble heart, matching the service's logo
 * shape without copying the full-colour artwork.
 */
export function SaweriaLogo({ size = 14 }: LogoProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.3c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2v3.1a.5.5 0 0 0 .8.4l2.5-1.7c.3 0 .5.1.8.1 3.6 0 6.5-2.4 6.5-5.4S11.6 1.3 8 1.3zm0 8.9c-.9 0-1.7-.2-2.4-.6l-.4-.2-1.6 1.1v-2l-.4-.3C2.2 7.4 1.6 6.3 1.6 5.1c0-2.2 2.3-4 5.4-4s5.4 1.8 5.4 4-2.3 4-5.4 4z" />
      <path d="M8 4.4c.7-.8 1.8-.3 1.8.5 0 .7-.9 1.3-1.8 2-.9-.7-1.8-1.3-1.8-2 0-.8 1.1-1.3 1.8-.5z" />
    </svg>
  );
}
