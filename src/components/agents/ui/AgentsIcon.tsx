/**
 * Icon set for the Agents window's rebuilt chrome.
 *
 * Drawn from primitives here rather than imported from an icon package: every
 * glyph is a 16x16 path at 1.5 stroke, so they share one weight on a row. This
 * file exists because the rebuilt sidebar, composer and cards all need the same
 * small set and pulling in a dependency for fourteen paths is not worth it.
 */

export type AgentsIconName =
  | 'wrench'
  | 'map'
  | 'spark'
  | 'bolt'
  | 'plus'
  | 'chevron'
  | 'send'
  | 'folder'
  | 'panel'
  | 'search'
  | 'store'
  | 'clock'
  | 'cube';

const paths: Record<AgentsIconName, JSX.Element> = {
  wrench: (
    <path d="M10.6 2.2a3.4 3.4 0 0 0-3.2 4.5L2.4 11.7a1.4 1.4 0 0 0 2 2l5-5a3.4 3.4 0 0 0 4.5-3.2l-2 2-1.6-.4-.4-1.6 2-2z" />
  ),
  map: (
    <>
      <path d="M2.5 4.2 6.5 2.6l3 1.6 4-1.6v9.2l-4 1.6-3-1.6-4 1.6V4.2z" />
      <path d="M6.5 2.6v9.2M9.5 4.2v9.2" />
    </>
  ),
  spark: (
    <>
      <path d="M8 2.2l1.5 3.6 3.6 1.5-3.6 1.5L8 12.4 6.5 8.8 2.9 7.3l3.6-1.5L8 2.2z" />
      <circle cx="8" cy="7.3" r="0.9" />
    </>
  ),
  bolt: <path d="M9 2 4 9h3l-1 5 5-7H8l1-5z" />,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  send: <path d="M8 12.8V3.4M3.9 7.4 8 3.2l4.1 4.2" />,
  folder: (
    <path d="M2.4 4.6a1.2 1.2 0 0 1 1.2-1.2h2.3l1.2 1.4h5.3a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H3.6a1.2 1.2 0 0 1-1.2-1.2V4.6z" />
  ),
  panel: (
    <>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1.3" />
      <path d="M9.6 3v10" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="3.6" />
      <path d="M9.7 9.7l3 3" />
    </>
  ),
  store: (
    <>
      <path d="M2.6 6.2 4 3h8l1.4 3.2" />
      <path d="M2.6 6.2h10.8v6.4H2.6V6.2z" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 5.2V8l2 1.4" />
    </>
  ),
  cube: <path d="M8 2.2 13.2 5v6L8 13.8 2.8 11V5L8 2.2zM2.8 5 8 7.8 13.2 5M8 7.8v6" />,
};

export function AgentsIcon({ name, size = 16 }: { name: AgentsIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
