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
/*
 * ONE MARK PER FILE KIND, and they must look different at 14px.
 *
 * The previous version drew `<>` for every language, so TSX, Rust and Python
 * were the same grey chevron - which is why the picker's cards looked identical
 * no matter which theme was selected. A theme can only be judged by looking, and
 * there was nothing to look at.
 *
 * Each entry now carries a COLOUR as well: the drawing alone is not enough at
 * this size, and a TypeScript blue next to a Rust orange is recognisable before
 * the shape is.
 */
const TANDA = {
  ts: {
    warna: '#3178c6',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.12} ${y + s * 0.28}h${s * 0.5}M${x + s * 0.37} ${y + s * 0.28}v${s * 0.5}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.72} ${y + s * 0.36}c${-s * 0.16} ${-s * 0.1} ${-s * 0.24} ${s * 0.04} ${-s * 0.12} ${s * 0.12}s${s * 0.14} ${s * 0.06} ${s * 0.02} ${s * 0.18}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  rust: {
    warna: '#dea584',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.22}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${x + s * 0.5} ${y + s * 0.16}v${s * 0.1}M${x + s * 0.5} ${y + s * 0.74}v${s * 0.1}M${x + s * 0.16} ${y + s * 0.5}h${s * 0.1}M${x + s * 0.74} ${y + s * 0.5}h${s * 0.1}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  python: {
    warna: '#ffd43b',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.34} ${y + s * 0.18}h${s * 0.3}a${s * 0.14} ${s * 0.14} 0 0 1 ${s * 0.14} ${s * 0.14}v${s * 0.22}h${-s * 0.44}z" fill="currentColor" opacity="0.9"/>` +
      `<path d="M${x + s * 0.66} ${y + s * 0.82}h${-s * 0.3}a${s * 0.14} ${s * 0.14} 0 0 1 ${-s * 0.14} ${-s * 0.14}v${-s * 0.22}h${s * 0.44}z" fill="currentColor" opacity="0.65"/>`,
  },
  js: {
    warna: '#f7df1e',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.3} ${y + s * 0.26}v${s * 0.34}a${s * 0.12} ${s * 0.12} 0 0 1 ${-s * 0.24} 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.72} ${y + s * 0.34}c${-s * 0.14} ${-s * 0.1} ${-s * 0.22} ${s * 0.06} ${-s * 0.1} ${s * 0.14}s${s * 0.12} ${s * 0.1} 0 ${s * 0.2}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  json: {
    warna: '#cbcb41',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.34} ${y + s * 0.2}c${-s * 0.16} 0 ${-s * 0.14} ${s * 0.16} ${-s * 0.14} ${s * 0.3}s${-s * 0.02} ${s * 0.3} ${-s * 0.14} ${s * 0.3}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.66} ${y + s * 0.2}c${s * 0.16} 0 ${s * 0.14} ${s * 0.16} ${s * 0.14} ${s * 0.3}s${s * 0.02} ${s * 0.3} ${s * 0.14} ${s * 0.3}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  css: {
    warna: '#42a5f5',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.22} ${y + s * 0.24}h${s * 0.56}l${-s * 0.06} ${s * 0.46}a${s * 0.2} ${s * 0.2} 0 0 1 ${-s * 0.22} 0z" fill="currentColor" opacity="0.85"/>` +
      `<path d="M${x + s * 0.34} ${y + s * 0.4}h${s * 0.32}" stroke="var(--bg,#111)" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  md: {
    warna: '#42a5f5',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.2} ${y + s * 0.7}v${-s * 0.4}l${s * 0.16} ${s * 0.2} ${s * 0.16} ${-s * 0.2}v${s * 0.4}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.66} ${y + s * 0.3}v${s * 0.4}M${x + s * 0.58} ${y + s * 0.62}l${s * 0.08} ${s * 0.08} ${s * 0.08} ${-s * 0.08}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  teks: {
    warna: '#9e9e9e',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.2} ${y + s * 0.26}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.5}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.74}h${s * 0.38}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  data: {
    warna: '#a1887f',
    gambar: (x, y, s) =>
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.26}" rx="${s * 0.32}" ry="${s * 0.13}" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
      `<path d="M${x + s * 0.18} ${y + s * 0.26}v${s * 0.46}M${x + s * 0.82} ${y + s * 0.26}v${s * 0.46}" stroke="currentColor" stroke-width="1.05"/>` +
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.72}" rx="${s * 0.32}" ry="${s * 0.13}" fill="none" stroke="currentColor" stroke-width="1.05"/>`,
  },
  aset: {
    warna: '#ba68c8',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.34}" cy="${y + s * 0.34}" r="${s * 0.11}" fill="currentColor"/>` +
      `<path d="M${x + s * 0.12} ${y + s * 0.82} ${x + s * 0.4} ${y + s * 0.52} ${x + s * 0.58} ${y + s * 0.68} ${x + s * 0.88} ${y + s * 0.4}v${s * 0.42}Z" fill="currentColor" opacity="0.85"/>`,
  },
  hasil: {
    warna: '#ffa726',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.86} ${y + s * 0.36}v${s * 0.3}L${x + s * 0.5} ${y + s * 0.86} ${x + s * 0.14} ${y + s * 0.66}v${-s * 0.3}Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>`,
  },
  konfig: {
    warna: '#8d9db6',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.17}" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      `<path d="M${x + s * 0.5} ${y + s * 0.14}v${s * 0.12}M${x + s * 0.5} ${y + s * 0.74}v${s * 0.12}M${x + s * 0.14} ${y + s * 0.5}h${s * 0.12}M${x + s * 0.74} ${y + s * 0.5}h${s * 0.12}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  kode: {
    warna: '#90a4ae',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.34} ${y + s * 0.22} ${x + s * 0.06} ${y + s * 0.5} ${x + s * 0.34} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.66} ${y + s * 0.22} ${x + s * 0.94} ${y + s * 0.5} ${x + s * 0.66} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  uji: {
    warna: '#66bb6a',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.3} ${y + s * 0.18}v${s * 0.34}L${x + s * 0.12} ${y + s * 0.8}h${s * 0.76}L${x + s * 0.7} ${y + s * 0.52}V${y + s * 0.18}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.22} ${y + s * 0.18}h${s * 0.56}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  dokumen: {
    warna: '#64b5f6',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.2} ${y + s * 0.24}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.46}h${s * 0.6}M${x + s * 0.2} ${y + s * 0.68}h${s * 0.4}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  },
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

/*
 * ── TEMA AKSARA (Jepang / China) ──────────────────────────────────────────
 *
 * Ikonnya aksara, bukan bentuk geometri. Setiap jenis berkas mendapat aksara
 * yang benar-benar berarti jenisnya, jadi tema ini bisa dibaca - bukan sekadar
 * hiasan:
 *
 *   型 type/shape (TS)   錆 rust (Rust)      蛇 snake (Python)
 *   花 flower (JSON)     装 style (CSS)      文 text (Markdown)
 *
 * Dua keluarga aksara disediakan karena keduanya terlihat berbeda dan orang
 * mengenali miliknya sendiri: Kanji (Jepang) dan Hanzi (China Sederhana), plus
 * Hiragana untuk yang ingin paling Jepang.
 *
 * CARA MENGGAMBAR: `<text>` di dalam SVG, dengan daftar font yang dijamin ada
 * di sistem target (Yu Gothic / Meiryo / MS Gothic di Windows, Noto CJK di
 * Linux, PingFang di macOS). Menggambar tiap aksara sebagai path akan berarti
 * membundel font CJK sebesar puluhan MB - itu harga yang tidak sepadan untuk
 * ikon 14px.
 *
 * `currentColor` tetap dipakai supaya warna tema aplikasi berlaku; warna per
 * bahasa hanya dipakai untuk berkas, seperti tema lainnya.
 */
function aksaraTanda(peta) {
  const hasil = {};
  for (const [jenis, { huruf, warna }] of Object.entries(peta)) {
    hasil[jenis] = {
      warna,
      gambar: (x, y, s) =>
        `<text x="${x + s * 0.5}" y="${y + s * 0.5}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="'Yu Gothic UI','Yu Gothic','Meiryo','MS Gothic','Noto Sans CJK JP','PingFang SC','Microsoft YaHei',sans-serif" ` +
        `font-size="${(s * 0.92).toFixed(2)}" font-weight="600" fill="currentColor">${huruf}</text>`,
    };
  }
  return hasil;
}

const AKSARA_KANJI = aksaraTanda({
  ts: { huruf: '型', warna: '#3178c6' },
  js: { huruf: '式', warna: '#f7df1e' },
  rust: { huruf: '錆', warna: '#dea584' },
  python: { huruf: '蛇', warna: '#ffd43b' },
  json: { huruf: '花', warna: '#cbcb41' },
  css: { huruf: '装', warna: '#42a5f5' },
  md: { huruf: '文', warna: '#42a5f5' },
  teks: { huruf: '紙', warna: '#9e9e9e' },
  data: { huruf: '庫', warna: '#a1887f' },
  aset: { huruf: '絵', warna: '#ba68c8' },
  hasil: { huruf: '箱', warna: '#ffa726' },
  konfig: { huruf: '鍵', warna: '#8d9db6' },
  kode: { huruf: '源', warna: '#90a4ae' },
  uji: { huruf: '験', warna: '#66bb6a' },
  dokumen: { huruf: '書', warna: '#64b5f6' },
});

const AKSARA_HANZI = aksaraTanda({
  ts: { huruf: '型', warna: '#3178c6' },
  js: { huruf: '式', warna: '#f7df1e' },
  rust: { huruf: '锈', warna: '#dea584' },
  python: { huruf: '蛇', warna: '#ffd43b' },
  json: { huruf: '花', warna: '#cbcb41' },
  css: { huruf: '装', warna: '#42a5f5' },
  md: { huruf: '文', warna: '#42a5f5' },
  teks: { huruf: '纸', warna: '#9e9e9e' },
  data: { huruf: '库', warna: '#a1887f' },
  aset: { huruf: '图', warna: '#ba68c8' },
  hasil: { huruf: '箱', warna: '#ffa726' },
  konfig: { huruf: '键', warna: '#8d9db6' },
  kode: { huruf: '源', warna: '#90a4ae' },
  uji: { huruf: '验', warna: '#66bb6a' },
  dokumen: { huruf: '书', warna: '#64b5f6' },
});

const AKSARA_HIRAGANA = aksaraTanda({
  ts: { huruf: 'か', warna: '#3178c6' },
  js: { huruf: 'し', warna: '#f7df1e' },
  rust: { huruf: 'さ', warna: '#dea584' },
  python: { huruf: 'へ', warna: '#ffd43b' },
  json: { huruf: 'は', warna: '#cbcb41' },
  css: { huruf: 'す', warna: '#42a5f5' },
  md: { huruf: 'も', warna: '#42a5f5' },
  teks: { huruf: 'と', warna: '#9e9e9e' },
  data: { huruf: 'く', warna: '#a1887f' },
  aset: { huruf: 'え', warna: '#ba68c8' },
  hasil: { huruf: 'は', warna: '#ffa726' },
  konfig: { huruf: 'か', warna: '#8d9db6' },
  kode: { huruf: 'こ', warna: '#90a4ae' },
  uji: { huruf: 'て', warna: '#66bb6a' },
  dokumen: { huruf: 'ふ', warna: '#64b5f6' },
});

/* ── delapan tema, semuanya FOLDER, hanya gayanya berbeda ──────────────────── */
const TEMA = {
  klasik: {
    label: 'Classic Folder',
    ket: 'Folder standar modern: bodi terisi lembut dengan tab tegas dan sudut membulat kecil.',
    style: { r: 1.2, sw: 1.15, op: 0.22, join: 'round', cap: 'round', fold: true },
  },
  garis: {
    label: 'Clean Outline',
    ket: 'Hanya garis kontur luar tanpa isi — bersih, ringan, dan tidak menarik perhatian.',
    style: { r: 1.2, sw: 1.3, op: 0, join: 'round', cap: 'round', outlineOnly: true, fold: true },
  },
  padat: {
    label: 'Solid Modern',
    ket: 'Bodi folder terisi penuh tanpa garis dalam — tegas dan jelas di ukuran kecil.',
    style: { r: 0.8, sw: 0, op: 0.85, join: 'miter', cap: 'butt', tab: 'none', fold: false, fillOnly: true },
  },
  duotone: {
    label: 'Duotone Accent',
    ket: 'Badan pekat dengan tab dan tanda lebih terang — dua nada warna dalam satu ikon.',
    style: { r: 1.2, sw: 1.1, op: 0.55, join: 'round', cap: 'round', fold: true },
  },
  bulat: {
    label: 'Soft Rounded',
    ket: 'Sudut sangat melengkung dan tab membulat — paling lembut dari kedelapan tema.',
    style: { r: 2.4, sw: 1.2, op: 0.24, join: 'round', cap: 'round', fold: true },
  },
  tajam: {
    label: 'Sharp Grid',
    ket: 'Sudut siku dan tab persegi — presisi dan rapi untuk tampilan teknis.',
    style: { r: 0.1, sw: 1.25, op: 0.2, join: 'miter', cap: 'butt', fold: true },
  },
  terbuka: {
    label: 'Expanded Dynamic',
    ket: 'Penutup folder terlihat terlipat — memberi kesan isi dan kedalaman.',
    style: { r: 1.2, sw: 1.15, op: 0.18, join: 'round', cap: 'round', fold: true },
  },
  minimal: {
    label: 'Minimal Slim',
    ket: 'Garis tipis satu warna tanpa isi dan tanpa tab — seminimal mungkin.',
    style: { r: 1.4, sw: 0.9, op: 0, join: 'round', cap: 'round', outlineOnly: true, tab: 'none', fold: false },
  },
  /* Tiga tema AKSARA. Bentuk foldernya sama dengan Klasik; yang membedakan
     aksara di dalamnya. `tanda` menimpa tabel TANDA geometri untuk tema ini. */
  kanji: {
    label: 'Kanji',
    ket: 'Ikon aksara Kanji Jepang: 型 untuk TypeScript, 錆 untuk Rust, 蛇 untuk Python. Folder tetap folder.',
    style: { r: 0.9, sw: 1.45, op: 0.14, join: 'miter', cap: 'square', fold: true },
    tanda: AKSARA_KANJI,
  },
  hanzi: {
    label: 'Hanzi',
    ket: 'Ikon aksara Hanzi China Sederhana: 型 TypeScript, 锈 Rust, 蛇 Python. Folder tetap folder.',
    style: { r: 0.4, sw: 1.25, op: 0.26, join: 'miter', cap: 'butt', fold: true },
    tanda: AKSARA_HANZI,
  },
  hiragana: {
    label: 'Hiragana',
    ket: 'Ikon aksara Hiragana Jepang: か TypeScript, さ Rust, へ Python. Paling ringan dari ketiga tema aksara.',
    style: { r: 2.2, sw: 1.05, op: 0.16, join: 'round', cap: 'round', fold: false },
    tanda: AKSARA_HIRAGANA,
  },
};

/* Ekstensi -> jenis tanda. Setiap bahasa punya tanda SENDIRI. */
const JENIS = {
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  rs: 'rust', go: 'kode', py: 'python', java: 'kode', kt: 'kode', c: 'kode',
  cpp: 'kode', h: 'kode', hpp: 'kode', cs: 'kode', rb: 'kode', php: 'kode',
  swift: 'kode', sh: 'kode', ps1: 'kode', lua: 'kode',
  md: 'md', txt: 'teks', rst: 'teks', log: 'teks',
  json: 'json', jsonc: 'json', yml: 'data', yaml: 'data', toml: 'data', xml: 'data', csv: 'data', sql: 'data',
  png: 'aset', jpg: 'aset', jpeg: 'aset', gif: 'aset', svg: 'aset', webp: 'aset', ico: 'aset', bmp: 'aset',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
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

/*
 * ── IKON KHUSUS PER NAMA FOLDER ────────────────────────────────────────────
 *
 * Kelompok saja tidak cukup. `src`, `lib`, `app`, dan `components` semuanya
 * masuk kelompok `kode`, jadi keempatnya memakai SATU gambar - dan pohon berkas
 * berisi belasan folder yang terlihat identik. Itu yang membuat "tema sudah
 * berganti tapi ikonnya masih sama".
 *
 * Setiap nama penting sekarang punya tanda sendiri, digambar di dalam bentuk
 * folder tema. Yang dipilih adalah tanda yang benar-benar berarti:
 *
 *   src       kode ( < > )        components  kotak tersusun
 *   lib       buku                hooks       kait
 *   app       jendela             store       silinder data
 *   api       awan/server         scripts     terminal
 *   docs      dokumen             tests       tabung uji
 *   public    globe               assets      gambar
 *   .github   cabang git          .zephyr     berlian
 *   release   kotak paket         config      roda gigi
 */
const TANDA_NAMA = {
  src: { warna: '#4fc3f7', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.34} ${y + s * 0.22} ${x + s * 0.06} ${y + s * 0.5} ${x + s * 0.34} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.66} ${y + s * 0.22} ${x + s * 0.94} ${y + s * 0.5} ${x + s * 0.66} ${y + s * 0.78}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` },
  lib: { warna: '#a5d6a7', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.2} ${y + s * 0.2}h${s * 0.28}v${s * 0.6}h${-s * 0.28}z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.52} ${y + s * 0.2}h${s * 0.28}v${s * 0.6}h${-s * 0.28}z" fill="currentColor" opacity="0.75"/>` },
  components: { warna: '#ffb74d', gambar: (x, y, s) =>
    `<rect x="${x + s * 0.16}" y="${y + s * 0.16}" width="${s * 0.3}" height="${s * 0.3}" rx="0.7" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<rect x="${x + s * 0.54}" y="${y + s * 0.54}" width="${s * 0.3}" height="${s * 0.3}" rx="0.7" fill="currentColor" opacity="0.8"/>` },
  hooks: { warna: '#ba68c8', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.36} ${y + s * 0.16}v${s * 0.26}a${s * 0.2} ${s * 0.2} 0 0 0 ${s * 0.4} 0v${-s * 0.1}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>` +
    `<path d="M${x + s * 0.36} ${y + s * 0.66}v${s * 0.18}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>` },
  app: { warna: '#64b5f6', gambar: (x, y, s) =>
    `<rect x="${x + s * 0.14}" y="${y + s * 0.18}" width="${s * 0.72}" height="${s * 0.64}" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<path d="M${x + s * 0.14} ${y + s * 0.36}h${s * 0.72}" stroke="currentColor" stroke-width="1.1"/>` },
  store: { warna: '#4db6ac', gambar: (x, y, s) =>
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.26}" rx="${s * 0.28}" ry="${s * 0.11}" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
    `<path d="M${x + s * 0.22} ${y + s * 0.26}v${s * 0.46}M${x + s * 0.78} ${y + s * 0.26}v${s * 0.46}" stroke="currentColor" stroke-width="1.05"/>` +
    `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.72}" rx="${s * 0.28}" ry="${s * 0.11}" fill="none" stroke="currentColor" stroke-width="1.05"/>` },
  api: { warna: '#81c784', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.28} ${y + s * 0.66}a${s * 0.16} ${s * 0.16} 0 0 1 0 ${-s * 0.3} ${s * 0.16} ${s * 0.16} 0 0 1 ${s * 0.02} ${-s * 0.16}h${s * 0.4}a${s * 0.14} ${s * 0.14} 0 0 1 ${s * 0.02} ${s * 0.16} ${s * 0.16} ${s * 0.16} 0 0 1 0 ${s * 0.3}z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>` },
  scripts: { warna: '#90a4ae', gambar: (x, y, s) =>
    `<rect x="${x + s * 0.12}" y="${y + s * 0.2}" width="${s * 0.76}" height="${s * 0.6}" rx="1" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
    `<path d="M${x + s * 0.28} ${y + s * 0.42} ${x + s * 0.4} ${y + s * 0.52} ${x + s * 0.28} ${y + s * 0.62}M${x + s * 0.5} ${y + s * 0.64}h${s * 0.2}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` },
  docs: { warna: '#64b5f6', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.2} ${y + s * 0.18}h${s * 0.4}v${s * 0.64}h${-s * 0.4}z" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
    `<path d="M${x + s * 0.62} ${y + s * 0.18}h${s * 0.18}v${s * 0.64}h${-s * 0.18}z" fill="currentColor" opacity="0.7"/>` },
  test: { warna: '#66bb6a', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.36} ${y + s * 0.16}v${s * 0.3}L${x + s * 0.18} ${y + s * 0.8}h${s * 0.64}L${x + s * 0.64} ${y + s * 0.46}V${y + s * 0.16}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` },
  public: { warna: '#4dd0e1', gambar: (x, y, s) =>
    `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.3}" fill="none" stroke="currentColor" stroke-width="1.05"/>` +
    `<path d="M${x + s * 0.2} ${y + s * 0.5}h${s * 0.6}M${x + s * 0.5} ${y + s * 0.2}c${s * 0.16} ${s * 0.18} ${s * 0.16} ${s * 0.42} 0 ${s * 0.6}" fill="none" stroke="currentColor" stroke-width="0.95"/>` },
  assets: { warna: '#ba68c8', gambar: (x, y, s) =>
    `<circle cx="${x + s * 0.34}" cy="${y + s * 0.34}" r="${s * 0.1}" fill="currentColor"/>` +
    `<path d="M${x + s * 0.14} ${y + s * 0.8} ${x + s * 0.4} ${y + s * 0.54} ${x + s * 0.58} ${y + s * 0.68} ${x + s * 0.86} ${y + s * 0.42}v${s * 0.38}Z" fill="currentColor" opacity="0.8"/>` },
  git: { warna: '#f4511e', gambar: (x, y, s) =>
    `<circle cx="${x + s * 0.32}" cy="${y + s * 0.28}" r="${s * 0.11}" fill="currentColor"/>` +
    `<circle cx="${x + s * 0.32}" cy="${y + s * 0.72}" r="${s * 0.11}" fill="currentColor"/>` +
    `<circle cx="${x + s * 0.7}" cy="${y + s * 0.5}" r="${s * 0.11}" fill="currentColor"/>` +
    `<path d="M${x + s * 0.32} ${y + s * 0.39}v${s * 0.22}M${x + s * 0.41} ${y + s * 0.5}h${s * 0.2}" stroke="currentColor" stroke-width="1.1"/>` },
  zephyr: { warna: '#4fc3f7', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.84} ${y + s * 0.5} ${x + s * 0.5} ${y + s * 0.84} ${x + s * 0.16} ${y + s * 0.5}Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M${x + s * 0.5} ${y + s * 0.34} ${x + s * 0.66} ${y + s * 0.5} ${x + s * 0.5} ${y + s * 0.66} ${x + s * 0.34} ${y + s * 0.5}Z" fill="currentColor" opacity="0.8"/>` },
  release: { warna: '#ffa726', gambar: (x, y, s) =>
    `<path d="M${x + s * 0.5} ${y + s * 0.14} ${x + s * 0.84} ${y + s * 0.34}v${s * 0.32}L${x + s * 0.5} ${y + s * 0.86} ${x + s * 0.16} ${y + s * 0.66}V${y + s * 0.34}Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>` },
  config: { warna: '#8d9db6', gambar: (x, y, s) =>
    `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.16}" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
    `<path d="M${x + s * 0.5} ${y + s * 0.16}v${s * 0.1}M${x + s * 0.5} ${y + s * 0.74}v${s * 0.1}M${x + s * 0.16} ${y + s * 0.5}h${s * 0.1}M${x + s * 0.74} ${y + s * 0.5}h${s * 0.1}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>` },
};

/* Nama folder -> kunci TANDA_NAMA. Yang tidak ada di sini memakai kelompoknya. */
const NAMA_KHUSUS = {
  src: 'src', lib: 'lib', app: 'app', components: 'components', hooks: 'hooks',
  store: 'store', stores: 'store', api: 'api', scripts: 'scripts', tools: 'scripts',
  docs: 'docs', doc: 'docs', documentation: 'docs',
  test: 'test', tests: 'test', __tests__: 'test', spec: 'test', specs: 'test',
  public: 'public', static: 'public',
  assets: 'assets', images: 'assets', img: 'assets', icons: 'assets', media: 'assets',
  '.git': 'git', '.github': 'git',
  '.zephyr': 'zephyr', '.claude': 'zephyr',
  release: 'release', dist: 'release', build: 'release', out: 'release', target: 'release',
  config: 'config', configs: 'config', '.vscode': 'config', '.idea': 'config',
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

  /* Tema aksara membawa tabel tandanya sendiri; tema geometri memakai TANDA. */
  const TABEL = t.tanda ?? TANDA;

  const iconDefinitions = {};
  const fileExtensions = {};
  const fileNames = {};
  const folderNames = {};
  const folderNamesExpanded = {};

  /* Berkas: satu per jenis tanda. Warna ikut ditulis ke SVG supaya TS biru,
     Rust oranye, Python kuning - bukan semua abu-abu. */
  for (const [jenis, t2] of Object.entries(TABEL)) {
    const namaFile = `file-${jenis}.svg`;
    const svg = berkas(t.style, t2.gambar).replace(/currentColor/g, t2.warna);
    fs.writeFileSync(path.join(folderIkon, namaFile), svg, 'utf8');
    iconDefinitions[`_f_${jenis}`] = { iconPath: `./icons/${namaFile}` };
  }

  /* Folder: per kelompok, tertutup dan terbuka. Folder memakai currentColor
     supaya warnanya ikut tema aplikasi, bukan warna bahasa. */
  for (const [jenis, t2] of Object.entries(TABEL)) {
    for (const buka of [false, true]) {
      const nama = `folder-${jenis}${buka ? '-open' : ''}.svg`;
      fs.writeFileSync(path.join(folderIkon, nama), folder(t.style, buka, t2.gambar), 'utf8');
      iconDefinitions[`_d_${jenis}${buka ? 'Open' : ''}`] = { iconPath: `./icons/${nama}` };
    }
  }

  /*
   * Folder BERNAMA: satu gambar per nama penting, bukan satu gambar per
   * kelompok. Tanpa ini `src`, `lib`, `app` dan `components` semuanya memakai
   * tanda `kode` yang sama, dan pohon berkas berisi belasan folder identik -
   * terbaca sebagai "ikonnya tidak berubah" walaupun temanya sudah berganti.
   */
  for (const [kunciNama, kunciTanda] of Object.entries(NAMA_KHUSUS)) {
    const tanda = TANDA_NAMA[kunciTanda];
    if (!tanda) continue;
    for (const buka of [false, true]) {
      const aman = kunciNama.replace(/[^a-z0-9]+/gi, '_');
      const nama = `fn-${aman}${buka ? '-open' : ''}.svg`;
      fs.writeFileSync(path.join(folderIkon, nama), folder(t.style, buka, tanda.gambar), 'utf8');
      iconDefinitions[`_n_${aman}${buka ? 'Open' : ''}`] = { iconPath: `./icons/${nama}` };
    }
  }

  /* Folder umum (nama tidak dikenal). */
  for (const buka of [false, true]) {
    const nama = `folder${buka ? '-open' : ''}.svg`;
    fs.writeFileSync(path.join(folderIkon, nama), folder(t.style, buka, null), 'utf8');
    iconDefinitions[buka ? '_folderOpen' : '_folder'] = { iconPath: `./icons/${nama}` };
  }

  /* Berkas umum. */
  fs.writeFileSync(
    path.join(folderIkon, 'file.svg'),
    berkas(t.style, TABEL.teks.gambar).replace(/currentColor/g, TABEL.teks.warna),
    'utf8',
  );
  iconDefinitions._file = { iconPath: './icons/file.svg' };

  for (const [ext, jenis] of Object.entries(JENIS)) fileExtensions[ext] = `_f_${jenis}`;
  for (const [nama, jenis] of Object.entries(NAMA_BERKAS)) fileNames[nama] = `_f_${jenis}`;

  /* Nama KHUSUS menang atas kelompoknya: `src` memakai tanda kode-nya sendiri,
     bukan tanda kelompok `kode` yang dipakai bersama sepuluh folder lain. */
  for (const [jenis, nama] of Object.entries(KELOMPOK)) {
    for (const n of nama) {
      const khusus = NAMA_KHUSUS[n];
      if (khusus) {
        const aman = n.replace(/[^a-z0-9]+/gi, '_');
        folderNames[n] = `_n_${aman}`;
        folderNamesExpanded[n] = `_n_${aman}Open`;
      } else {
        folderNames[n] = `_d_${jenis}`;
        folderNamesExpanded[n] = `_d_${jenis}Open`;
      }
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
