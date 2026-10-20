/**
 * Which tool calls write files, and which paths each one touched.
 *
 * WHY this is its own module: two places need the answer - the "files changed"
 * card (one row per file) and the transcript header (one summary per session).
 * Keeping the names here means the card and the summary can never disagree
 * about whether a call counted.
 *
 * The list is deliberately explicit rather than a `nama.includes('write')`
 * test. `write_file` and `edit` are the common ones; the rest exist so a
 * rename or a patch does not silently vanish from the summary - which is
 * exactly what happened before: the old check looked for `write`, a name the
 * catalog has never exposed, and every write fell through it.
 */

/** Names (without any `mcp__` prefix) that modify the file system. */
const TOOL_TULIS = new Set([
  'write_file',
  'edit',
  'multi_edit',
  'apply_patch',
  'replace_in_files',
  'delete_file',
  'move_file',
  'copy_file',
]);

export function namaToolTulis(nama: string): boolean {
  const polos = nama.includes('__') ? nama.slice(nama.lastIndexOf('__') + 2) : nama;
  return TOOL_TULIS.has(polos);
}

/** A path for every file the call touched, in the order the tool named them. */
export function pathsDari(
  args: Record<string, unknown>,
  hasil = '',
): string[] {
  const out: string[] = [];
  const tambah = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };

  tambah(args.path);
  tambah(args.file_path);
  tambah(args.target);

  /* A move or a copy names both ends; the destination is the file that now
     exists, so it must be listed even though `path` was absent. */
  tambah(args.from);
  tambah(args.to);

  /* `replace_in_files` works on a set. */
  if (Array.isArray(args.files)) for (const f of args.files) tambah(f);
  if (Array.isArray(args.paths)) for (const f of args.paths) tambah(f);

  /*
   * A patch names its targets only inside its own body, so the paths are read
   * back out of the result when the arguments carry none. The pattern matches
   * the lines the tool itself prints ("Berkas ditulis: <path>", "Updated
   * <path>"), which is the only place the information exists.
   */
  if (!out.length && hasil) {
    for (const baris of hasil.split('\n')) {
      const m = /(?:^|[:>]\s*)((?:[A-Za-z]:[\\/]|\/)[^\s:]+)/.exec(baris);
      if (m) tambah(m[1]);
    }
  }

  /* Duplicates matter: a `multi_edit` that names the same file twice is one
     row, not two, and the caller keys its map by path anyway. */
  return [...new Set(out)];
}
