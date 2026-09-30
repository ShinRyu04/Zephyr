import type { LangId } from '../../lib/types';
import { ikonFile, ikonFolder } from '../../lib/fileIcons';

/*
 * The file icon used by the explorer tree, the tab bar and the breadcrumb.
 *
 * It draws the real icon from material-icon-theme — the same art VS Code uses —
 * so a .ts file shows the TypeScript mark, a .php file the elephant, and a .png
 * the picture glyph. Before this it drew a boxed two-letter glyph ("TS", "JS",
 * "{}", "#") in a hand-picked colour, which meant a PNG and a ZIP were the same
 * empty box and nothing matched what the user saw in any other editor.
 *
 * The `lang` prop is kept as the fallback for files the theme has no entry for:
 * a file with no extension still gets the right icon if the editor knows what
 * language it is.
 */
export default function FileIcon({
  lang,
  size = 14,
  name,
  folder = false,
  folderOpen = false,
}: {
  lang?: LangId;
  size?: number;
  name?: string;
  folder?: boolean;
  /*
   * A folder has two pieces of art in the theme — a closed one and an open one
   * (the lid tilts). This flag is what picks between them.
   */
  folderOpen?: boolean;
}) {
  const ikon = folder ? ikonFolder(name, folderOpen) : ikonFile(name ?? '', lang);

  if (!ikon.svg) {
    // Nothing in the theme for this file and no language to fall back on: a
    // quiet dot keeps the row aligned without pretending to know the type.
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="1.6" fill="var(--text-muted)" opacity="0.6" />
      </svg>
    );
  }

  return (
    <span
      className="tree-fikon"
      data-ikon={ikon.id}
      style={{ width: size, height: size }}
      aria-hidden="true"
      // The SVG comes from a build-time generated table (scripts/gen-file-icons.mjs),
      // not from user input.
      dangerouslySetInnerHTML={{ __html: ikon.svg }}
    />
  );
}

/*
 * The folder mark, keyed so the swap is an animation rather than a jump.
 *
 * The two variants come from the theme and are different drawings, so there is
 * nothing to tween between them — what sells the opening is the swap itself,
 * held for a beat: the new lid arrives, the old one fades. Re-keying on the
 * open state is what makes React throw away the previous DOM node and mount the
 * other one, which is the only way to get two different SVGs to cross-fade.
 */
export function FolderIcon({ open, nama, size = 14 }: { open: boolean; nama?: string; size?: number }) {
  return (
    <span
      className="tree-folder-ikon"
      key={open ? 'buka' : 'tutup'}
      data-buka={open ? '1' : '0'}
      style={{ width: size, height: size }}
    >
      <FileIcon folder folderOpen={open} name={nama} size={size} />
    </span>
  );
}
