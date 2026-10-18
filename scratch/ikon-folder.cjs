/*
 * Paket ikon gaya Zed: SETIAP tema masih berupa FOLDER, hanya gayanya berbeda.
 *
 * Kenapa ditulis ulang (lagi): percobaan sebelumnya memakai bentuk abstrak -
 * belah ketupat, heksagon, petir. Itu bukan tema ikon, itu logo. Pembaca yang
 * memasangnya melihat pohon berkas yang folder-folder nya berubah jadi belah
 * ketupat, dan itu bukan yang dimaksud "ganti tema ikon".
 *
 * Yang benar (dan yang dilakukan Zed): bentuknya TETAP folder - badan persegi
 * dengan tab di kiri atas - dan yang berubah antar tema adalah GAYA:
 *
 *   Klasik    isi penuh + tab, sudut membulat kecil
 *   Garis     hanya garis luar, tanpa isi
 *   Padat     isi penuh tanpa detail tab
 *   Duotone   badan gelap + tab terang
 *   Bulat     sudut sangat membulat
 *   Tajam     sudut siku, tab persegi
 *   Terbuka   penutup terlipat ke belakang (folder terbuka)
 *   Minimal   garis tipis, satu warna
 *
 * Setiap tema juga membedakan folder per KELOMPOK (kode/uji/dokumen/aset/hasil/
 * konfig) lewat tanda kecil di dalam badan folder, dan membedakan terbuka/
 * tertutup. Berkas juga digambar sebagai lembar kertas dengan gaya yang sama.
 */
const fs = require('fs');
const path = require('path');

const AKAR = 'scratch/ikon/svg';
fs.rmSync(AKAR, { recursive: true, force: true });
fs.mkdirSync(AKAR, { recursive: true });

/* ── tanda isi: dipakai di dalam badan folder dan di lembar berkas ─────────── */
const TANDA = {
  kode: (x, y, s) =>
    `<path d="M${x + s * 0.34} ${y + s * 0.22} ${x + s * 0.06} ${y + s * 0.5} ${x + s * 0.34} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.66} ${y + s * 0.22} ${x + s * 0.94} ${y + s * 0.5} ${x + s * 0.66} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>`,
  uji: (x, y, s) =>
    `<path d="M${x + s * 0.3} ${y + s * 0.18}v${s * 0.34}L${x + s * 0.12} ${y + s * 0.8}h${s * 0.76}L${x + s * 0.7} ${y + s * 0.52}V${y + s * 0.18}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.22} ${y + s * 0.18}h${s * 0.56}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  dokumen: (x, y, s) =>
    `<path d="M${x + s * 0.18} ${y + s * 0.22}h${s * 0.64}M${x + s * 0.18} ${y + s * 0.46}h${s * 0.64}M${x + s * 0.18} ${y + s * 0.7}h${s * 0.4}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  aset: (x, y, s) =>
    `<circle cx="${x + s * 0.34}" cy="${y + s * 0.34}" r="${s * 0.11}" fill="currentColor"/>` +
    `<path d="M${x + s * 0.12} ${y + s * 0.82} ${x + s * 0.4} ${y + s * 0.52} ${x + s * 0.58} ${y + s * 0.68} ${x + s * 0.88} ${y + s * 0.4}v${s * 0.42}Z" fill="currentColor" opacity="0.85"/>`,
  hasil: (x, y, s) =>
    `<path d="M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.86} ${y + s * 0.36}v${s * 0.3}L${x + s * 0.5} ${y + s * 0.86} ${x + s * 0.14} ${y + s * 0.66}v${-s * 0.3}Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>`,
  konfig: (x, y, s) =>
    `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.17}" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<path d="M${x + s * 0.5} ${y + s * 0.14}v${s * 0.12}M${x + s * 0.5} ${y + s * 0.74}v${s * 0.12}M${x + s * 0.14} ${y + s * 0.5}h${s * 0.12}M${x + s * 0.74} ${y + s * 0.5}h${s * 0.12}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  teks: (x, y, s) =>
    `<path d="M${x + s * 0.2} ${y + s * 0.26}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.5}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.74}h${s * 0.38}" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/>`,
  data: (x, y, s) =>
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.26}" rx="${s * 0.32}" ry="${s * 0.13}" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
    `<path d="M${x + s * 0.18} ${y + s * 0.26}v${s * 0.46}M${x + s * 0.82} ${y + s * 0.26}v${s * 0.46}" stroke="currentColor" stroke-width="1.05"/>` +
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.72}" rx="${s * 0.32}" ry="${s * 0.13}" fill="none" stroke="currentColor" stroke-width="1.05"/>`,
  gaya: (x, y, s) =>
    `<path d="M${x + s * 0.24} ${y + s * 0.18} ${x + s * 0.5} ${y + s * 0.5} ${x + s * 0.24} ${y + s * 0.82}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${x + s * 0.7}" cy="${y + s * 0.5}" r="${s * 0.14}" fill="currentColor"/>`,
};

/*
 * Bingkai FOLDER. Semua tema memakai bentuk folder yang sama (badan + tab);
 * `gaya` yang membedakan. Ini inti permintaan: tema berganti, folder tetap
 * folder.
 */
function folder(style, open, tanda) {
  const isi = tanda ? tanda(4.4, 6.2, 7.2) : '';
  const tab = (x1, y1, x2, y2) =>
    style.tab === 'none'
      ? ''
      : `<path d="M${x1} ${y1}H${x2}V${y2}" fill="none" stroke="currentColor" stroke-width="${style.sw}" stroke-linecap="${style.cap}" stroke-linejoin="round"/>`;

  /* Badan folder: satu path dengan sudut sesuai gaya. Angka dibulatkan ke satu
     desimal - `11.200000000000001` di dalam atribut path adalah kebocoran float
     yang membuat berkas lebih besar tanpa mengubah gambar. */
  const n = (v) => Math.round(v * 10) / 10;
  const r = style.r;
  const badan = (fill, stroke, op) =>
    `<path d="M1.6 ${n(4.2 + r)}Q1.6 4.2 ${n(1.6 + r)} 4.2H6.2L7.6 2.6H${n(14.4 - r)}Q14.4 2.6 14.4 ${n(2.6 + r)}V${n(12.4 - r)}Q14.4 12.4 ${n(14.4 - r)} 12.4H${n(1.6 + r)}Q1.6 12.4 1.6 ${n(12.4 - r)}Z"` +
    (fill ? ` fill="currentColor" opacity="${op}"` : ' fill="none"') +
    (stroke ? ` stroke="currentColor" stroke-width="${style.sw}" stroke-linejoin="${style.join}"` : '') +
    '/>';

  const badanPath = style.fillOnly
    ? badan(true, false, style.op) + `<path d="M1.6 4.2h12.8v8.2H1.6z" fill="currentColor" opacity="${style.op}"/>`
    : style.outlineOnly
      ? badan(false, true, 0)
      : badan(true, true, style.op);

  /* Folder TERBUKA: penutupnya terlipat, jadi terlihat beda dari tertutup. */
  const penutup = open
    ? `<path d="M2.6 12.4 ${3.8} 7.6h10.6L13.2 12.4Z" fill="currentColor" opacity="${Math.min(1, style.op + 0.25)}"` +
      (style.sw > 0 ? ` stroke="currentColor" stroke-width="${style.sw}" stroke-linejoin="round"` : '') +
      '/>'
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    badanPath +
    tab(6.2, 4.2, 7.6, 2.6) +
    (open ? '' : isi) +
    penutup +
    (open ? isi : '') +
    `</svg>`
  );
}

/* Bingkai BERKAS: lembar kertas dengan sudut terlipat, gaya sama per tema. */
function berkas(style, tanda) {
  const r = Math.min(style.r, 1.6);
  const lipat = style.fold === false ? '' : `<path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="${style.sw}" stroke-linejoin="round"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M3.4 ${1.8 + r}Q3.4 1.8 ${3.4 + r} 1.8H9.4L12.6 5v${9.2 - r}Q12.6 14.2 ${12.6 - r} 14.2H${3.4 + r}Q3.4 14.2 3.4 ${14.2 - r}Z" ` +
    (style.outlineOnly ? 'fill="none"' : `fill="currentColor" opacity="${style.op * 0.5}"`) +
    ` stroke="currentColor" stroke-width="${style.sw}" stroke-linejoin="${style.join}"/>` +
    lipat +
    tanda(4.6, 6.4, 6.4) +
    `</svg>`
  );
}

/* ── delapan tema, semuanya FOLDER, hanya gayanya berbeda ──────────────────── */
const TEMA = {
  klasik: {
    label: 'Klasik',
    ket: 'Folder isi penuh dengan tab, sudut membulat kecil — gaya paling akrab.',
    style: { r: 1.2, sw: 1.15, op: 0.22, join: 'round', cap: 'round', fold: true },
  },
  garis: {
    label: 'Garis',
    ket: 'Hanya garis luar, tanpa isi — ringan dan tenang.',
    style: { r: 1.2, sw: 1.3, op: 0, join: 'round', cap: 'round', outlineOnly: true, fold: true },
  },
  padat: {
    label: 'Padat',
    ket: 'Isi penuh tanpa garis dalam — tegas dan mudah dibaca.',
    style: { r: 0.8, sw: 0, op: 0.85, join: 'miter', cap: 'butt', tab: 'none', fold: false, fillOnly: true },
  },
  duotone: {
    label: 'Duotone',
    ket: 'Badan pekat, tab dan tanda lebih terang — dua nada.',
    style: { r: 1.2, sw: 1.1, op: 0.55, join: 'round', cap: 'round', fold: true },
  },
  bulat: {
    label: 'Bulat',
    ket: 'Sudut sangat membulat, tab melengkung.',
    style: { r: 2.4, sw: 1.2, op: 0.24, join: 'round', cap: 'round', fold: true },
  },
  tajam: {
    label: 'Tajam',
    ket: 'Sudut siku dan tab persegi — kaku dan rapi.',
    style: { r: 0.1, sw: 1.25, op: 0.2, join: 'miter', cap: 'butt', fold: true },
  },
  terbuka: {
    label: 'Terbuka',
    ket: 'Penutup folder terlipat terlihat — memberi kesan isi.',
    style: { r: 1.2, sw: 1.15, op: 0.18, join: 'round', cap: 'round', fold: true },
  },
  minimal: {
    label: 'Minimal',
    ket: 'Garis tipis satu warna, tanpa isi dan tanpa tab.',
    style: { r: 1.4, sw: 0.9, op: 0, join: 'round', cap: 'round', outlineOnly: true, tab: 'none', fold: false },
  },
};

/* Ekstensi -> jenis tanda. */
const JENIS = {
  ts: 'kode', tsx: 'kode', js: 'kode', jsx: 'kode', mjs: 'kode', cjs: 'kode',
  rs: 'kode', go: 'kode', py: 'kode', java: 'kode', kt: 'kode', c: 'kode',
  cpp: 'kode', h: 'kode', hpp: 'kode', cs: 'kode', rb: 'kode', php: 'kode',
  swift: 'kode', sh: 'kode', ps1: 'kode', lua: 'kode',
  md: 'teks', txt: 'teks', rst: 'teks', log: 'teks',
  json: 'data', yml: 'data', yaml: 'data', toml: 'data', xml: 'data', csv: 'data', sql: 'data',
  png: 'aset', jpg: 'aset', jpeg: 'aset', gif: 'aset', svg: 'aset', webp: 'aset', ico: 'aset', bmp: 'aset',
  css: 'gaya', scss: 'gaya', sass: 'gaya', less: 'gaya',
  lock: 'konfig', pem: 'konfig', key: 'konfig',
  zip: 'hasil', tar: 'hasil', gz: 'hasil', '7z': 'hasil', rar: 'hasil',
};

const KELOMPOK = {
  kode: ['src', 'lib', 'app', 'components', 'hooks', 'store', 'stores', 'utils', 'core', 'server', 'client', 'api', 'cmd'],
  uji: ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'fixtures', 'testfiles', 'bench', 'benches'],
  dokumen: ['docs', 'doc', 'documentation', 'wiki', 'guides', 'examples'],
  aset: ['assets', 'images', 'img', 'icons', 'fonts', 'media', 'screenshots', 'public', 'static'],
  hasil: ['dist', 'build', 'out', 'target', 'release', 'coverage', 'vendor', 'node_modules', '.next', '.cache'],
  konfig: ['.git', '.github', '.vscode', '.idea', '.zephyr', '.claude', 'scripts', 'tools', 'config', 'configs', 'ci'],
};

const NAMA_BERKAS = {
  'package.json': 'data', 'package-lock.json': 'data', 'tsconfig.json': 'data',
  'cargo.toml': 'data', 'cargo.lock': 'data', 'composer.json': 'data',
  'readme.md': 'teks', 'readme': 'teks', 'changelog.md': 'teks',
  'license': 'konfig', 'license.md': 'konfig', 'licence': 'konfig',
  '.gitignore': 'konfig', '.gitattributes': 'konfig', '.gitmodules': 'konfig',
  '.env': 'konfig', '.env.local': 'konfig', '.npmrc': 'konfig', '.editorconfig': 'konfig',
  'dockerfile': 'hasil', 'docker-compose.yml': 'hasil', 'docker-compose.yaml': 'hasil',
  'makefile': 'konfig', 'justfile': 'konfig', 'procfile': 'konfig',
  'gemfile': 'data', 'gemfile.lock': 'data', 'requirements.txt': 'data',
  'go.mod': 'data', 'go.sum': 'data', 'pom.xml': 'data', 'build.gradle': 'data',
  'vite.config.ts': 'konfig', 'tailwind.config.js': 'konfig', 'eslint.config.js': 'konfig',
  'index.html': 'teks', 'favicon.ico': 'aset',
};

const daftarManifest = [];

for (const [kunci, t] of Object.entries(TEMA)) {
  const idPaket = `zephyr.ikon-${kunci}`;
  const folderPaket = path.join(AKAR, kunci);
  const folderIkon = path.join(folderPaket, 'icons');
  fs.mkdirSync(folderIkon, { recursive: true });

  const iconDefinitions = {};
  const fileExtensions = {};
  const fileNames = {};
  const folderNames = {};
  const folderNamesExpanded = {};

  /* Berkas: satu per jenis tanda. */
  for (const [jenis, gambar] of Object.entries(TANDA)) {
    const namaFile = `file-${jenis}.svg`;
    fs.writeFileSync(path.join(folderIkon, namaFile), berkas(t.style, gambar), 'utf8');
    iconDefinitions[`_f_${jenis}`] = { iconPath: `./icons/${namaFile}` };
  }

  /* Folder: per kelompok, tertutup dan terbuka. */
  for (const jenis of Object.keys(TANDA)) {
    for (const buka of [false, true]) {
      const nama = `folder-${jenis}${buka ? '-open' : ''}.svg`;
      fs.writeFileSync(path.join(folderIkon, nama), folder(t.style, buka, TANDA[jenis]), 'utf8');
      iconDefinitions[`_d_${jenis}${buka ? 'Open' : ''}`] = { iconPath: `./icons/${nama}` };
    }
  }

  /* Folder umum (nama tidak dikenal). */
  for (const buka of [false, true]) {
    const nama = `folder${buka ? '-open' : ''}.svg`;
    fs.writeFileSync(path.join(folderIkon, nama), folder(t.style, buka, null), 'utf8');
    iconDefinitions[buka ? '_folderOpen' : '_folder'] = { iconPath: `./icons/${nama}` };
  }

  /* Berkas umum. */
  fs.writeFileSync(path.join(folderIkon, 'file.svg'), berkas(t.style, TANDA.teks), 'utf8');
  iconDefinitions._file = { iconPath: './icons/file.svg' };

  for (const [ext, jenis] of Object.entries(JENIS)) fileExtensions[ext] = `_f_${jenis}`;
  for (const [nama, jenis] of Object.entries(NAMA_BERKAS)) fileNames[nama] = `_f_${jenis}`;
  for (const [jenis, nama] of Object.entries(KELOMPOK)) {
    for (const n of nama) {
      folderNames[n] = `_d_${jenis}`;
      folderNamesExpanded[n] = `_d_${jenis}Open`;
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
  fs.writeFileSync(path.join(folderIkon, `${kunci}.json`), JSON.stringify(isiJson, null, 2), 'utf8');

  const manifest = {
    id: idPaket,
    name: `Ikon ${t.label}`,
    publisher: 'zephyr',
    version: '1.0.0',
    description: t.ket,
    engines: { zephyr: '>=1.0' },
    categories: ['Icon Themes'],
    contributes: { iconThemes: [{ label: t.label, path: `./icons/${kunci}.json` }] },
  };
  fs.writeFileSync(path.join(folderPaket, 'zephyr-extension.json'), JSON.stringify(manifest, null, 2), 'utf8');

  daftarManifest.push({ id: idPaket, label: t.label, manifest: JSON.stringify(manifest), json: JSON.stringify(isiJson) });
}

fs.writeFileSync('scratch/ikon/paket-svg.json', JSON.stringify(daftarManifest, null, 2), 'utf8');

/* ── laporan apa adanya ───────────────────────────────────────────────────── */
const crypto = require('crypto');
const hash = {};
for (const p of daftarManifest) {
  const k = p.id.replace(/^zephyr\.ikon-/, '');
  hash[p.id] = crypto.createHash('sha1').update(fs.readFileSync(path.join(AKAR, k, 'icons/folder.svg'))).digest('hex').slice(0, 10);
}
const unik = new Set(Object.values(hash));

const j = JSON.parse(daftarManifest[0].json);
console.log('tema:', daftarManifest.length, '(semua berbentuk FOLDER)');
console.log('  iconDefinitions:', Object.keys(j.iconDefinitions).length, 'semua iconPath:', Object.values(j.iconDefinitions).every((d) => !!d.iconPath));
console.log('  fileExtensions :', Object.keys(j.fileExtensions).length);
console.log('  fileNames      :', Object.keys(j.fileNames).length);
console.log('  folderNames    :', Object.keys(j.folderNames).length, 'per kelompok');
console.log('  folderNamesExp :', Object.keys(j.folderNamesExpanded).length);
console.log('\nGAYA BERBEDA - hash folder.svg:');
for (const [id, h] of Object.entries(hash)) console.log(`  ${id.replace('zephyr.ikon-', '').padEnd(10)} ${h}`);
console.log(`  unik: ${unik.size}/${Object.keys(hash).length}`, unik.size === Object.keys(hash).length ? '(SEMUA BEDA)' : '(ADA YANG SAMA!)');
console.log('\nContoh folder.svg (klasik):');
console.log(fs.readFileSync(path.join(AKAR, 'klasik/icons/folder.svg'), 'utf8'));
