/*
 * The mark on an extension card.
 *
 * Every card used to show two capital letters in a grey box: `PY`, `KE`, `IK`.
 * A list of 118 looked like a list of 118 identical grey boxes, so the eye had
 * nothing to sort by and the icons read as broken rather than as plain.
 *
 * The bundled catalogue is Zephyr's own, so there is no vendor artwork to
 * fetch — but every id already says what the pack is, and that maps onto a mark
 * that means something:
 *
 *   zephyr.lang-*     the real file icon for the language (TypeScript mark,
 *                     the Python snake) taken from the same material-icon-theme
 *                     the explorer draws from, so a language pack looks like the
 *                     thing it adds highlighting for
 *   zephyr.tema-*     the theme mark every editor uses: a disc half in the
 *                     editor's ink, half in the page's
 *   zephyr.ikon-*     four swatches — it is a palette, not a picture
 *   zephyr.keymap-*   a key
 *   zephyr.snippet-*  braces
 *
 * Language packs are the bulk of the list, which is why they are the case worth
 * getting right: 300 of them were showing grey initials.
 */

import { ikonFile } from './fileIcons';
import { IKON_FILE } from './fileIconMap';

/*
 * The non-language kinds still deserve a colour of their own.
 *
 * They are drawn here rather than borrowed from a file-icon table, so they have
 * no fill to inherit and were coming out in the muted foreground — four grey
 * glyphs stacked under a column of coloured language marks. These hues keep the
 * keymaps, themes, swatches and snippets legible as groups without pretending
 * to be a vendor logo they do not have.
 */
const WARNA_JENIS: Record<string, string> = {
  theme: '#a78bfa',
  ikon: '#f59e0b',
  keymap: '#38bdf8',
  snippet: '#34d399',
  lain: '#94a3b8',
};

const EKSTENSI_BAHASA: Record<string, string> = {
  typescript: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  jsx: 'jsx',
  python: 'py',
  rust: 'rs',
  go: 'go',
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  markdown: 'md',
  html: 'html',
  css: 'css',
  scss: 'scss',
  php: 'php',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  'c++': 'cpp',
  csharp: 'cs',
  ruby: 'rb',
  lua: 'lua',
  zig: 'zig',
  shellscript: 'sh',
  sql: 'sql',
  vue: 'vue',
  svelte: 'svelte',
  dart: 'dart',
};

/*
 * Brand colour per language.
 *
 * The icon theme draws 833 of its 9200 marks with an explicit `fill` and leaves
 * the other 8366 on `currentColor` — which is right in the explorer, where the
 * tree is meant to follow the theme, and wrong on a card, where the whole point
 * is telling 118 rows apart. So the marks that came out blank get tinted with
 * the colour the language is actually known by, and the ones that already carry
 * a fill are left exactly as the theme drew them.
 *
 * Anything not listed falls to a stable hue derived from the name, so an
 * obscure language still reads as a coloured mark rather than as a black one.
 */
const WARNA_BAHASA: Record<string, string> = {
  // Each pack gets its own real brand colour, the way the language's own logo
  // and site use it. A hash-derived hue was a placeholder, and it made 30 packs
  // look interchangeable — nobody should have to read the title to tell Ada
  // from Haskell. Values are the widely-published brand hexes; a couple of
  // the older languages have no single official shade, so those take the one
  // their community site ships.
  apl: '#5a6c8c',
  asterisk: '#f26227',
  brainfuck: '#2f2530',
  clike: '#5965c2',
  clojure: '#5881d8',
  cmake: '#064f8c',
  cobol: '#1c4f82',
  coffeescript: '#6f4e37',
  commonlisp: '#3fb68b',
  crystal: '#000100',
  css: '#2965f1',
  cypher: '#34c0eb',
  d: '#ba595e',
  diff: '#88dddd',
  dockerfile: '#2496ed',
  dtd: '#9966b8',
  dylan: '#db7c00',
  elm: '#60b5cc',
  erlang: '#a90533',
  forth: '#341708',
  fortran: '#734f96',
  gas: '#4254a5',
  gherkin: '#5b2063',
  go: '#00add8',
  groovy: '#4298b8',
  haskell: '#5d4f85',
  haxe: '#ea8220',
  http: '#075e54',
  javascript: '#f7df1e',
  jinja2: '#a52a22',
  julia: '#9558b2',
  livescript: '#2f5d7c',
  lua: '#000080',
  mathematica: '#111111',
  mllike: '#ff0066',
  nginx: '#009639',
  nsis: '#3b3b76',
  octave: '#0790c0',
  pascal: '#e3f171',
  perl: '#39457e',
  powershell: '#5391fe',
  protobuf: '#4285f4',
  pug: '#a86454',
  puppet: '#302b6d',
  python: '#ffd43b',
  q: '#7800a0',
  r: '#276dc3',
  ruby: '#cc342d',
  rust: '#dea584',
  sas: '#b34936',
  sass: '#cf649a',
  scheme: '#1e4aec',
  shell: '#89e051',
  solr: '#d85036',
  sparql: '#2a9dc8',
  sql: '#e38c00',
  stex: '#0a5aa0',
  stylus: '#ff6347',
  swift: '#f05138',
  tcl: '#e4cc98',
  textile: '#ffe7ac',
  tiddlywiki: '#3f5f7f',
  toml: '#9c4221',
  ttcn: '#a1c659',
  'ttcn-cfg': '#8bbd3f',
  vb: '#945db7',
  velocity: '#2f6690',
  verilog: '#b2b7f8',
  vhdl: '#adb2cb',
  wast: '#673ab8',
  xml: '#e34c26',
  xquery: '#5232e7',
  yaml: '#cb171e',
};

/* A hue that stays put for a given name, so a re-render never shifts colour. */
function hueDariNama(nama: string): string {
  let h = 0;
  for (let i = 0; i < nama.length; i += 1) h = (h * 31 + nama.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 62%)`;
}

/*
 * Paint a mark that arrived with no colour of its own.
 *
 * Setting `color` on the wrapper does nothing here, and this is the trap worth
 * writing down: SVG's initial `fill` is black, not `currentColor`. 8366 of the
 * theme's 9200 marks carry no `fill` attribute at all, so they render as black
 * silhouettes and inherit nothing. The colour has to be pushed onto the shapes
 * themselves. Only the ones with no `fill` are touched — a mark that already
 * declared one (the Python snake, the TypeScript square) keeps the theme's
 * colour, which is the point of borrowing it.
 */
function catTinta(svg: string, tinta: string): string {
  return svg.replace(
    /<(path|circle|rect|polygon|polyline|ellipse)\b(?![^>]*\bfill=)/g,
    `<$1 fill="${tinta}"`,
  );
}

/**
 * Turn a data-URI icon into inline markup, tinted if it has no colour.
 *
 * The marketplace ships each icon as `data:image/svg+xml;base64,…`. An `<img>`
 * holding one cannot be recoloured from outside the document, so 64 of the 73
 * language marks — every single-path icon with no `fill` — rendered as black
 * cutouts on a near-black sidebar. Inlining the markup and pushing a `fill`
 * onto the shape keeps the real artwork and makes it legible; the 9 that
 * already carry their brand colour are passed through untouched.
 */
export function inlineIkonDataUri(dataUri: string, nama: string): { svg: string; tint: boolean } | null {
  const m = /^data:image\/svg\+xml;base64,(.+)$/.exec(dataUri.trim());
  if (!m) return null;
  let raw: string;
  try {
    raw = atob(m[1]);
  } catch {
    return null;
  }
  if (!/<svg/i.test(raw)) return null;
  const sudahWarna = /fill="(?!none)/i.test(raw);
  if (sudahWarna) return { svg: raw, tint: false };
  return { svg: catTinta(raw, WARNA_BAHASA[nama] ?? hueDariNama(nama)), tint: true };
}

export type JenisIkonExt =
  | { svg: string; id: string; warna?: undefined; tinta: string; inisial?: undefined }
  | { svg: null; inisial: string; id: string; warna?: undefined; tinta: string }
  | { svg: null; id: string; warna: 'theme' | 'ikon' | 'keymap' | 'snippet' | 'lain'; tinta: string; inisial?: undefined };

export function ikonEkstensi(id: string, kategori: string[]): JenisIkonExt {
  const kat = kategori.join(' ').toLowerCase();

  /*
   * The separator is a hyphen, not a dot: the ids are `zephyr.lang-elm`,
   * `zephyr.tema-kertas`, `zephyr.ikon-bulat`. Matching on `zephyr.lang.` let
   * every language pack fall through to the generic box, which is what put a
   * hundred identical outlines on the tab.
   */
  if (id.startsWith('zephyr.lang-')) {
    const bahasa = id.slice('zephyr.lang-'.length).toLowerCase();
    const tinta = WARNA_BAHASA[bahasa] ?? hueDariNama(bahasa);
    const found = ikonFile(`x.${EKSTENSI_BAHASA[bahasa] ?? bahasa}`, bahasa);

    /*
     * `ikonFile` ends at the generic page glyph when it has nothing for the
     * name, so a match on that id is not a real icon — it is the absence of
     * one, and every such language would otherwise come out as the same grey
     * sheet. Those get a coloured chip carrying the language's initials, which
     * is at least distinguishable and still keyed to the language.
     */
    if (found.svg && found.id !== IKON_FILE) {
      return { svg: catTinta(found.svg, tinta), id: found.id, tinta };
    }
    return { svg: null, inisial: inisialBahasa(bahasa), id: `inisial-${bahasa}`, tinta };
  }

  if (kat.includes('theme') && !kat.includes('icon')) {
    return { svg: null, id: 'tema', warna: 'theme', tinta: WARNA_JENIS.theme };
  }
  if (kat.includes('icon')) {
    return { svg: null, id: 'ikon', warna: 'ikon', tinta: WARNA_JENIS.ikon };
  }
  if (kat.includes('keymap')) {
    return { svg: null, id: 'keymap', warna: 'keymap', tinta: WARNA_JENIS.keymap };
  }
  if (kat.includes('snippet')) {
    return { svg: null, id: 'snippet', warna: 'snippet', tinta: WARNA_JENIS.snippet };
  }

  return { svg: null, id: 'lain', warna: 'lain', tinta: WARNA_JENIS.lain };
}

/* Two letters, from the head of the name: `c` → C, `apl` → AP, `cobol` → CO. */
function inisialBahasa(bahasa: string): string {
  const bersih = bahasa.replace(/[^a-z0-9+#]/g, '');
  if (bersih.length <= 2) return bersih.toUpperCase();
  return (bersih[0] + bersih[1]).toUpperCase();
}
