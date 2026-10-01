/*
 * One icon set for the tool chips in the custom sub-agent dialog.
 *
 * The picker used to render a different Unicode glyph per tool (▤ ☰ ⌘ ▭ ⚠ ≡ ✦
 * ◈). Those glyphs come from unrelated blocks, so they carried different
 * weights and optical sizes and some fell back to a system font — the row read
 * as eight marks rather than one set. These are stroke SVGs on a shared 16px
 * grid with one weight, which is the same approach the rest of the app takes
 * for its inline icons (FileIcon, PaneIcons, BrandIkon).
 *
 * Colour is inherited: stroke="currentColor" lets the chip's own colour drive
 * both states, so an off chip and an on chip need no separate icon rules.
 */

interface Props {
  id: string;
  size?: number;
}

/** Shared wrapper so every glyph keeps the same box and stroke weight. */
function Svg({ size = 13, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export default function AlatIkon({ id, size }: Props) {
  switch (id) {
    // Read file: a page with a folded corner.
    case 'file_read':
      return (
        <Svg size={size}>
          <path d="M9 1.8H4.2a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V5.6z" />
          <path d="M9 1.8v3.8h3.8" />
        </Svg>
      );
    // List dir: a folder.
    case 'file_list':
      return (
        <Svg size={size}>
          <path d="M1.8 12.6V4a1 1 0 0 1 1-1h3.1l1.4 1.7h6.9a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" />
        </Svg>
      );
    // Run command: a shell prompt.
    case 'shell_exec':
      return (
        <Svg size={size}>
          <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.2" />
          <path d="M4.6 6.4l1.9 1.9-1.9 1.9M8.6 10.2h3" />
        </Svg>
      );
    // Read terminal: a terminal window with a caret line.
    case 'terminal_read':
      return (
        <Svg size={size}>
          <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.2" />
          <path d="M1.8 5.8h12.4" />
          <path d="M4.4 8.2l1.5 1.5-1.5 1.5" />
        </Svg>
      );
    // Diagnostics: a warning triangle.
    case 'get_problems':
      return (
        <Svg size={size}>
          <path d="M7.1 2.6 1.9 11.6a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8.9 2.6a1 1 0 0 0-1.8 0z" />
          <path d="M8 6.4v3.1" />
          <path d="M8 11.4h.01" />
        </Svg>
      );
    // Output log: text lines.
    case 'get_output':
      return (
        <Svg size={size}>
          <path d="M2.4 4.2h11.2M2.4 8h11.2M2.4 11.8h7.2" />
        </Svg>
      );
    // List skills: a four-point star, the app's mark for skills.
    case 'skill_list':
      return (
        <Svg size={size}>
          <path d="M8 2.2l1.6 4.2 4.2 1.6-4.2 1.6L8 13.8l-1.6-4.2L2.2 8l4.2-1.6z" />
        </Svg>
      );
    // Read memory: a stack of layers.
    case 'memory_read':
      return (
        <Svg size={size}>
          <path d="M8 2.2 2.2 5.2 8 8.2l5.8-3z" />
          <path d="M2.2 8.4 8 11.4l5.8-3" />
          <path d="M2.2 11.2 8 14.2l5.8-3" />
        </Svg>
      );
    default:
      return null;
  }
}
