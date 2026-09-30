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
    name: 'Tema Kertas',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Tema terang kontras rendah, cocok untuk siang di ruang terbuka.',
    categories: ['Themes'],
    logo: '📄',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-sublime',
    name: 'Keymap ala Sublime',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Chord familiar Sublime Text: Ctrl+P, Ctrl+Shift+D, Ctrl+K Ctrl+B.',
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
    name: 'Ikon Bulat',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Icon theme file tree: inisial bahasa dengan warna resmi tiap bahasa.',
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
    name: 'Ikon Garis',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Monokrom: glyph dua huruf tanpa warna, untuk layar yang sudah ramai.',
    categories: ['Icon Themes'],
    logo: '≡',
    bundled: true,
  },
  {
    id: 'zephyr.ikon-bahasa',
    name: 'Ikon Bahasa',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Tiap bahasa dapat warna resminya sendiri — TS biru, Go sian, Rust jingga.',
    categories: ['Icon Themes'],
    logo: '◐',
    bundled: true,
  },
  {
    id: 'zephyr.ikon-titik',
    name: 'Ikon Titik',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Satu titik berwarna per kelompok bahasa, sisanya seragam.',
    categories: ['Icon Themes'],
    logo: '•',
    bundled: true,
  },

  /* ── Keymaps ─────────────────────────────────────────────────────────
     Chords only, no behaviour: they bind commands the app already has, so
     switching keymap never changes what Zephyr can do. */

  {
    id: 'zephyr.keymap-vim',
    name: 'Keymap ala Vim',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Ctrl+W lalu H/J/K/L untuk pindah pane, Ctrl+W V untuk split vertikal.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-emacs',
    name: 'Keymap ala Emacs',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'C-x C-f buka berkas, C-x C-s simpan, C-x C-c tutup, Alt+X daftar perintah.',
    categories: ['Keymaps'],
    logo: '⌨',
    bundled: true,
  },
  {
    id: 'zephyr.keymap-ide',
    name: 'Keymap ala JetBrains',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Ctrl+Shift+A cari aksi, Alt+1 sidebar, Alt+9 panel, Ctrl+Alt+L rapikan.',
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
    description: 'Handler HTTP dengan guard method, struct tag, err wrap, goroutine, test.',
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
    description: 'Select join, insert, update, create table, index, transaksi.',
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
    name: 'Tema Malam',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Gelap dengan kontras lebih rendah dari bawaan, untuk kerja malam lama.',
    categories: ['Themes'],
    logo: '🌙',
    bundled: true,
  },
];

export const katalogById = (id: string) => KATALOG_BUNDLED.find((x) => x.id === id) ?? null;
