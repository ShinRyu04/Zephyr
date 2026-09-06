// extCatalog.ts — katalog BUNDLED fase 19.3.
//
// Kenapa bundled, bukan unduhan: prompt 19.3 minta katalog yang bisa dicari &
// dipasang OFFLINE sebagai default. Jadi setiap item di sini punya paket nyata
// yang DITULIS Zephyr sendiri ke %APPDATA%\zephyr\extensions\<id>\ lewat
// `extensions_write_bundled` — bukan kartu mati seperti marketplace fase 13.
//
// Isinya sengaja hal yang benar-benar bisa dikerjakan model manifest-only:
// tema, keymap, snippet, bahasa (paket CM yang sudah ada / mode legacy), dan
// icon theme. TIDAK ada item yang butuh eksekusi JS — kalau ada, itu bohong ke
// user, karena v1 memang tidak menjalankan kode ekstensi (19.6).

export interface KatalogItem {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  categories: string[];
  /** 1-3 karakter untuk kotak logo (bundled / fallback) */
  logo: string;
  /** khusus remote: URL logo asli dari registry (dipakai <img>, bukan inisial) */
  logoUrl?: string;
  /** true = paketnya ada di dalam app (bisa dipasang offline) */
  bundled: boolean;
  /** bahasa yang membuat item ini direkomendasikan (19.1 RECOMMENDED) */
  untukBahasa?: string[];
  /** khusus remote: URL unduhan .zext */
  url?: string;
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
    id: 'zephyr.lang-toml',
    name: 'Bahasa TOML',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Syntax highlight .toml (Cargo.toml, pyproject.toml) via mode legacy.',
    categories: ['Languages'],
    logo: 'T',
    bundled: true,
    untukBahasa: ['rust', 'python'],
  },
  {
    id: 'zephyr.lang-lua',
    name: 'Bahasa Lua',
    publisher: 'zephyr',
    version: '1.0.0',
    description: 'Syntax highlight .lua untuk skrip Neovim/Love2D.',
    categories: ['Languages'],
    logo: 'Lu',
    bundled: true,
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
];

export const katalogById = (id: string) => KATALOG_BUNDLED.find((x) => x.id === id) ?? null;
