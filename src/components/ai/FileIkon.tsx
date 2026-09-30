import { ikonFile, ikonFolder } from '../../lib/fileIcons';

/*
 * A file-type icon: the real SVG from material-icon-theme, at 16px.
 *
 * The markup is inlined from the generated table rather than fetched, because
 * the "@" list renders a dozen rows at a time and one request per row would
 * cost more than the bytes. The theme's own colours are baked into each SVG, so
 * no tint is applied here — a PHP elephant is purple because that is what it
 * looks like everywhere else, and a developer reads it without thinking.
 */
export default function FileIkon({
  nama,
  folder = false,
}: {
  nama: string;
  folder?: boolean;
}) {
  const ikon = folder ? ikonFolder(nama) : ikonFile(nama);

  if (!ikon.svg) {
    // No icon in the theme for this type: an empty box keeps the column width
    // so the labels below stay aligned.
    return <span className="ai-fikon" data-ikon={ikon.id} aria-hidden="true" />;
  }

  return (
    <span
      className="ai-fikon"
      data-ikon={ikon.id}
      aria-hidden="true"
      // The SVG comes from a build-time generated table (scripts/gen-file-icons.mjs),
      // not from user input.
      dangerouslySetInnerHTML={{ __html: ikon.svg }}
    />
  );
}
