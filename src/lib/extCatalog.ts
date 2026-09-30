export interface KatalogItem {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  categories: string[];
  
  logo: string;
  
  logoUrl?: string;
  
  logoColor?: string;
  
  bundled: boolean;
  
  untukBahasa?: string[];
  
  url?: string;
  unduhan?: number;
  rating?: number;
  
  perluRuntime?: boolean;
}

export const KATALOG_BUNDLED: KatalogItem[] = [
  {
    id: 'zephyr.tema-kertas',
    name: 'Paper Theme',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'A light theme with lower contrast, built for daytime in a bright room.',
    categories: ['Themes'],
    logo: '📄',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-sublime',
    name: 'Sublime-style Keymap',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Sublime Text chords you already know: Ctrl+P, Ctrl+Shift+D, Ctrl+K Ctrl+B.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },
  {
    id: 'zephyr.snippet-python',
    name: 'Snippet Python',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'main guard, def, class, try/except, list comprehension, pytest.',
    categories: ['Snippets'],
    logo: 'Py',
    bundled: true,
    untukBahasa: ['python'],
  },
  {
    id: 'zephyr.snippet-react',
    name: 'Snippet React + TS',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Komponen fungsi, useState, useEffect, custom hook, context.',
    categories: ['Snippets'],
    logo: '⚛',
    bundled: true,
    untukBahasa: ['typescript', 'tsx', 'javascript', 'jsx'],
  },
  {
    id: 'zephyr.ikon-bulat',
    name: 'Round Icons',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'File tree icon theme: language initials in each language official colour.',
    categories: ['Icon Themes'],
    logo: '⬤',
    bundled: true,
  },

  /* ── Icon themes ─────────────────────────────────────────────────────
     Three more looks for the file tree. The catalog shipped with one; the
     tree is the panel a user stares at all day, so the choice matters more
     than the count. */

  {
    id: 'zephyr.ikon-garis',
    name: 'Line Icons',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Monochrome: two-letter glyphs with no colour, for screens that are already busy.',
    categories: ['Icon Themes'],
    logo: '≡',
    bundled: true,
  },
  {
    id: 'zephyr.ikon-bahasa',
    name: 'Language Icons',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Each language gets its own official colour — TS blue, Go cyan, Rust orange.',
    categories: ['Icon Themes'],
    logo: '◐',
    bundled: true,
  },
  {
    id: 'zephyr.ikon-titik',
    name: 'Dot Icons',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'One coloured dot per language family, uniform otherwise.',
    categories: ['Icon Themes'],
    logo: '•',
    bundled: true,
  },

  /* ── Keymaps ─────────────────────────────────────────────────────────
     Chords only, no behaviour: they bind commands the app already has, so
     switching keymap never changes what Zephyr can do. */

  {
    id: 'zephyr.keymap-vim',
    name: 'Vim-style Keymap',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Ctrl+W then H/J/K/L to move between panes, Ctrl+W V for a vertical split.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-emacs',
    name: 'Emacs-style Keymap',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'C-x C-f opens a file, C-x C-s saves, C-x C-c closes, Alt+X lists commands.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-ide',
    name: 'JetBrains-style Keymap',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Ctrl+Shift+A finds an action, Alt+1 sidebar, Alt+9 panel, Ctrl+Alt+L formats.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },

  /* ── Snippets ────────────────────────────────────────────────────────
     One package per language. Each one binds to the languages it is written
     for, so it only appears where it can actually expand. */

  {
    id: 'zephyr.snippet-js',
    name: 'Snippet JavaScript',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'fetch + JSON, promise, destructuring, try/catch, arrow, console.log.',
    categories: ['Snippets'],
    logo: 'JS',
    bundled: true,
    untukBahasa: ['javascript', 'javascriptreact'],
  },
  {
    id: 'zephyr.snippet-go',
    name: 'Snippet Go',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'HTTP handlers with method guards, struct tags, error wrapping, goroutines, tests.',
    categories: ['Snippets'],
    logo: 'GO',
    bundled: true,
    untukBahasa: ['go'],
  },
  {
    id: 'zephyr.snippet-rust',
    name: 'Snippet Rust',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Struct derive, impl + konstruktor, Result, match, if let, test.',
    categories: ['Snippets'],
    logo: 'RS',
    bundled: true,
    untukBahasa: ['rust'],
  },
  {
    id: 'zephyr.snippet-css',
    name: 'Snippet CSS',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Flex center, grid kolom, media query, custom property, ellipsis.',
    categories: ['Snippets'],
    logo: 'CS',
    bundled: true,
    untukBahasa: ['css', 'scss'],
  },
  {
    id: 'zephyr.snippet-sql',
    name: 'Snippet SQL',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Select join, insert, update, create table, index, transactions.',
    categories: ['Snippets'],
    logo: 'SQ',
    bundled: true,
    untukBahasa: ['sql'],
  },

  /* ── Theme ───────────────────────────────────────────────────────────
     One more dark theme: the default is high-contrast, which is tiring on a
     long night session. */

  {
    id: 'zephyr.tema-malam',
    name: 'Night Theme',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Dark with lower contrast than the default, for long nights of work.',
    categories: ['Themes'],
    logo: '🌙',
    bundled: true,
  },
];

export const katalogById = (id: string) => KATALOG_BUNDLED.find((x) => x.id === id) ?? null;
