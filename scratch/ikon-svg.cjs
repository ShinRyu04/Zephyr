/*
 * Bangkitkan paket ikon dengan SVG ASLI (bukan glyph Unicode).
 *
 * Kenapa ditulis ulang: paket sebelumnya hanya berisi karakter teks seperti
 * "◐ ◑ ◒ ◇". Itu tidak mungkin terlihat seperti VS Code atau Zed, karena satu
 * karakter tidak bisa menyatakan bentuk berkas yang berbeda-beda - semua berkas
 * tampak sama, dan pembaca menyimpulkan "ikon tidak berubah".
 *
 * Yang dihasilkan: setiap paket punya BENTUK sendiri (belah, kubus, lingkaran,
 * garis, kisi, segitiga, heksagon, petir), dan di dalam bentuk itu setiap JENIS
 * berkas dan setiap KELOMPOK folder digambar berbeda. Semua SVG asli, lewat
 * jalur `iconDefinitions.iconPath` yang dibaca loader.
 *
 * Keluaran: scratch/ikon/svg/<paket>/icons/*.svg + scratch/ikon/paket-svg.json
 */
const fs = require('fs');
const path = require('path');

const AKAR = 'scratch/ikon/svg';
fs.rmSync(AKAR, { recursive: true, force: true });
fs.mkdirSync(AKAR, { recursive: true });

/* ── isi ikon: bentuk kecil di dalam bingkai ───────────────────────────────── */
const ISI = {
  kode: (x, y, s) =>
    `<path d="M${x + s * 0.32} ${y + s * 0.2} ${x + s * 0.02} ${y + s * 0.5} ${x + s * 0.32} ${y + s * 0.8}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.68} ${y + s * 0.2} ${x + s * 0.98} ${y + s * 0.5} ${x + s * 0.68} ${y + s * 0.8}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  teks: (x, y, s) =>
    `<path d="M${x + s * 0.15} ${y + s * 0.25}h${s * 0.7}M${x + s * 0.15} ${y + s * 0.5}h${s * 0.7}M${x + s * 0.15} ${y + s * 0.75}h${s * 0.45}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  data: (x, y, s) =>
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.28}" rx="${s * 0.34}" ry="${s * 0.14}" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<path d="M${x + s * 0.16} ${y + s * 0.28}v${s * 0.44}M${x + s * 0.84} ${y + s * 0.28}v${s * 0.44}" stroke="currentColor" stroke-width="1.1"/>` +
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.72}" rx="${s * 0.34}" ry="${s * 0.14}" fill="none" stroke="currentColor" stroke-width="1.1"/>`,
  gambar: (x, y, s) =>
    `<rect x="${x + s * 0.12}" y="${y + s * 0.2}" width="${s * 0.76}" height="${s * 0.6}" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<circle cx="${x + s * 0.32}" cy="${y + s * 0.38}" r="${s * 0.08}" fill="currentColor"/>` +
    `<path d="M${x + s * 0.16} ${y + s * 0.76} ${x + s * 0.42} ${y + s * 0.5} ${x + s * 0.62} ${y + s * 0.66} ${x + s * 0.84} ${y + s * 0.46}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`,
  gaya: (x, y, s) =>
    `<path d="M${x + s * 0.2} ${y + s * 0.18} ${x + s * 0.5} ${y + s * 0.5} ${x + s * 0.2} ${y + s * 0.82}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${x + s * 0.72}" cy="${y + s * 0.5}" r="${s * 0.16}" fill="currentColor"/>`,
  kunci: (x, y, s) =>
    `<circle cx="${x + s * 0.5}" cy="${y + s * 0.32}" r="${s * 0.2}" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
    `<path d="M${x + s * 0.5} ${y + s * 0.52}v${s * 0.3}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  paket: (x, y, s) =>
    `<path d="M${x + s * 0.5} ${y + s * 0.14} ${x + s * 0.88} ${y + s * 0.34}v${s * 0.34}L${x + s * 0.5} ${y + s * 0.88} ${x + s * 0.12} ${y + s * 0.68}V${y + s * 0.34}Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.12} ${y + s * 0.34} ${x + s * 0.5} ${y + s * 0.54} ${x + s * 0.88} ${y + s * 0.34}" fill="none" stroke="currentColor" stroke-width="0.9"/>`,
};

/*
 * Bingkai per paket. `folder(buka, tanda)` menerima tanda isi OPSIONAL: tanpa
 * tanda ia menggambar folder polos, dengan tanda ia menggambar folder yang
 * menyatakan kelompoknya. `tanda` dipanggil dengan area di dalam badan folder.
 */
const BENTUK = {
  belah: {
    label: 'Belah',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      isi(3.4, 3.4, 9.2) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="currentColor" opacity="0.18"/>` +
      `<path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
      (tanda ? tanda(5.2, 5.2, 5.6) : buka ? `<path d="M5.6 8 8 5.6 10.4 8 8 10.4Z" fill="currentColor"/>` : `<path d="M8 5.8v4.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`) +
      `</svg>`,
  },
  kubus: {
    label: 'Kubus',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M8 1.4v6.2m0 0 6.2-2.6M8 7.6 1.8 5" stroke="currentColor" stroke-width="0.7" opacity="0.55" fill="none"/>` +
      isi(4.2, 4.2, 7.6) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="currentColor" opacity="0.2"/>` +
      `<path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
      (tanda ? tanda(5, 5, 6) : buka ? `<path d="M8 4.4 11.2 6.2v3.6L8 11.6 4.8 9.8V6.2Z" fill="currentColor"/>` : `<path d="M4.8 5.4 8 3.6l3.2 1.8v5L8 12.2l-3.2-1.8Z" fill="none" stroke="currentColor" stroke-width="0.9"/>`) +
      `</svg>`,
  },
  lingkaran: {
    label: 'Lingkaran',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      isi(3.8, 3.8, 8.4) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<circle cx="8" cy="8" r="6.6" fill="currentColor" opacity="0.18"/>` +
      `<circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
      (tanda ? tanda(4.8, 4.8, 6.4) : buka ? `<circle cx="8" cy="8" r="3.1" fill="currentColor"/>` : `<path d="M8 4.8v6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`) +
      `</svg>`,
  },
  garis: {
    label: 'Garis',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M2.2 3.2h11.6M2.2 8h11.6M2.2 12.8h11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/>` +
      isi(4.4, 4.4, 7.2) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>` +
      (tanda ? tanda(4.6, 4.6, 6.8) : buka ? `<path d="M4.6 8h6.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>` : `<path d="M6 8h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`) +
      `</svg>`,
  },
  kisi: {
    label: 'Kisi',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      `<path d="M1.8 6.1h12.4M1.8 9.9h12.4M6.1 1.8v12.4M9.9 1.8v12.4" stroke="currentColor" stroke-width="0.6" opacity="0.45"/>` +
      isi(3.6, 3.6, 8.8) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="currentColor" opacity="0.16"/>` +
      `<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
      `<path d="M1.8 5.4h12.4" stroke="currentColor" stroke-width="1.2"/>` +
      (tanda ? tanda(4.8, 5.8, 6.4) : buka ? `<rect x="5" y="7.4" width="6" height="4.4" rx="0.8" fill="currentColor"/>` : `<path d="M5 9.6h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`) +
      `</svg>`,
  },
  segitiga: {
    label: 'Segitiga',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      isi(4.8, 6.2, 6.4) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.6 14.8 14H1.2Z" fill="currentColor" opacity="0.18"/>` +
      `<path d="M8 1.6 14.8 14H1.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
      (tanda ? tanda(5.2, 6.6, 5.6) : buka ? `<path d="M8 6.6 11 12H5Z" fill="currentColor"/>` : `<path d="M8 7.6v3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`) +
      `</svg>`,
  },
  heksagon: {
    label: 'Heksagon',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      isi(4, 4, 8) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="currentColor" opacity="0.18"/>` +
      `<path d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
      (tanda ? tanda(5, 5, 6) : buka ? `<path d="M8 5 11 6.8v3L8 11.6 5 9.8v-3Z" fill="currentColor"/>` : `<path d="M5.6 7.4 8 6l2.4 1.4v2.8L8 11.6 5.6 10.2Z" fill="none" stroke="currentColor" stroke-width="0.9"/>`) +
      `</svg>`,
  },
  petir: {
    label: 'Petir',
    bingkai: (isi) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      isi(5.4, 5.4, 5.2) +
      `</svg>`,
    folder: (buka, tanda) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="currentColor" opacity="0.22"/>` +
      `<path d="M9.4 1.2 3.6 9h3.2l-1.2 5.8L12.4 7H9.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
      (tanda ? tanda(5.4, 5.4, 5.2) : buka ? `<circle cx="8" cy="8" r="1.6" fill="currentColor"/>` : `<path d="M8 5.4v5.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`) +
      `</svg>`,
  },
};

/* Ekstensi -> jenis isi. */
const JENIS = {
  ts: 'kode', tsx: 'kode', js: 'kode', jsx: 'kode', mjs: 'kode', cjs: 'kode',
  rs: 'kode', go: 'kode', py: 'kode', java: 'kode', kt: 'kode', c: 'kode',
  cpp: 'kode', h: 'kode', hpp: 'kode', cs: 'kode', rb: 'kode', php: 'kode',
  swift: 'kode', sh: 'kode', ps1: 'kode', lua: 'kode', sql: 'data',
  md: 'teks', txt: 'teks', rst: 'teks', log: 'teks',
  json: 'data', yml: 'data', yaml: 'data', toml: 'data', xml: 'data', csv: 'data',
  png: 'gambar', jpg: 'gambar', jpeg: 'gambar', gif: 'gambar', svg: 'gambar',
  webp: 'gambar', ico: 'gambar', bmp: 'gambar',
  css: 'gaya', scss: 'gaya', sass: 'gaya', less: 'gaya',
  lock: 'kunci', pem: 'kunci', key: 'kunci',
  zip: 'paket', tar: 'paket', gz: 'paket', '7z': 'paket', rar: 'paket',
};

const daftarManifest = [];

for (const [kunciBentuk, bentuk] of Object.entries(BENTUK)) {
  const idPaket = `zephyr.ikon-${kunciBentuk}`;
  const folderPaket = path.join(AKAR, kunciBentuk);
  const folderIkon = path.join(folderPaket, 'icons');
  fs.mkdirSync(folderIkon, { recursive: true });

  const iconDefinitions = {};
  const fileExtensions = {};
  const fileNames = {};
  const folderNames = {};
  const folderNamesExpanded = {};

  /* Satu definisi per jenis isi - loader membaca SVG sekali per path. */
  for (const [jenis, gambar] of Object.entries(ISI)) {
    const namaFile = `${jenis}.svg`;
    fs.writeFileSync(path.join(folderIkon, namaFile), bentuk.bingkai(gambar), 'utf8');
    iconDefinitions[`_${jenis}`] = { iconPath: `./icons/${namaFile}` };
  }

  /* Berkas umum. */
  fs.writeFileSync(path.join(folderIkon, 'file.svg'), bentuk.bingkai(ISI.teks), 'utf8');
  iconDefinitions._file = { iconPath: './icons/file.svg' };

  /* Folder polos: tertutup + terbuka. */
  fs.writeFileSync(path.join(folderIkon, 'folder.svg'), bentuk.folder(false), 'utf8');
  fs.writeFileSync(path.join(folderIkon, 'folder-open.svg'), bentuk.folder(true), 'utf8');
  iconDefinitions._folder = { iconPath: './icons/folder.svg' };
  iconDefinitions._folderOpen = { iconPath: './icons/folder-open.svg' };

  /*
   * Folder PER KELOMPOK. Tanpa ini setiap folder memakai gambar yang sama, dan
   * switch hanya terlihat sebagai "folder berubah" - bukan "folder src berbeda
   * dari folder docs".
   */
  const TANDA = { kode: ISI.kode, uji: ISI.gambar, dokumen: ISI.teks, aset: ISI.gambar, hasil: ISI.paket, konfig: ISI.kunci };
  for (const [jenis, gambar] of Object.entries(TANDA)) {
    for (const buka of [false, true]) {
      const nama = `folder-${jenis}${buka ? '-open' : ''}.svg`;
      /*
       * The OPEN variant draws the same group mark but SMALLER and with the
       * frame's open indicator - the frame already changes shape when `buka` is
       * true, and the mark shrinks so the two states are distinguishable even
       * when the frame difference is subtle at 14px. Writing the same body for
       * both states made the file open/closed transition invisible.
       */
      const isiTanda = buka
        ? (x, y, s) => gambar(x + s * 0.12, y + s * 0.12, s * 0.76)
        : gambar;
      fs.writeFileSync(path.join(folderIkon, nama), bentuk.folder(buka, isiTanda), 'utf8');
      iconDefinitions[`_${jenis}${buka ? 'Open' : ''}`] = { iconPath: `./icons/${nama}` };
    }
  }

  for (const [ext, jenis] of Object.entries(JENIS)) fileExtensions[ext] = `_${jenis}`;

  /* Nama berkas terkenal. Huruf kecil: `ikonFileExt` menurunkan nama dulu. */
  for (const [nama, jenis] of Object.entries({
    'package.json': 'data', 'package-lock.json': 'data', 'tsconfig.json': 'data',
    'cargo.toml': 'data', 'cargo.lock': 'data', 'composer.json': 'data',
    'readme.md': 'teks', 'readme': 'teks', 'changelog.md': 'teks',
    'license': 'kunci', 'license.md': 'kunci', 'licence': 'kunci',
    '.gitignore': 'kunci', '.gitattributes': 'kunci', '.gitmodules': 'kunci',
    '.env': 'kunci', '.env.local': 'kunci', '.npmrc': 'kunci', '.editorconfig': 'kunci',
    'dockerfile': 'paket', 'docker-compose.yml': 'paket', 'docker-compose.yaml': 'paket',
    'makefile': 'kunci', 'justfile': 'kunci', 'procfile': 'kunci',
    'gemfile': 'data', 'gemfile.lock': 'data', 'requirements.txt': 'data',
    'go.mod': 'data', 'go.sum': 'data', 'pom.xml': 'data', 'build.gradle': 'data',
    'vite.config.ts': 'data', 'tailwind.config.js': 'data', 'eslint.config.js': 'data',
    'index.html': 'teks', 'favicon.ico': 'gambar',
  })) {
    fileNames[nama] = `_${jenis}`;
  }

  /* Nama folder -> kelompoknya, tertutup DAN terbuka. */
  const KELOMPOK = {
    kode: ['src', 'lib', 'app', 'components', 'hooks', 'store', 'stores', 'utils', 'core', 'server', 'client', 'api'],
    uji: ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'fixtures', 'testfiles', 'bench', 'benches'],
    dokumen: ['docs', 'doc', 'documentation', 'wiki', 'guides', 'examples'],
    aset: ['assets', 'images', 'img', 'icons', 'fonts', 'media', 'screenshots', 'public', 'static'],
    hasil: ['dist', 'build', 'out', 'target', 'release', 'coverage', 'vendor', 'node_modules', '.next', '.cache'],
    konfig: ['.git', '.github', '.vscode', '.idea', '.zephyr', '.claude', 'scripts', 'tools', 'config', 'configs', 'ci'],
  };
  for (const [jenis, nama] of Object.entries(KELOMPOK)) {
    for (const n of nama) {
      folderNames[n] = `_${jenis}`;
      folderNamesExpanded[n] = `_${jenis}Open`;
    }
  }

  const isiJson = {
    iconDefinitions,
    file: '_file',
    folder: '_folder',
    folderExpanded: '_folderOpen',
    fileExtensions,
    fileNames,
    folderNames,
    folderNamesExpanded,
  };

  fs.writeFileSync(path.join(folderIkon, `${kunciBentuk}.json`), JSON.stringify(isiJson, null, 2), 'utf8');

  const manifest = {
    id: idPaket,
    name: `Ikon ${bentuk.label}`,
    publisher: 'zephyr',
    version: '1.0.0',
    description: `${bentuk.label} — icon theme with real SVG art for files and folders`,
    engines: { zephyr: '>=1.0' },
    categories: ['Icon Themes'],
    contributes: { iconThemes: [{ label: bentuk.label, path: `./icons/${kunciBentuk}.json` }] },
  };
  fs.writeFileSync(folderPaket === AKAR ? '' : path.join(folderPaket, 'zephyr-extension.json'), JSON.stringify(manifest, null, 2), 'utf8');

  daftarManifest.push({ id: idPaket, label: bentuk.label, manifest: JSON.stringify(manifest), json: JSON.stringify(isiJson) });
}

fs.writeFileSync('scratch/ikon/paket-svg.json', JSON.stringify(daftarManifest, null, 2), 'utf8');

const j = JSON.parse(daftarManifest[0].json);
const svg = (p) => path.join(AKAR, 'belah/icons', path.basename(p));
console.log('paket SVG:', daftarManifest.length);
console.log('contoh', daftarManifest[0].id);
console.log('  iconDefinitions:', Object.keys(j.iconDefinitions).length, 'semua iconPath:', Object.values(j.iconDefinitions).every((d) => !!d.iconPath));
console.log('  fileExtensions :', Object.keys(j.fileExtensions).length);
console.log('  fileNames      :', Object.keys(j.fileNames).length);
console.log('  folderNames    :', Object.keys(j.folderNames).length, '(per kelompok)');
console.log('  folderNamesExp :', Object.keys(j.folderNamesExpanded).length);
console.log('  berkas SVG     :', fs.readdirSync(path.join(AKAR, 'belah/icons')).filter((f) => f.endsWith('.svg')).length);

/* Bukti bentuk BERBEDA antar paket: hash isi folder.svg tiap paket. */
const kripto = require('crypto');
const hash = {};
for (const p of daftarManifest) {
  const k = p.id.replace(/^zephyr\.ikon-/, '');
  const isi = fs.readFileSync(path.join(AKAR, k, 'icons/folder.svg'));
  hash[p.id] = kripto.createHash('sha1').update(isi).digest('hex').slice(0, 10);
}
const unik = new Set(Object.values(hash));
console.log('\nBENTUK BERBEDA - hash folder.svg per paket:');
for (const [id, h] of Object.entries(hash)) console.log(`  ${id.padEnd(24)} ${h}`);
console.log(`  unik: ${unik.size}/${Object.keys(hash).length}`, unik.size === Object.keys(hash).length ? '(SEMUA BEDA)' : '(ADA YANG SAMA!)');
