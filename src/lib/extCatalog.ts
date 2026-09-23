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

];

export const katalogById = (id: string) => KATALOG_BUNDLED.find((x) => x.id === id) ?? null;
