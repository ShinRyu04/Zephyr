/**
 * Search Editor — search results as an editable document.
 *
 * ## What this is, and what it is not
 *
 * VS Code's Search Editor, not Zed's multibuffer. The difference matters:
 *
 *   * A MULTIBUFFER makes excerpts from many files into ONE editable buffer
 *     whose edits write back to the source files. That needs a document model
 *     that maps buffer positions to file positions across N files — a large
 *     piece of machinery, and the reason Zed built it in Rust from the start.
 *   * A SEARCH EDITOR is one read-only document showing the matches WITH their
 *     surrounding context, one section per file, navigable and copyable as a
 *     whole.
 *
 * The second is what most people actually want from the first: seeing every hit
 * in its surroundings, in one scrollable place, with the file and line visible.
 * That is achievable with the text model Zephyr already has, so it is what this
 * builds. The editing half is honestly absent rather than half-present.
 *
 * ## Why the context lines come from disk, in the main process
 *
 * A hit carries only its own line. Showing it in context means reading the
 * surrounding lines from each file — done through `fsRead` rather than by opening
 * a tab per file, because a search across two hundred files must not open two
 * hundred tabs.
 */

export interface HasilSearch {
  query: string;
  /** One entry per file, in the order the results arrived. */
  berkas: {
    path: string;
    /** 1-based line numbers of the matches in this file. */
    baris: number[];
  }[];
}

/** Lines of context kept above and below each match. */
export const KONTEKS = 3;

/**
 * One excerpt: a contiguous run of lines containing at least one match.
 *
 * Matches closer than `2 * KONTEKS + 1` lines apart are merged into ONE excerpt,
 * because rendering them separately would print the same lines twice with a gap
 * between them — which reads as though the code had changed.
 */
export interface Petikan {
  /** 1-based, inclusive. */
  dari: number;
  sampai: number;
  /** The lines, in order. */
  teks: string[];
  /** Which of them are matches: 1-based line number -> true. */
  cocok: Record<number, true>;
}

/**
 * Build the excerpts for one file.
 *
 * The caller passes the matching LINE NUMBERS rather than a predicate. Testing
 * each line here would be a second implementation of matching — for a regex
 * query, a second regex engine invocation that could disagree with the one that
 * produced the hits.
 */
export function petikanUntuk(isi: string, barisCocok: number[]): Petikan[] {
  const semua = isi.split('\n');
  if (barisCocok.length === 0) return [];
  const urut = [...new Set(barisCocok)].sort((a, b) => a - b);

  const keluar: Petikan[] = [];
  let kini: Petikan | null = null;

  for (const b of urut) {
    const dari = Math.max(1, b - KONTEKS);
    const sampai = Math.min(semua.length, b + KONTEKS);
    if (kini && dari <= kini.sampai + 1) {
      /* Overlapping or adjacent: extend. Nothing is reprinted. */
      for (let n = kini.sampai + 1; n <= sampai; n += 1) kini.teks.push(semua[n - 1] ?? '');
      kini.sampai = sampai;
      kini.cocok[b] = true;
      continue;
    }
    kini = {
      dari,
      sampai,
      teks: semua.slice(dari - 1, sampai),
      cocok: { [b]: true },
    };
    keluar.push(kini);
  }
  return keluar;
}

/**
 * Render the whole result set as one Markdown document.
 *
 * Markdown rather than plain text because the reader's next move is usually to
 * paste this into a pull request, an issue or a chat — and the fence keeps the
 * code from being reflowed by whatever renders it.
 *
 * A `# file:line` heading per excerpt rather than per file, because a file with
 * forty scattered matches needs its excerpts separated; one heading at the top
 * would leave the reader scrolling with no idea how far apart they are.
 */
export function keMarkdown(query: string, bagian: { path: string; petikan: Petikan[] }[]): string {
  const out: string[] = [`# Search: ${query}`, ''];
  const total = bagian.reduce((n, b) => n + b.petikan.length, 0);
  out.push(`${total} result${total === 1 ? '' : 's'} in ${bagian.length} file${bagian.length === 1 ? '' : 's'}`, '');
  for (const b of bagian) {
    for (const p of b.petikan) {
      const cocok = Object.keys(p.cocok)
        .map(Number)
        .sort((x, y) => x - y);
      out.push(`## ${b.path}:${cocok.join(',')}`, '```');
      for (let i = 0; i < p.teks.length; i += 1) {
        const nomor = p.dari + i;
        /* The marker is what makes a paste readable: without it the reader has
           to count lines to find which one matched. */
        out.push(`${p.cocok[nomor] ? '>' : ' '} ${String(nomor).padStart(5)}  ${p.teks[i]}`);
      }
      out.push('```', '');
    }
  }
  return out.join('\n');
}
