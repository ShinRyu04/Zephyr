/**
 * Add four bundled themes so the marketplace's Themes category is not a pair.
 *
 * ## Why themes ship as EXTENSIONS and not as CSS
 *
 * The app has 19 themes hard-coded in `theme.css`. Those are the defaults and
 * they stay. A theme that ships here is a PACKAGE: a manifest plus a
 * `themes/*.json` colour map, loaded through `extLoader` exactly like a
 * marketplace theme. That is the path the reader asked to prove - "dibuktikan
 * muncul di Settings > Theme setelah enable" - and it only proves something if
 * the theme really travels through the extension loader.
 *
 * ## Palette rule
 *
 * Every map carries the same token set the two existing packages use (`--bg`,
 * `--fg`, the `--syn-*` family, and so on). A missing token is not "a small
 * omission": the extension loader warns about it and the theme renders with the
 * previous theme's colour in that slot - measured earlier in this project as a
 * theme that looked half-applied.
 *
 * Run once: node scratch/tambah-tema.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const EXTRA = 'src-tauri/src/ext_bundled_extra.rs';
const BUNDLED = 'src-tauri/src/ext_bundled.rs';

/** The four themes: id suffix, label, kind, and the full token map. */
const TEMA = [
  {
    suffix: 'samudra',
    label: 'Samudra',
    kind: 'dark',
    deskripsi: 'Deep blue dark theme with cool accents, for long reading on an OLED panel.',
    warna: {
      '--bg': '#0a1420', '--fg': '#d6e4f0', '--bg0': '#0a1420', '--bg1': '#0f1c2b', '--bg2': '#142436',
      '--bg3': '#1b3047', '--fg0': '#d6e4f0', '--fg1': '#a9c0d6', '--fg2': '#7891a8',
      '--accent': '#4a9eff', '--border': '#1e3a52', '--surface': '#0f1c2b', '--surface-2': '#142436',
      '--surface-3': '#1b3047', '--text': '#d6e4f0', '--text-secondary': '#a9c0d6', '--text-muted': '#7891a8',
      '--danger': '#ff6b6b', '--warning': '#ffc857', '--terminal-ansi-0': '#0a1420',
      '--editor-bg': '#0a1420', '--editor-gutter': '#4a6a85', '--editor-active-line': '#122436',
      '--editor-selection': '#1e4a70', '--syn-comment': '#5f7a91', '--syn-keyword': '#7cc4ff',
      '--syn-string': '#7fd6a0', '--syn-number': '#ffc857', '--syn-function': '#4a9eff',
      '--syn-variable': '#a9c0d6', '--syn-type': '#5fd3c4', '--syn-operator': '#7891a8',
      '--syn-tag': '#5fd3c4', '--syn-attr': '#7cc4ff', '--syn-invalid': '#ff6b6b',
    },
  },
  {
    suffix: 'hutan',
    label: 'Hutan',
    kind: 'dark',
    deskripsi: 'Muted forest green, low glare, for daylight work on a dark screen.',
    warna: {
      '--bg': '#0e1512', '--fg': '#d8e8dc', '--bg0': '#0e1512', '--bg1': '#141d18', '--bg2': '#1a2620',
      '--bg3': '#223229', '--fg0': '#d8e8dc', '--fg1': '#a8c4b0', '--fg2': '#7a9a84',
      '--accent': '#6ecf8e', '--border': '#24382c', '--surface': '#141d18', '--surface-2': '#1a2620',
      '--surface-3': '#223229', '--text': '#d8e8dc', '--text-secondary': '#a8c4b0', '--text-muted': '#7a9a84',
      '--danger': '#e8716b', '--warning': '#d9b45a', '--terminal-ansi-0': '#0e1512',
      '--editor-bg': '#0e1512', '--editor-gutter': '#4f6b58', '--editor-active-line': '#16211b',
      '--editor-selection': '#2a4436', '--syn-comment': '#63796a', '--syn-keyword': '#8fd6a4',
      '--syn-string': '#b8d98a', '--syn-number': '#d9b45a', '--syn-function': '#6ecf8e',
      '--syn-variable': '#a8c4b0', '--syn-type': '#79c9c0', '--syn-operator': '#7a9a84',
      '--syn-tag': '#79c9c0', '--syn-attr': '#8fd6a4', '--syn-invalid': '#e8716b',
    },
  },
  {
    suffix: 'senja-muda',
    label: 'Senja Muda',
    kind: 'light',
    deskripsi: 'Warm light theme with a soft peach cast, easier on the eyes than pure white.',
    warna: {
      '--bg': '#fdf6f0', '--fg': '#3a2e28', '--bg0': '#fdf6f0', '--bg1': '#f8ede3', '--bg2': '#f2e2d4',
      '--bg3': '#e8d3c1', '--fg0': '#3a2e28', '--fg1': '#5c4a40', '--fg2': '#8a7364',
      '--accent': '#c2612f', '--border': '#e0ccb8', '--surface': '#f8ede3', '--surface-2': '#f2e2d4',
      '--surface-3': '#e8d3c1', '--text': '#3a2e28', '--text-secondary': '#5c4a40', '--text-muted': '#8a7364',
      '--danger': '#b3352f', '--warning': '#9a6b12', '--terminal-ansi-0': '#3a2e28',
      '--editor-bg': '#fdf6f0', '--editor-gutter': '#b09a88', '--editor-active-line': '#f7e9dc',
      '--editor-selection': '#efd9c6', '--syn-comment': '#9c8574', '--syn-keyword': '#8a3fa0',
      '--syn-string': '#4f7a28', '--syn-number': '#c2612f', '--syn-function': '#2f6ba2',
      '--syn-variable': '#7a5c2e', '--syn-type': '#1f7a6f', '--syn-operator': '#8a7364',
      '--syn-tag': '#1f7a6f', '--syn-attr': '#2f6ba2', '--syn-invalid': '#b3352f',
    },
  },
  {
    suffix: 'monokrom',
    label: 'Monokrom',
    kind: 'dark',
    deskripsi: 'Greyscale only - no hue anywhere, for readers who want the text to be the only signal.',
    warna: {
      '--bg': '#111111', '--fg': '#e8e8e8', '--bg0': '#111111', '--bg1': '#181818', '--bg2': '#202020',
      '--bg3': '#2a2a2a', '--fg0': '#e8e8e8', '--fg1': '#b8b8b8', '--fg2': '#888888',
      '--accent': '#d0d0d0', '--border': '#2e2e2e', '--surface': '#181818', '--surface-2': '#202020',
      '--surface-3': '#2a2a2a', '--text': '#e8e8e8', '--text-secondary': '#b8b8b8', '--text-muted': '#888888',
      '--danger': '#d8d8d8', '--warning': '#c0c0c0', '--terminal-ansi-0': '#111111',
      '--editor-bg': '#111111', '--editor-gutter': '#5a5a5a', '--editor-active-line': '#1c1c1c',
      '--editor-selection': '#3a3a3a', '--syn-comment': '#7a7a7a', '--syn-keyword': '#f0f0f0',
      '--syn-string': '#c8c8c8', '--syn-number': '#d8d8d8', '--syn-function': '#e0e0e0',
      '--syn-variable': '#b8b8b8', '--syn-type': '#cccccc', '--syn-operator': '#9a9a9a',
      '--syn-tag': '#cccccc', '--syn-attr': '#e0e0e0', '--syn-invalid': '#f0f0f0',
    },
  },
];

/* ---- 1. Constants in ext_bundled_extra.rs ---- */
let extra = readFileSync(EXTRA, 'utf8');
const tambahan = [];

for (const t of TEMA) {
  const id = `zephyr.tema-${t.suffix}`;
  if (new RegExp(`id: "${id}"`).test(extra)) {
    console.log(`sudah ada, dilewati: ${id}`);
    continue;
  }
  const nama = `TEMA_${t.suffix.toUpperCase().replace(/-/g, '_')}`;
  const manifest = JSON.stringify(
    {
      id,
      name: `Tema ${t.label}`,
      publisher: 'zephyr',
      version: '1.0.0',
      description: t.deskripsi,
      engines: { zephyr: '>=1.0' },
      categories: ['Themes'],
      contributes: { themes: [{ label: t.label, kind: t.kind, path: `./themes/${t.suffix}.json` }] },
    },
    null,
    2,
  );
  const warna = JSON.stringify({ colors: t.warna }, null, 2);

  tambahan.push(
    `pub(super) const ${nama}: &str = r##"${manifest}"##;\n\n` +
      `pub(super) const ${nama}_JSON: &str = r##"${warna}"##;\n`,
  );
}

if (tambahan.length) {
  extra = extra.trimEnd() + '\n\n' + tambahan.join('\n');
  writeFileSync(EXTRA, extra);
}

/* ---- 2. Register in PAKET in ext_bundled.rs ---- */
let bundled = readFileSync(BUNDLED, 'utf8');
const daftar = [];
for (const t of TEMA) {
  const id = `zephyr.tema-${t.suffix}`;
  if (new RegExp(`"${id}",`).test(bundled)) {
    continue;
  }
  const nama = `TEMA_${t.suffix.toUpperCase().replace(/-/g, '_')}`;
  daftar.push(
    `    (\n        "${id}",\n        &[\n            ("zephyr-extension.json", extra::${nama}),\n            ("themes/${t.suffix}.json", extra::${nama}_JSON),\n        ],\n    ),`,
  );
}

if (daftar.length) {
  /*
   * Insert before the closing `];` of the PAKET array.
   *
   * The file uses CRLF, so the marker must match `\r\n` - an earlier version
   * searched for `\n];\n\nfn cari_paket` and never found it. Matching on the
   * function name alone and walking back to the bracket is robust to the line
   * endings.
   */
  const iFn = bundled.indexOf('fn cari_paket');
  const i = iFn < 0 ? -1 : bundled.lastIndexOf('];', iFn);
  if (i < 0) {
    console.error('GAGAL: penutup PAKET tidak ditemukan');
    process.exit(1);
  }
  bundled = bundled.slice(0, i) + daftar.join('\n') + '\n' + bundled.slice(i);
  writeFileSync(BUNDLED, bundled);
}

console.log(`ok: ${tambahan.length} tema ditambahkan (${TEMA.map((t) => t.label).join(', ')})`);
