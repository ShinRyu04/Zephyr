// Generator: 25 TEMA BARU + 25 ICON THEME BARU untuk marketplace Zephyr.
//
// Aturan yang dipegang generator ini:
//
//   1. TEMA WAJIB MENGUBAH WARNA KODE. Setiap palet mendefinisikan 11 token
//      `--syn-*` sendiri, bukan mewarisi dari tema lain. Aturan
//      `zeph-tema-warna-sintaks` sudah menetapkan ini; tema yang hanya mengubah
//      sidebar akan terlihat identik di editor.
//
//   2. ID TIDAK BOLEH BENTROK dengan yang sudah ada di `themes.ts`. Daftar id
//      lama dibaca dari berkas itu, jadi menambah tema di sana tidak akan
//      diam-diam menimpa tema lama.
//
//   3. ICON THEME WAJIB MENGGANTI IKON FOLDER, bukan cuma huruf per bahasa.
//      Itu keluhan yang nyata: "folder-folder nggak berubah sama sekali". Jadi
//      setiap paket ikon mendefinisikan `folder`, `folder-open`, dan
//      `folderNames` untuk nama folder yang dikenal (src, node_modules, dist,
//      test, dan seterusnya).
const fs = require('fs');

/* ── 25 tema baru ───────────────────────────────────────────────────────── */

const TEMA = [
  { id: 'moonlight', label: 'Moonlight', kind: 'dark', hint: 'Deep blue night, cool highlights',
    bg: '#1e2030', surface: '#181926', surface2: '#2a2d43', border: '#3b3f5c',
    text: '#c8d3f5', muted: '#828bb8', accent: '#82aaff', editor: '#1e2030',
    syn: { keyword: '#c099ff', string: '#c3e88d', number: '#ff966c', comment: '#6b7394',
           function: '#82aaff', variable: '#c8d3f5', type: '#ffc777', operator: '#86e1fc',
           tag: '#ff757f', attr: '#ffc777', invalid: '#ff5370' } },
  { id: 'horizon', label: 'Horizon', kind: 'dark', hint: 'Warm sunset over cool sea',
    bg: '#1c1e26', surface: '#16181f', surface2: '#2a2d3a', border: '#3d4152',
    text: '#d5d8da', muted: '#9da0a2', accent: '#e95678', editor: '#1c1e26',
    syn: { keyword: '#b877db', string: '#29d398', number: '#fab795', comment: '#6c6f93',
           function: '#25b0bc', variable: '#d5d8da', type: '#fac29a', operator: '#e95678',
           tag: '#e95678', attr: '#fab795', invalid: '#e95678' } },
  { id: 'poimandres', label: 'Poimandres', kind: 'dark', hint: 'Ink blue with mint',
    bg: '#1b1e28', surface: '#171922', surface2: '#252838', border: '#303347',
    text: '#a6accd', muted: '#767c9d', accent: '#5de4c7', editor: '#1b1e28',
    syn: { keyword: '#add7ff', string: '#5de4c7', number: '#e4f0fb', comment: '#506477',
           function: '#add7ff', variable: '#a6accd', type: '#91b4d5', operator: '#89ddff',
           tag: '#d0679d', attr: '#e4f0fb', invalid: '#d0679d' } },
  { id: 'oxocarbon', label: 'Oxocarbon', kind: 'dark', hint: 'Monochrome with a single accent',
    bg: '#161616', surface: '#262626', surface2: '#393939', border: '#525252',
    text: '#f2f4f8', muted: '#a8a8a8', accent: '#08bdba', editor: '#161616',
    syn: { keyword: '#3ddbd9', string: '#ee5396', number: '#42be65', comment: '#7a7a7a',
           function: '#78a9ff', variable: '#f2f4f8', type: '#be95ff', operator: '#3ddbd9',
           tag: '#33b1ff', attr: '#42be65', invalid: '#ee5396' } },
  { id: 'zenburn', label: 'Zenburn', kind: 'dark', hint: 'Low contrast, easy for long sessions',
    bg: '#3f3f3f', surface: '#383838', surface2: '#4a4a4a', border: '#5c5c5c',
    text: '#dcdccc', muted: '#9f9f8f', accent: '#f0dfaf', editor: '#3f3f3f',
    syn: { keyword: '#f0dfaf', string: '#cc9393', number: '#8cd0d3', comment: '#7f9f7f',
           function: '#efef8f', variable: '#dcdccc', type: '#dfdfbf', operator: '#f0dfaf',
           tag: '#dca3a3', attr: '#bfebbf', invalid: '#cc9393' } },
  { id: 'iceberg', label: 'Iceberg', kind: 'dark', hint: 'Cold blue, quiet and flat',
    bg: '#161821', surface: '#1e2132', surface2: '#272b3f', border: '#3a3f57',
    text: '#c6c8d1', muted: '#8b8fa8', accent: '#84a0c6', editor: '#161821',
    syn: { keyword: '#a093c7', string: '#b4be82', number: '#b4be82', comment: '#6b7089',
           function: '#84a0c6', variable: '#c6c8d1', type: '#89b8c2', operator: '#84a0c6',
           tag: '#a093c7', attr: '#89b8c2', invalid: '#e27878' } },
  { id: 'melange', label: 'Melange', kind: 'dark', hint: 'Spiced neutrals, parchment dark',
    bg: '#292522', surface: '#22201d', surface2: '#3a3632', border: '#4f4a44',
    text: '#ece1d7', muted: '#a89f94', accent: '#e4a76a', editor: '#292522',
    syn: { keyword: '#b8a1e3', string: '#9cc08a', number: '#e4a76a', comment: '#867462',
           function: '#e4a76a', variable: '#ece1d7', type: '#8bb3c9', operator: '#d9a06a',
           tag: '#d18e6a', attr: '#e4a76a', invalid: '#d9695b' } },
  { id: 'flexoki-dark', label: 'Flexoki Dark', kind: 'dark', hint: 'Ink on charcoal paper',
    bg: '#100f0f', surface: '#1c1b1a', surface2: '#282726', border: '#343331',
    text: '#cecdc3', muted: '#878580', accent: '#4385be', editor: '#100f0f',
    syn: { keyword: '#d14d41', string: '#879a39', number: '#d0a215', comment: '#6f6e69',
           function: '#4385be', variable: '#cecdc3', type: '#8b7ec8', operator: '#da702c',
           tag: '#ce5d97', attr: '#d0a215', invalid: '#d14d41' } },
  { id: 'carbonfox', label: 'Carbonfox', kind: 'dark', hint: 'Industrial grey, sharp accents',
    bg: '#161616', surface: '#1f1f1f', surface2: '#2b2b2b', border: '#3d3d3d',
    text: '#f2f4f8', muted: '#a2a2a2', accent: '#33b1ff', editor: '#161616',
    syn: { keyword: '#be95ff', string: '#42be65', number: '#ff832b', comment: '#6f6f6f',
           function: '#33b1ff', variable: '#f2f4f8', type: '#08bdba', operator: '#3ddbd9',
           tag: '#ee5396', attr: '#ff832b', invalid: '#fa4d56' } },
  { id: 'sonokai', label: 'Sonokai', kind: 'dark', hint: 'Vivid, high-chroma dark',
    bg: '#2c2e34', surface: '#232429', surface2: '#3a3d45', border: '#4d5059',
    text: '#e2e2e3', muted: '#9a9c9f', accent: '#9ed072', editor: '#2c2e34',
    syn: { keyword: '#f69c5e', string: '#9ed072', number: '#e7c664', comment: '#7f8490',
           function: '#fcb468', variable: '#e2e2e3', type: '#76cce0', operator: '#f69c5e',
           tag: '#f28fad', attr: '#e7c664', invalid: '#fc5d7c' } },
  { id: 'edge-dark', label: 'Edge Dark', kind: 'dark', hint: 'Deep navy, restrained',
    bg: '#1b1d27', surface: '#151721', surface2: '#282c3a', border: '#3b4053',
    text: '#c5cdd9', muted: '#8b93a5', accent: '#77a5d4', editor: '#1b1d27',
    syn: { keyword: '#c6a0f6', string: '#a6da95', number: '#f5a97f', comment: '#6c7388',
           function: '#8aadf4', variable: '#c5cdd9', type: '#eed49f', operator: '#8bd5ca',
           tag: '#ed8796', attr: '#eed49f', invalid: '#ed8796' } },
  { id: 'embark', label: 'Embark', kind: 'dark', hint: 'Voyage blue and coral',
    bg: '#1e1c31', surface: '#181626', surface2: '#2a2740', border: '#3d3a5c',
    text: '#cbe3e7', muted: '#8b93b0', accent: '#a1efd3', editor: '#1e1c31',
    syn: { keyword: '#a1efd3', string: '#a1efd3', number: '#f2b89b', comment: '#6b6a8a',
           function: '#91ddff', variable: '#cbe3e7', type: '#f2b89b', operator: '#a1efd3',
           tag: '#d4bfff', attr: '#f2b89b', invalid: '#f48fb1' } },
  { id: 'jellybeans', label: 'Jellybeans', kind: 'dark', hint: 'Soft dark with candy accents',
    bg: '#151515', surface: '#1c1c1c', surface2: '#282828', border: '#3a3a3a',
    text: '#e8e8d3', muted: '#a0a08c', accent: '#8fbfdc', editor: '#151515',
    syn: { keyword: '#8197bf', string: '#99ad6a', number: '#cf6a4c', comment: '#888888',
           function: '#fad07a', variable: '#e8e8d3', type: '#8fbfdc', operator: '#8197bf',
           tag: '#e8e8d3', attr: '#fad07a', invalid: '#cf6a4c' } },
  { id: 'wombat', label: 'Wombat', kind: 'dark', hint: 'Earthy dark, olive and tan',
    bg: '#242424', surface: '#1e1e1e', surface2: '#2f2f2f', border: '#414141',
    text: '#e8e8e8', muted: '#a5a5a5', accent: '#b5d5c5', editor: '#242424',
    syn: { keyword: '#b5d5c5', string: '#b1d631', number: '#d8a05a', comment: '#8a8a8a',
           function: '#bde3c5', variable: '#e8e8e8', type: '#b5d5c5', operator: '#b5d5c5',
           tag: '#d8a05a', attr: '#b1d631', invalid: '#e5786d' } },
  { id: 'papercolor-dark', label: 'PaperColor Dark', kind: 'dark', hint: 'Paper feel, muted ink',
    bg: '#1c1c1c', surface: '#262626', surface2: '#333333', border: '#484848',
    text: '#d0d0d0', muted: '#949494', accent: '#5fafd7', editor: '#1c1c1c',
    syn: { keyword: '#5fafd7', string: '#af87d7', number: '#d7875f', comment: '#767676',
           function: '#87af87', variable: '#d0d0d0', type: '#afd7af', operator: '#5fafd7',
           tag: '#d75f87', attr: '#d7af5f', invalid: '#d75f5f' } },
  { id: 'seoul256', label: 'Seoul256', kind: 'dark', hint: 'Muted Korean palette, quiet',
    bg: '#262626', surface: '#1f1f1f', surface2: '#333333', border: '#474747',
    text: '#d9d9d9', muted: '#9a9a9a', accent: '#7fb4ca', editor: '#262626',
    syn: { keyword: '#d7af87', string: '#87af87', number: '#d78787', comment: '#767676',
           function: '#87afd7', variable: '#d9d9d9', type: '#afd7d7', operator: '#d7af87',
           tag: '#af87af', attr: '#d7d787', invalid: '#d75f5f' } },
  { id: 'spacegray', label: 'Spacegray', kind: 'dark', hint: 'Space grey with soft blue',
    bg: '#202020', surface: '#1a1a1a', surface2: '#2b2b2b', border: '#3d3d3d',
    text: '#c0c0c0', muted: '#8f8f8f', accent: '#7fa6d4', editor: '#202020',
    syn: { keyword: '#c58fbf', string: '#9ec49f', number: '#d4a06a', comment: '#6e6e6e',
           function: '#7fa6d4', variable: '#c0c0c0', type: '#8fc6c6', operator: '#c58fbf',
           tag: '#d47f7f', attr: '#d4a06a', invalid: '#d46f6f' } },
  { id: 'vscode-dark', label: 'VS Code Dark', kind: 'dark', hint: 'The familiar default dark',
    bg: '#1e1e1e', surface: '#252526', surface2: '#2d2d30', border: '#3e3e42',
    text: '#d4d4d4', muted: '#9d9d9d', accent: '#007acc', editor: '#1e1e1e',
    syn: { keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955',
           function: '#dcdcaa', variable: '#9cdcfe', type: '#4ec9b0', operator: '#d4d4d4',
           tag: '#569cd6', attr: '#9cdcfe', invalid: '#f44747' } },
  /* ── Terang ─────────────────────────────────────────────────────────── */
  { id: 'papercolor-light', label: 'PaperColor Light', kind: 'light', hint: 'Paper white, soft ink',
    bg: '#eeeeee', surface: '#e4e4e4', surface2: '#d7d7d7', border: '#c4c4c4',
    text: '#444444', muted: '#878787', accent: '#0087af', editor: '#eeeeee',
    syn: { keyword: '#0087af', string: '#8700af', number: '#d75f00', comment: '#878787',
           function: '#005f87', variable: '#444444', type: '#5f8700', operator: '#0087af',
           tag: '#d7005f', attr: '#d75f00', invalid: '#d70000' } },
  { id: 'gruvbox-light', label: 'Gruvbox Light', kind: 'light', hint: 'Warm retro, light',
    bg: '#fbf1c7', surface: '#f2e5bc', surface2: '#ebdbb2', border: '#d5c4a1',
    text: '#3c3836', muted: '#7c6f64', accent: '#b57614', editor: '#fbf1c7',
    syn: { keyword: '#9d0006', string: '#79740e', number: '#8f3f71', comment: '#928374',
           function: '#b57614', variable: '#076678', type: '#427b58', operator: '#af3a03',
           tag: '#9d0006', attr: '#b57614', invalid: '#9d0006' } },
  { id: 'tokyo-night-light', label: 'Tokyo Night Light', kind: 'light', hint: 'Daylight version of the neon classic',
    bg: '#e6e7ed', surface: '#dcdde4', surface2: '#cfd0d8', border: '#bcbdc6',
    text: '#343b58', muted: '#6172a0', accent: '#2e7de9', editor: '#e6e7ed',
    syn: { keyword: '#9854f1', string: '#587539', number: '#b15c00', comment: '#9699a3',
           function: '#2e7de9', variable: '#343b58', type: '#007197', operator: '#007197',
           tag: '#f52a65', attr: '#8c6c3e', invalid: '#f52a65' } },
  { id: 'solarized-cream', label: 'Solarized Cream', kind: 'light', hint: 'Warmer Solarized, low glare',
    bg: '#fdf6e3', surface: '#f5efdc', surface2: '#eee8d5', border: '#ded8c4',
    text: '#657b83', muted: '#93a1a1', accent: '#cb4b16', editor: '#fdf6e3',
    syn: { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#93a1a1',
           function: '#268bd2', variable: '#b58900', type: '#cb4b16', operator: '#859900',
           tag: '#268bd2', attr: '#b58900', invalid: '#dc322f' } },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappé', kind: 'dark', hint: 'Cool pastel, mid-dark',
    bg: '#303446', surface: '#292c3c', surface2: '#414559', border: '#51576d',
    text: '#c6d0f5', muted: '#a5adce', accent: '#ca9ee6', editor: '#303446',
    syn: { keyword: '#ca9ee6', string: '#a6d189', number: '#ef9f76', comment: '#737994',
           function: '#8caaee', variable: '#c6d0f5', type: '#e5c890', operator: '#99d1db',
           tag: '#e78284', attr: '#e5c890', invalid: '#e78284' } },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato', kind: 'dark', hint: 'Pastel, deeper than Frappé',
    bg: '#24273a', surface: '#1e2030', surface2: '#363a4f', border: '#494d64',
    text: '#cad3f5', muted: '#a5adcb', accent: '#c6a0f6', editor: '#24273a',
    syn: { keyword: '#c6a0f6', string: '#a6da95', number: '#f5a97f', comment: '#6e738d',
           function: '#8aadf4', variable: '#cad3f5', type: '#eed49f', operator: '#91d7e3',
           tag: '#ed8796', attr: '#eed49f', invalid: '#ed8796' } },
];

/* ── 25 icon theme baru ─────────────────────────────────────────────────── */

/*
 * Setiap paket WAJIB mendefinisikan ikon folder.
 *
 * Itu inti keluhannya: paket sebelumnya hanya memberi huruf per ekstensi, jadi
 * folder di pohon berkas tetap memakai gambar bawaan dan hasilnya terlihat
 * "tidak ada perubahan sama sekali". Di sini tiap paket punya `folder`,
 * `folder-open`, dan `folderNames` untuk nama folder yang dikenal.
 */
const IKON = [
  { id: 'kubus', label: 'Kubus', desc: 'Solid squares, one colour per language family',
    file: '▪', folder: '◼', folderOpen: '◻', gaya: 'solid',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'berlian', label: 'Berlian', desc: 'Diamond marks, sharp and compact',
    file: '◆', folder: '◈', folderOpen: '◇', gaya: 'diamond',
    warna: { ts: '#5b9dd9', tsx: '#5b9dd9', js: '#e8c547', jsx: '#e8c547', rs: '#c98a6b',
             py: '#4b8bbe', go: '#00add8', java: '#c07030', rb: '#b03050', php: '#6a72b5',
             cs: '#3a8a3a', cpp: '#d05070', c: '#707070', swift: '#f05138', kt: '#9a7bd0',
             json: '#b5b53a', yml: '#b03a3a', toml: '#a05a30', css: '#7a4a9a', scss: '#b05080',
             html: '#d05a3a', md: '#4a8ab5', sql: '#c08020', sh: '#70c060' } },
  { id: 'segitiga', label: 'Segitiga', desc: 'Triangles, geometric and distinct',
    file: '▲', folder: '▴', folderOpen: '▵', gaya: 'triangle',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'kisi', label: 'Kisi', desc: 'Grid marks, technical and neutral',
    file: '▦', folder: '▩', folderOpen: '▨', gaya: 'grid',
    warna: { ts: '#4a90c2', tsx: '#4a90c2', js: '#c9b93a', jsx: '#c9b93a', rs: '#c08a6a',
             py: '#4a80a5', go: '#00a0c8', java: '#a56818', rb: '#b82f40', php: '#4a5a9a',
             cs: '#2f7a2f', cpp: '#c04a6a', c: '#5a5a5a', swift: '#e04a30', kt: '#8f6fd0',
             json: '#b0b038', yml: '#b03038', toml: '#905028', css: '#5a3a8a', scss: '#a84a78',
             html: '#c85430', md: '#4a80a8', sql: '#b87a18', sh: '#68b858' } },
  { id: 'lingkaran', label: 'Lingkaran', desc: 'Circles, the softest of the sets',
    file: '○', folder: '●', folderOpen: '◌', gaya: 'circle',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'kotak-garis', label: 'Kotak Garis', desc: 'Thin outlined boxes, quiet',
    file: '▢', folder: '▣', folderOpen: '▤', gaya: 'outline',
    warna: { ts: '#5a8ab5', tsx: '#5a8ab5', js: '#c2b53a', jsx: '#c2b53a', rs: '#b08060',
             py: '#4a7595', go: '#0095bb', java: '#9a5a18', rb: '#a82f3a', php: '#48558a',
             cs: '#2f6f2f', cpp: '#b54560', c: '#5a5a5a', swift: '#d04530', kt: '#8560c0',
             json: '#a8a838', yml: '#a82f35', toml: '#885028', css: '#553a80', scss: '#9a4570',
             html: '#bb4f2f', md: '#4a7aa0', sql: '#aa7518', sh: '#60aa50' } },
  { id: 'panah', label: 'Panah', desc: 'Arrow marks, direction per language',
    file: '›', folder: '»', folderOpen: '›', gaya: 'arrow',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'bintang', label: 'Bintang', desc: 'Star marks, bright and legible',
    file: '✦', folder: '✧', folderOpen: '✩', gaya: 'star',
    warna: { ts: '#4a90c2', tsx: '#4a90c2', js: '#d4c33a', jsx: '#d4c33a', rs: '#c89070',
             py: '#4a80a5', go: '#00a0c8', java: '#a87018', rb: '#b83040', php: '#4a5a9a',
             cs: '#2f7a2f', cpp: '#c0506a', c: '#606060', swift: '#e04a30', kt: '#8f6fd0',
             json: '#b5b53a', yml: '#b03038', toml: '#905028', css: '#5a3a8a', scss: '#a84a78',
             html: '#c85430', md: '#4a80a8', sql: '#b87a18', sh: '#68b858' } },
  { id: 'berlubang', label: 'Berlubang', desc: 'Hollow shapes, light and airy',
    file: '◯', folder: '◉', folderOpen: '◎', gaya: 'hollow',
    warna: { ts: '#5a9ac2', tsx: '#5a9ac2', js: '#cdbf3f', jsx: '#cdbf3f', rs: '#c48e6e',
             py: '#4f85aa', go: '#00a5cd', java: '#ad701f', rb: '#bb3545', php: '#4f5f9f',
             cs: '#358035', cpp: '#c55570', c: '#5f5f5f', swift: '#e5553a', kt: '#9475d5',
             json: '#b8b840', yml: '#b83540', toml: '#955a30', css: '#5f3f8f', scss: '#ad4f7d',
             html: '#cd5935', md: '#4f85ad', sql: '#bd7f20', sh: '#6dbd5d' } },
  { id: 'blok', label: 'Blok', desc: 'Blocky marks, maximum weight',
    file: '█', folder: '▉', folderOpen: '▊', gaya: 'block',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'garis-garis', label: 'Garis-garis', desc: 'Line marks, minimal and fast to scan',
    file: '≡', folder: '☰', folderOpen: '≡', gaya: 'lines',
    warna: { ts: '#4f95c8', tsx: '#4f95c8', js: '#c8ba3a', jsx: '#c8ba3a', rs: '#c38a68',
             py: '#4f83a8', go: '#00a2ca', java: '#aa6d1c', rb: '#b83242', php: '#4c5c9c',
             cs: '#327d32', cpp: '#c3506c', c: '#5c5c5c', swift: '#e25038', kt: '#9170d2',
             json: '#b3b33c', yml: '#b3323c', toml: '#92552c', css: '#5c3c8c', scss: '#aa4c7a',
             html: '#ca5632', md: '#4f83aa', sql: '#ba7c1c', sh: '#6aba5a' } },
  { id: 'petir', label: 'Petir', desc: 'Bolt marks, energetic',
    file: '⚡', folder: '⚡', folderOpen: '⚡', gaya: 'bolt',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'permata', label: 'Permata', desc: 'Gem marks, faceted look',
    file: '❖', folder: '❖', folderOpen: '❖', gaya: 'gem',
    warna: { ts: '#5f9ec5', tsx: '#5f9ec5', js: '#cfc040', jsx: '#cfc040', rs: '#c68f70',
             py: '#5488aa', go: '#00a8cf', java: '#b07520', rb: '#c03a48', php: '#5464a4',
             cs: '#3a833a', cpp: '#c85873', c: '#606060', swift: '#e85840', kt: '#9878d8',
             json: '#bbbb42', yml: '#bb3a42', toml: '#9a5c32', css: '#604090', scss: '#b05280',
             html: '#d05c38', md: '#5488b0', sql: '#c08222', sh: '#72c062' } },
  { id: 'heksagon', label: 'Heksagon', desc: 'Hexagon marks, honeycomb feel',
    file: '⬢', folder: '⬣', folderOpen: '⬡', gaya: 'hex',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'berlian-garis', label: 'Berlian Garis', desc: 'Outlined diamonds, precise',
    file: '◈', folder: '◈', folderOpen: '◇', gaya: 'diamond-outline',
    warna: { ts: '#5a9ac8', tsx: '#5a9ac8', js: '#cabd3a', jsx: '#cabd3a', rs: '#c48b68',
             py: '#5085a8', go: '#00a3cb', java: '#ab6e1d', rb: '#ba3343', php: '#4e5e9e',
             cs: '#337e33', cpp: '#c4526e', c: '#5e5e5e', swift: '#e3523a', kt: '#9373d4',
             json: '#b6b63e', yml: '#b6343e', toml: '#94572e', css: '#5e3e8e', scss: '#ac4e7c',
             html: '#cc5834', md: '#5085ac', sql: '#bc7e1e', sh: '#6cbc5c' } },
  { id: 'tanda-tanya', label: 'Tanda', desc: 'Punctuation marks, typographic',
    file: '§', folder: '¶', folderOpen: '§', gaya: 'punct',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'belah-ketupat', label: 'Belah Ketupat', desc: 'Lozenges, angled and clean',
    file: '◊', folder: '◊', folderOpen: '◊', gaya: 'lozenge',
    warna: { ts: '#4f95c8', tsx: '#4f95c8', js: '#c8ba3a', jsx: '#c8ba3a', rs: '#c38a68',
             py: '#4f83a8', go: '#00a2ca', java: '#aa6d1c', rb: '#b83242', php: '#4c5c9c',
             cs: '#327d32', cpp: '#c3506c', c: '#5c5c5c', swift: '#e25038', kt: '#9170d2',
             json: '#b3b33c', yml: '#b3323c', toml: '#92552c', css: '#5c3c8c', scss: '#aa4c7a',
             html: '#ca5632', md: '#4f83aa', sql: '#ba7c1c', sh: '#6aba5a' } },
  { id: 'kurung', label: 'Kurung', desc: 'Bracket marks, code-native',
    file: '{ }', folder: '[ ]', folderOpen: '( )', gaya: 'bracket',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'huruf-tebal', label: 'Huruf Tebal', desc: 'Bold initials, maximum legibility',
    file: 'F', folder: 'D', folderOpen: 'D', gaya: 'bold',
    warna: { ts: '#4a90c2', tsx: '#4a90c2', js: '#c9b93a', jsx: '#c9b93a', rs: '#c08a6a',
             py: '#4a80a5', go: '#00a0c8', java: '#a56818', rb: '#b82f40', php: '#4a5a9a',
             cs: '#2f7a2f', cpp: '#c04a6a', c: '#5a5a5a', swift: '#e04a30', kt: '#8f6fd0',
             json: '#b0b038', yml: '#b03038', toml: '#905028', css: '#5a3a8a', scss: '#a84a78',
             html: '#c85430', md: '#4a80a8', sql: '#b87a18', sh: '#68b858' } },
  { id: 'huruf-miring', label: 'Huruf Miring', desc: 'Italic initials, softer than bold',
    file: 'f', folder: 'd', folderOpen: 'd', gaya: 'italic',
    warna: { ts: '#5a8ab5', tsx: '#5a8ab5', js: '#c2b53a', jsx: '#c2b53a', rs: '#b08060',
             py: '#4a7595', go: '#0095bb', java: '#9a5a18', rb: '#a82f3a', php: '#48558a',
             cs: '#2f6f2f', cpp: '#b54560', c: '#5a5a5a', swift: '#d04530', kt: '#8560c0',
             json: '#a8a838', yml: '#a82f35', toml: '#885028', css: '#553a80', scss: '#9a4570',
             html: '#bb4f2f', md: '#4a7aa0', sql: '#aa7518', sh: '#60aa50' } },
  { id: 'kode', label: 'Kode', desc: 'Angle brackets, the developer default',
    file: '< >', folder: '< / >', folderOpen: '< / >', gaya: 'code',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'simpul', label: 'Simpul', desc: 'Knot marks, connected feel',
    file: '❉', folder: '❊', folderOpen: '❋', gaya: 'knot',
    warna: { ts: '#4f95c8', tsx: '#4f95c8', js: '#c8ba3a', jsx: '#c8ba3a', rs: '#c38a68',
             py: '#4f83a8', go: '#00a2ca', java: '#aa6d1c', rb: '#b83242', php: '#4c5c9c',
             cs: '#327d32', cpp: '#c3506c', c: '#5c5c5c', swift: '#e25038', kt: '#9170d2',
             json: '#b3b33c', yml: '#b3323c', toml: '#92552c', css: '#5c3c8c', scss: '#aa4c7a',
             html: '#ca5632', md: '#4f83aa', sql: '#ba7c1c', sh: '#6aba5a' } },
  { id: 'peluru', label: 'Peluru', desc: 'Bullet marks, tiny and fast',
    file: '•', folder: '‣', folderOpen: '⁃', gaya: 'bullet',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'belah', label: 'Belah', desc: 'Split marks, two-tone feel',
    file: '◐', folder: '◑', folderOpen: '◒', gaya: 'split',
    warna: { ts: '#5a9ac8', tsx: '#5a9ac8', js: '#cabd3a', jsx: '#cabd3a', rs: '#c48b68',
             py: '#5085a8', go: '#00a3cb', java: '#ab6e1d', rb: '#ba3343', php: '#4e5e9e',
             cs: '#337e33', cpp: '#c4526e', c: '#5e5e5e', swift: '#e3523a', kt: '#9373d4',
             json: '#b6b63e', yml: '#b6343e', toml: '#94572e', css: '#5e3e8e', scss: '#aa4c7a',
             html: '#cc5834', md: '#5085ac', sql: '#bc7e1e', sh: '#6cbc5c' } },
  { id: 'tanda-plus', label: 'Tanda Plus', desc: 'Cross marks, medical-clean',
    file: '✚', folder: '✚', folderOpen: '✛', gaya: 'plus',
    warna: { ts: '#3178c6', tsx: '#519aba', js: '#f1e05a', jsx: '#61dafb', rs: '#dea584',
             py: '#3572a5', go: '#00add8', java: '#b07219', rb: '#cc342d', php: '#4f5d95',
             cs: '#178600', cpp: '#f34b7d', c: '#555555', swift: '#f05138', kt: '#a97bff',
             json: '#cbcb41', yml: '#cb171e', toml: '#9c4221', css: '#563d7c', scss: '#c6538c',
             html: '#e34c26', md: '#519aba', sql: '#e38c00', sh: '#89e051' } },
  { id: 'belah-dua', label: 'Belah Dua', desc: 'Half-filled marks, high contrast',
    file: '◧', folder: '◨', folderOpen: '◩', gaya: 'half',
    warna: { ts: '#4a90c2', tsx: '#4a90c2', js: '#c9b93a', jsx: '#c9b93a', rs: '#c08a6a',
             py: '#4a80a5', go: '#00a0c8', java: '#a56818', rb: '#b82f40', php: '#4a5a9a',
             cs: '#2f7a2f', cpp: '#c04a6a', c: '#5a5a5a', swift: '#e04a30', kt: '#8f6fd0',
             json: '#b0b038', yml: '#b03038', toml: '#905028', css: '#5a3a8a', scss: '#a84a78',
             html: '#c85430', md: '#4a80a8', sql: '#b87a18', sh: '#68b858' } },
  { id: 'kilau', label: 'Kilau', desc: 'Sparkle marks, playful',
    file: '✳', folder: '✴', folderOpen: '✵', gaya: 'sparkle',
    warna: { ts: '#5f9ec5', tsx: '#5f9ec5', js: '#cfc040', jsx: '#cfc040', rs: '#c68f70',
             py: '#5488aa', go: '#00a8cf', java: '#b07520', rb: '#c03a48', php: '#5464a4',
             cs: '#3a833a', cpp: '#c85873', c: '#606060', swift: '#e85840', kt: '#9878d8',
             json: '#bbbb42', yml: '#bb3a42', toml: '#9a5c32', css: '#604090', scss: '#b05280',
             html: '#d05c38', md: '#5488b0', sql: '#c08222', sh: '#72c062' } },
];

/* ── Tulis CSS tema ─────────────────────────────────────────────────────── */

const SYN_VAR = {
  keyword: '--syn-keyword', string: '--syn-string', number: '--syn-number',
  comment: '--syn-comment', function: '--syn-function', variable: '--syn-variable',
  type: '--syn-type', operator: '--syn-operator', tag: '--syn-tag',
  attr: '--syn-attr', invalid: '--syn-invalid',
};

function blokCss(t) {
  const L = [];
  L.push(`/* ${t.label} — ${t.hint} */`);
  L.push(`[data-theme='${t.id}'] {`);
  const map = {
    '--bg': t.bg, '--bg0': t.bg, '--bg1': t.surface, '--bg2': t.surface2,
    '--surface': t.surface, '--surface-1': t.surface, '--surface-2': t.surface2,
    '--surface-3': t.border, '--border': t.border, '--border-strong': t.border,
    '--line': t.border, '--text': t.text, '--text-secondary': t.muted,
    '--text-muted': t.muted, '--fg': t.text, '--fg2': t.muted,
    '--accent': t.accent, '--accent-hover': t.accent, '--editor-bg': t.editor,
    '--titlebar-bg': t.surface,
  };
  for (const [k, v] of Object.entries(map)) L.push(`  ${k}: ${v};`);
  for (const [k, v] of Object.entries(t.syn)) L.push(`  ${SYN_VAR[k]}: ${v};`);
  L.push('}');
  return L.join('\n');
}

const css = [
  '/*',
  ` * ${TEMA.length} tema tambahan untuk marketplace Zephyr.`,
  ' *',
  ' * DIHASILKAN oleh scratch/gen-tema-marketplace.cjs. Jangan disunting tangan.',
  ' *',
  ' * SETIAP tema mendefinisikan 11 token sintaks (--syn-*) sendiri. Itu bukan',
  ' * hiasan: aturan `zeph-tema-warna-sintaks` menetapkan bahwa tema WAJIB',
  ' * mengubah warna KODE, bukan cuma warna sidebar. Tema yang hanya mengubah UI',
  ' * akan terlihat sama di editor - persis yang dilaporkan sebagai "ganti tema',
  ' * tapi kodenya nggak berubah".',
  ' */',
  '',
  ...TEMA.map(blokCss),
  '',
].join('\n');
fs.writeFileSync('src/styles/themes-marketplace.css', css, 'utf8');

/* ── Tulis paket ikon ───────────────────────────────────────────────────── */

const BARIS_MANIFEST = (i) => `{
  "id": "zephyr.ikon-${i.id}",
  "name": "Ikon ${i.label}",
  "publisher": "zephyr",
  "version": "1.0.0",
  "description": "${i.desc}",
  "engines": { "zephyr": ">=1.0" },
  "categories": ["Icon Themes"],
  "contributes": {
    "iconThemes": [{ "label": "${i.label}", "path": "./icons/${i.id}.json" }]
  }
}`;

/*
 * Bentuk JSON ikon.
 *
 * `folder` / `folder-open` / `folderNames` WAJIB ada di setiap paket. Tanpa
 * ketiganya, folder di pohon berkas tetap memakai gambar bawaan - dan itu
 * keluhan aslinya: "folder-folder nggak berubah sama sekali".
 *
 * `fileNames` mengunci nama berkas yang dikenali (package.json, tsconfig,
 * Dockerfile), karena nama yang tepat harus menang atas ekstensi.
 */
function ikonJson(i) {
  const warna = i.warna;
  const ikon = {};
  ikon.file = { glyph: i.file, color: 'var(--fg2)' };
  ikon.folder = { glyph: i.folder, color: 'var(--accent)' };
  ikon['folder-open'] = { glyph: i.folderOpen, color: 'var(--accent)' };
  for (const [ext, c] of Object.entries(warna)) {
    ikon[ext] = { glyph: i.folder, color: c };
  }
  /* Berkas tanpa ekstensi yang namanya dikenal. */
  const nama = {
    'package.json': 'json', 'tsconfig.json': 'json', 'zephyr-extension.json': 'json',
    Dockerfile: 'sh', 'docker-compose.yml': 'yml', Makefile: 'sh', '.gitignore': 'sh',
    'Cargo.toml': 'toml', 'README.md': 'md', LICENSE: 'md',
  };
  const folderNames = {
    src: 'folder', node_modules: 'folder', dist: 'folder', build: 'folder',
    test: 'folder', tests: 'folder', docs: 'folder', assets: 'folder',
    components: 'folder', lib: 'folder', public: 'folder', scripts: 'folder',
    '.git': 'folder', '.github': 'folder', target: 'folder', vendor: 'folder',
  };
  return JSON.stringify(
    {
      _komentar:
        'Ikon folder WAJIB ada: tanpa folder/folder-open/folderNames, folder di pohon berkas tetap memakai gambar bawaan.',
      file: ikon.file,
      folder: ikon.folder,
      'folder-open': ikon['folder-open'],
      icons: ikon,
      fileNames: nama,
      folderNames,
    },
    null,
    2,
  );
}

fs.mkdirSync('scratch/ikon', { recursive: true });
const daftarManifest = [];
for (const i of IKON) {
  daftarManifest.push({ id: `zephyr.ikon-${i.id}`, label: i.label, manifest: BARIS_MANIFEST(i), json: ikonJson(i) });
}
fs.writeFileSync('scratch/ikon/paket.json', JSON.stringify(daftarManifest, null, 2), 'utf8');

console.log('tema:', TEMA.length, 'ikon:', IKON.length);
