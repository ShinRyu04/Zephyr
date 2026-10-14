/**
 * External formatters, chained on save.
 *
 * ## What the LSP formatter cannot do
 *
 * `textDocument/formatting` works only for languages whose server implements
 * it, and only in the way that server wants. Plenty of real setups have no
 * server at all for a file type, or have one whose formatting is not the
 * formatting the project actually uses:
 *
 *   * `prettier` for JSON, Markdown, YAML, Svelte — no LSP needed;
 *   * `gofmt` + `goimports` together, which is two tools, not one;
 *   * `clang-format` with a `.clang-format` the project chose;
 *   * a repo-local script that runs a dozen steps.
 *
 * So the setting is a LIST of shell commands, run in order, each one receiving
 * the file's text on stdin and returning the new text on stdout. That shape is
 * what `prettier`, `gofmt`, `clang-format`, `black`, `rustfmt` and `eslint
 * --fix` all accept, so one mechanism covers all of them and anything a reader
 * writes themselves.
 *
 * ## Why stdin/stdout and not "edit the file in place"
 *
 * In place would mean the formatter writes a file the editor still has open
 * with unsaved changes — a conflict the reader would have to resolve by hand,
 * and a formatter that fails halfway would leave the file truncated. Through
 * stdin there is one writer (the save), the buffer is the source of truth, and
 * a command that exits non-zero changes nothing.
 *
 * ## The exit code decides, and a non-zero one keeps the original
 *
 * A formatter that fails must not delete the reader's code. `eslint --fix`
 * exits 1 when it fixed things AND when it found unfixable problems — its
 * stdout is still valid in both cases, so a non-zero exit is treated as "use
 * what came out if there is anything, otherwise keep what went in".
 */

export interface FormatterCmd {
  /** Shell command. The file's text arrives on stdin. */
  cmd: string;
  /** Restrict to these extensions (`.ts`, `.rs`). Empty means every file. */
  extensions?: string[];
}

export interface HasilFormat {
  teks: string;
  /** Which commands actually changed something. */
  diubah: string[];
  /** Commands that failed, with the reason, for the status line. */
  gagal: { cmd: string; pesan: string }[];
}

/** Does this formatter apply to this file? */
export function berlaku(f: FormatterCmd, path: string): boolean {
  const ext = (f.extensions ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (ext.length === 0) return true;
  const bawah = path.toLowerCase();
  return ext.some((e) => bawah.endsWith(e.startsWith('.') ? e : `.${e}`));
}

/**
 * Run the chain over one string.
 *
 * Sequential, not parallel: each formatter must see the previous one's output,
 * which is the whole point of chaining (`gofmt` then `goimports`). Running them
 * off the same input and picking one would silently discard all but the last.
 *
 * A failing command is recorded and SKIPPED — the chain continues with what it
 * had. Stopping would mean an unrelated linter error prevents the formatter
 * that comes after it from ever running.
 */
export async function rangkaiFormat(
  teks: string,
  path: string,
  daftar: FormatterCmd[],
  jalankan: (cmd: string, input: string) => Promise<{ ok: boolean; out: string; err: string }>,
): Promise<HasilFormat> {
  let kini = teks;
  const diubah: string[] = [];
  const gagal: { cmd: string; pesan: string }[] = [];

  for (const f of daftar) {
    if (!berlaku(f, path)) continue;
    const cmd = (f.cmd ?? '').trim();
    if (!cmd) continue;

    let hasil: { ok: boolean; out: string; err: string };
    try {
      hasil = await jalankan(cmd, kini);
    } catch (e) {
      gagal.push({ cmd, pesan: String((e as Error)?.message ?? e) });
      continue;
    }

    /*
     * Empty stdout with a failure means the command never produced output —
     * a missing binary, a syntax error. Keep what we had. Non-empty stdout is
     * used even when the exit code is non-zero, because that is exactly what
     * `eslint --fix` does: exit 1, valid output.
     */
    if (!hasil.out) {
      if (!hasil.ok) {
        gagal.push({ cmd, pesan: (hasil.err || 'no output').trim().slice(0, 200) });
      }
      continue;
    }
    if (hasil.out !== kini) diubah.push(cmd);
    kini = hasil.out;
  }

  return { teks: kini, diubah, gagal };
}
