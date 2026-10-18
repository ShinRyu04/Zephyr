import * as cmd from './commands';
import type { DirNode } from './types';
import { useStore } from './store';
import type { EntriWiki } from './wikiStore';

/**
 * Generate the Repo Wiki and the Knowledge Cards from the workspace.
 *
 * ## What this actually does
 *
 * It WALKS the workspace and reads files. It does not ask a model to invent an
 * architecture description - that would produce a confident page about a
 * codebase nobody verified, which is the exact failure this product spends most
 * of its effort avoiding. Everything here is derived from what is on disk, so
 * every claim in the output can be traced to a file.
 *
 * The AI's part is the `Create With Plan` path (`/knowledge-plan`), where the
 * reader and the agent agree on scope BEFORE anything is written. This function
 * is the deterministic path: same input, same pages, no network.
 *
 * ## Two outputs, one walk
 *
 *   wiki       one page per TOP-LEVEL module, listing its files and what each
 *              one exports. Readable by a person.
 *   knowledge  one card per FILE with its exports, in the compact shape a model
 *              can be handed at prompt time.
 *
 * Walking once and deriving both is what keeps them consistent: two separate
 * walks would eventually disagree about which files exist.
 */

/** Directories that are never documentation material. */
const LEWATI = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.zephyr',
  'release',
  'scratch',
]);

/** Files that are configuration rather than code, documented in one page. */
const KONFIG = /^(package\.json|tsconfig\.json|Cargo\.toml|\.gitignore|README\.md|AGENTS\.md)$/;

/** Extensions worth reading. Anything else is listed by name only. */
const KODE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|css|scss|html|md|json|toml|yml|yaml)$/;

interface Berkas {
  /** Path relative to the workspace root, forward slashes. */
  rel: string;
  nama: string;
  ukuran: number;
}

/** Walk the tree breadth-first, skipping the noise directories. */
async function telusuri(akar: string, batas = 4000): Promise<Berkas[]> {
  const hasil: Berkas[] = [];
  const antre: { path: string; rel: string; depth: number }[] = [{ path: akar, rel: '', depth: 0 }];

  while (antre.length > 0 && hasil.length < batas) {
    const kini = antre.shift()!;
    let isi: DirNode[];
    try {
      isi = await cmd.scanDir(kini.path);
    } catch {
      /* An unreadable directory is skipped, not fatal: one locked folder must
         not abort a whole generation. */
      continue;
    }
    for (const n of isi) {
      const rel = kini.rel ? `${kini.rel}/${n.name}` : n.name;
      if (n.isDir) {
        if (LEWATI.has(n.name.toLowerCase())) continue;
        /* Depth cap: a repository with a pathological nesting level should not
           turn this into a multi-minute scan. */
        if (kini.depth < 8) antre.push({ path: n.path, rel, depth: kini.depth + 1 });
      } else {
        hasil.push({ rel, nama: n.name, ukuran: 0 });
      }
    }
  }
  return hasil;
}

/**
 * Pull the exported names out of a source file.
 *
 * A regex, not a parser. That is a deliberate trade: this runs over every file
 * in a workspace on the main thread, and a real parser per language would mean
 * shipping five parsers. The patterns below cover the export syntaxes these
 * languages actually use, and a miss shows up as a file with fewer exports
 * listed - not as a wrong claim, because nothing here asserts what a symbol
 * DOES.
 */
function ekspor(isi: string, ext: string): string[] {
  const nama = new Set<string>();

  if (/^(ts|tsx|js|jsx|mjs|cjs)$/.test(ext)) {
    for (const m of isi.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) nama.add(m[1]);
    for (const m of isi.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) nama.add(m[1]);
    for (const m of isi.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) nama.add(m[1]);
    for (const m of isi.matchAll(/export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/g)) nama.add(m[1]);
    /* `export { a, b as c }` - take the exported (right-hand) name. */
    for (const m of isi.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const bagian of m[1].split(',')) {
        const as = bagian.split(/\s+as\s+/);
        const akhir = (as[1] ?? as[0]).trim();
        if (akhir) nama.add(akhir);
      }
    }
    if (/export\s+default/.test(isi)) nama.add('default');
  } else if (ext === 'rs') {
    for (const m of isi.matchAll(/pub\s+(?:async\s+)?fn\s+([a-z_][\w]*)/g)) nama.add(m[1]);
    for (const m of isi.matchAll(/pub\s+struct\s+([A-Za-z_]\w*)/g)) nama.add(m[1]);
    for (const m of isi.matchAll(/pub\s+enum\s+([A-Za-z_]\w*)/g)) nama.add(m[1]);
  } else if (ext === 'py') {
    for (const m of isi.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm)) {
      if (!m[1].startsWith('_')) nama.add(m[1]);
    }
    for (const m of isi.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) nama.add(m[1]);
  } else if (ext === 'go') {
    for (const m of isi.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm)) nama.add(m[1]);
    for (const m of isi.matchAll(/^type\s+([A-Z]\w*)/gm)) nama.add(m[1]);
  }

  return [...nama].slice(0, 24);
}

/** One-line summary of a file, derived from its own content. */
function ringkas(isi: string): string {
  /* A leading block comment or docstring is the author's own description, which
     beats anything inferred from the code. */
  const blok = isi.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (blok) {
    const baris = blok[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
      .filter((l) => l && !l.startsWith('@'));
    if (baris.length) return baris.slice(0, 2).join(' ').slice(0, 220);
  }
  const slash = isi.match(/^\s*\/\/([^\n]+)/);
  if (slash) return slash[1].trim().slice(0, 220);
  const pagar = isi.match(/^\s*#([^\n]+)/);
  if (pagar) return pagar[1].trim().slice(0, 220);
  return '';
}

export interface HasilWiki {
  wiki: EntriWiki[];
  knowledge: EntriWiki[];
  /** Files that were read, for the report. */
  dibaca: number;
  /** Files skipped because they were too large or unreadable. */
  dilewati: number;
}

/** Files above this size are summarised by name only: reading them is not worth it. */
const BATAS_BACA = 256 * 1024;

/**
 * How many files to READ, and how many at once.
 *
 * MEASURED, not guessed: on this repository the walk finds ~1700 source files,
 * and reading them one at a time over IPC took longer than a minute - the pane
 * sat on "Reading 1720 files…" and the reader had no way to tell it apart from a
 * hang. Two changes fix it, and both matter:
 *
 *   BATAS_FILE  the first 700 files are read. A wiki page about every single
 *               file is not more useful than one about 700 of them, and the
 *               report says how many were skipped so the number is honest.
 *   PARALEL     eight reads in flight. IPC latency dominates a small read, so
 *               overlapping them is most of the win; eight is enough to hide the
 *               round trip and few enough not to flood the backend.
 */
const BATAS_FILE = 700;
const PARALEL = 8;

/** Run `fn` over `items` with at most `n` in flight. Order is preserved. */
async function paralel<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const hasil: R[] = new Array(items.length);
  let berikut = 0;
  const pekerja = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = berikut++;
      if (i >= items.length) return;
      hasil[i] = await fn(items[i]);
    }
  });
  await Promise.all(pekerja);
  return hasil;
}

/**
 * Build both artefacts for a workspace.
 *
 * `onProgres` is called with a short status so the pane can say what it is doing;
 * a generation over a large repo takes seconds and a frozen button reads as a
 * hang.
 */
export async function hasilkanWiki(
  onProgres?: (pesan: string) => void,
): Promise<HasilWiki> {
  const akar = useStore.getState().workspace;
  if (!akar) {
    throw new Error('Open a folder first: the wiki describes a workspace, and there is none open.');
  }

  onProgres?.('Scanning the workspace…');
  const semua = await telusuri(akar);

  const kode = semua.filter((b) => KODE.test(b.nama) && !KONFIG.test(b.nama));
  /* Reading every file of a large repo is not more useful than reading most of
     it, and it is the difference between seconds and a minute. The cap is
     REPORTED, so "1720 files found, 700 read" is what the reader sees. */
  const dibacaMaks = kode.slice(0, BATAS_FILE);
  onProgres?.(`Reading ${dibacaMaks.length} of ${kode.length} files…`);

  /** rel path -> { exports, summary } */
  const info = new Map<string, { ekspor: string[]; ringkas: string; baris: number }>();
  let dibaca = 0;
  let dilewati = kode.length - dibacaMaks.length;

  const hasilBaca = await paralel(dibacaMaks, PARALEL, async (b) => {
    const full = `${akar.replace(/[\\/]+$/, '')}/${b.rel}`;
    try {
      const hasil = await cmd.fsRead(full);
      const isi = hasil?.content;
      if (typeof isi !== 'string') return null;
      if (isi.length > BATAS_BACA) return null;
      const ext = (b.nama.split('.').pop() ?? '').toLowerCase();
      return {
        rel: b.rel,
        ekspor: ekspor(isi, ext),
        ringkas: ringkas(isi),
        baris: isi.split('\n').length,
      };
    } catch {
      return null;
    }
  });

  for (const d of hasilBaca) {
    if (!d) {
      dilewati++;
      continue;
    }
    info.set(d.rel, { ekspor: d.ekspor, ringkas: d.ringkas, baris: d.baris });
    dibaca++;
  }

  onProgres?.('Writing pages…');

  /* ── Knowledge cards: one per file ───────────────────────────────────── */
  const knowledge: EntriWiki[] = [];
  for (const [rel, d] of info) {
    if (d.ekspor.length === 0 && !d.ringkas) continue;
    const baris: string[] = [];
    baris.push(`# ${rel}`);
    baris.push('');
    if (d.ringkas) {
      baris.push(d.ringkas);
      baris.push('');
    }
    baris.push(`- Path: \`${rel}\``);
    baris.push(`- Lines: ${d.baris}`);
    if (d.ekspor.length) baris.push(`- Exports: ${d.ekspor.map((e) => `\`${e}\``).join(', ')}`);
    knowledge.push({
      id: rel.replace(/[\\/]/g, '__').replace(/\.[^.]+$/, ''),
      judul: rel,
      isi: baris.join('\n'),
      sumber: `file:${rel}`,
    });
  }

  /* ── Wiki pages: one per top-level folder, plus one for the root ─────── */
  const perFolder = new Map<string, string[]>();
  for (const [rel] of info) {
    const bagian = rel.split('/');
    /* Top-level module: the first segment when there is a folder, else "(root)". */
    const kunci = bagian.length > 1 ? bagian[0] : '(root)';
    if (!perFolder.has(kunci)) perFolder.set(kunci, []);
    perFolder.get(kunci)!.push(rel);
  }

  const wiki: EntriWiki[] = [];

  /* The overview page first: what the project IS, from its manifest. */
  const manifes = semua.find((b) => b.nama === 'package.json' || b.nama === 'Cargo.toml');
  let judulProyek = akar.split(/[\\/]/).pop() ?? akar;
  const isiOverview: string[] = [`# ${judulProyek}`, ''];

  if (manifes) {
    try {
      const bacaManifes = await cmd.fsRead(`${akar.replace(/[\\/]+$/, '')}/${manifes.rel}`);
      const teks = bacaManifes?.content;
      if (typeof teks === 'string') {
        if (manifes.nama === 'package.json') {
          const j = JSON.parse(teks) as { name?: string; description?: string; version?: string };
          if (j.name) judulProyek = j.name;
          if (j.version) isiOverview.push(`Version \`${j.version}\`.`, '');
          if (j.description) isiOverview.push(j.description, '');
        } else {
          const nama = teks.match(/^name\s*=\s*"([^"]+)"/m);
          const ver = teks.match(/^version\s*=\s*"([^"]+)"/m);
          if (nama) judulProyek = nama[1];
          if (ver) isiOverview.push(`Version \`${ver[1]}\`.`, '');
        }
      }
    } catch {
      /* A manifest that will not parse is not a reason to fail: the page still
         lists the modules, which is the part a reader came for. */
    }
  }

  isiOverview.push('## Modules', '');
  isiOverview.push('| Module | Files | Documented |');
  isiOverview.push('| --- | --- | --- |');
  for (const [folder, daftar] of [...perFolder].sort((a, b) => b[1].length - a[1].length)) {
    isiOverview.push(`| \`${folder}\` | ${daftar.length} | ${daftar.filter((r) => info.get(r)?.ekspor.length).length} |`);
  }
  isiOverview.push('');
  isiOverview.push(
    `Generated from ${dibaca} files read on disk` +
      (dilewati > 0 ? ` (${dilewati} skipped: binary, oversized, or beyond the read cap).` : '.') +
      ' Nothing here is inferred.',
  );

  wiki.push({
    id: 'overview',
    judul: `Overview — ${judulProyek}`,
    isi: isiOverview.join('\n'),
    sumber: 'workspace',
  });

  for (const [folder, daftar] of [...perFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (folder === '(root)' && daftar.length < 3) continue;
    const baris: string[] = [`# ${folder}`, '', `${daftar.length} files.`, ''];
    for (const rel of daftar.sort()) {
      const d = info.get(rel);
      baris.push(`### \`${rel}\``);
      if (d?.ringkas) baris.push(d.ringkas, '');
      if (d?.ekspor.length) {
        baris.push(`Exports: ${d.ekspor.map((e) => `\`${e}\``).join(', ')}`, '');
      }
      if (!d?.ringkas && !d?.ekspor.length) baris.push('');
    }
    wiki.push({
      id: folder.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      judul: folder,
      isi: baris.join('\n'),
      sumber: `folder:${folder}`,
    });
  }

  onProgres?.('Done.');
  return { wiki, knowledge, dibaca, dilewati };
}

/**
 * Write the generated pages into `.zephyr/` in the workspace.
 *
 * Best-effort and REPORTED: the caller gets the number actually written. A write
 * that silently fails would leave the pane claiming an export that is not on
 * disk, which is worse than no export at all.
 */
export async function eksporWiki(
  hasil: HasilWiki,
  tulis: (path: string, isi: string) => Promise<unknown>,
): Promise<{ ditulis: number; gagal: number }> {
  const akar = useStore.getState().workspace;
  if (!akar) return { ditulis: 0, gagal: 0 };
  const dasar = `${akar.replace(/[\\/]+$/, '')}/.zephyr`;

  let ditulis = 0;
  let gagal = 0;

  for (const [folder, daftar] of [
    ['wiki', hasil.wiki],
    ['knowledge', hasil.knowledge],
  ] as const) {
    for (const e of daftar) {
      try {
        await tulis(`${dasar}/${folder}/${e.id}.md`, e.isi);
        ditulis++;
      } catch {
        gagal++;
      }
    }
  }

  return { ditulis, gagal };
}
