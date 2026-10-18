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
  /*
   * ── SATU TANDA PER BAHASA ───────────────────────────────────────────────
   *
   * Sebelum ini 14 bahasa (go, java, kt, c, cpp, h, cs, rb, php, swift, sh,
   * ps1, lua, ...) semuanya menunjuk tanda `kode` yang sama, jadi sebuah pohon
   * berisi `main.go`, `App.java`, dan `script.sh` menampilkan tiga ikon IDENTIK.
   * Terbaca sebagai "ikonnya masih sama semua" - dan itu benar.
   *
   * Setiap bahasa sekarang punya bentuk + warnanya sendiri, dipilih supaya
   * masih terbaca pada 14px: bukan huruf (huruf sudah dipakai tema aksara), tapi
   * siluet yang berbeda.
   */
  go: {
    warna: '#00acd7',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.34}" cy="${y + s * 0.44}" r="${s * 0.17}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<circle cx="${x + s * 0.66}" cy="${y + s * 0.6}" r="${s * 0.17}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${x + s * 0.34} ${y + s * 0.38}h${s * 0.05}M${x + s * 0.66} ${y + s * 0.54}h${s * 0.05}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  java: {
    warna: '#e76f00',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.34} ${y + s * 0.66}c${s * 0.1} ${-s * 0.12} ${s * 0.28} ${-s * 0.16} ${s * 0.32} ${-s * 0.32}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.42} ${y + s * 0.44}c${s * 0.16} ${-s * 0.1} ${s * 0.06} ${-s * 0.2} ${s * 0.2} ${-s * 0.28}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.3} ${y + s * 0.8}h${s * 0.44}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  kotlin: {
    warna: '#7f52ff',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.2} ${y + s * 0.2}v${s * 0.6}h${s * 0.6}Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.2} ${y + s * 0.2} ${x + s * 0.8} ${y + s * 0.8}" stroke="currentColor" stroke-width="1.4"/>`,
  },
  c: {
    warna: '#5c6bc0',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.78} ${y + s * 0.34}a${s * 0.26} ${s * 0.26} 0 1 0 0 ${s * 0.32}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  },
  cpp: {
    warna: '#00599c',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.62} ${y + s * 0.36}a${s * 0.24} ${s * 0.24} 0 1 0 0 ${s * 0.28}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.74} ${y + s * 0.42}v${s * 0.2}M${x + s * 0.64} ${y + s * 0.52}h${s * 0.2}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  csharp: {
    warna: '#68217a',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.62} ${y + s * 0.36}a${s * 0.24} ${s * 0.24} 0 1 0 0 ${s * 0.28}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.76} ${y + s * 0.38}l${-s * 0.1} ${s * 0.28}M${x + s * 0.84} ${y + s * 0.38}l${-s * 0.1} ${s * 0.28}M${x + s * 0.66} ${y + s * 0.48}h${s * 0.22}M${x + s * 0.66} ${y + s * 0.56}h${s * 0.22}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  ruby: {
    warna: '#cc342d',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.84} ${y + s * 0.42} ${x + s * 0.68} ${y + s * 0.82}H${x + s * 0.32}L${x + s * 0.16} ${y + s * 0.42}Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.16} ${y + s * 0.42}h${s * 0.68}M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.4} ${y + s * 0.82}M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.6} ${y + s * 0.82}" stroke="currentColor" stroke-width="0.9" opacity="0.7"/>`,
  },
  php: {
    warna: '#8892bf',
    gambar: (x, y, s) =>
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.5}" rx="${s * 0.36}" ry="${s * 0.22}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${x + s * 0.36} ${y + s * 0.42}v${s * 0.18}M${x + s * 0.36} ${y + s * 0.42}h${s * 0.1}a${s * 0.06} ${s * 0.06} 0 0 1 0 ${s * 0.1}h${-s * 0.1}" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
      `<path d="M${x + s * 0.58} ${y + s * 0.42}v${s * 0.18}M${x + s * 0.58} ${y + s * 0.5}h${s * 0.12}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  },
  swift: {
    warna: '#f05138',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.2} ${y + s * 0.24}c${s * 0.3} ${s * 0.06} ${s * 0.46} ${s * 0.28} ${s * 0.56} ${s * 0.44}c${-s * 0.2} ${s * 0.04} ${-s * 0.42} ${-s * 0.02} ${-s * 0.6} ${-s * 0.14}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.3} ${y + s * 0.76} ${x + s * 0.68} ${y + s * 0.44}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  shell: {
    warna: '#89e051',
    gambar: (x, y, s) =>
      `<rect x="${x + s * 0.12}" y="${y + s * 0.2}" width="${s * 0.76}" height="${s * 0.6}" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
      `<path d="M${x + s * 0.28} ${y + s * 0.4} ${x + s * 0.4} ${y + s * 0.5} ${x + s * 0.28} ${y + s * 0.6}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.52} ${y + s * 0.62}h${s * 0.22}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  lua: {
    warna: '#000080',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.32}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<circle cx="${x + s * 0.62}" cy="${y + s * 0.62}" r="${s * 0.07}" fill="currentColor"/>`,
  },
  css: {
    warna: '#42a5f5',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.22} ${y + s * 0.24}h${s * 0.56}l${-s * 0.06} ${s * 0.46}a${s * 0.2} ${s * 0.2} 0 0 1 ${-s * 0.22} 0z" fill="currentColor" opacity="0.85"/>` +
      `<path d="M${x + s * 0.34} ${y + s * 0.4}h${s * 0.32}" stroke="var(--bg,#111)" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  scss: {
    warna: '#cf649a',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.3}" fill="none" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${x + s * 0.5} ${y + s * 0.2}v${s * 0.6}M${x + s * 0.2} ${y + s * 0.5}h${s * 0.6}" stroke="currentColor" stroke-width="1.2" opacity="0.8"/>`,
  },
  html: {
    warna: '#e44d26',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.24} ${y + s * 0.2}h${s * 0.52}l${-s * 0.06} ${s * 0.5}a${s * 0.18} ${s * 0.18} 0 0 1 ${-s * 0.2} 0z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.4} ${y + s * 0.38}h${s * 0.2}M${x + s * 0.38} ${y + s * 0.52}h${s * 0.24}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  },
  sql: {
    warna: '#e38c00',
    gambar: (x, y, s) =>
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.28}" rx="${s * 0.3}" ry="${s * 0.12}" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
      `<path d="M${x + s * 0.2} ${y + s * 0.28}v${s * 0.44}M${x + s * 0.8} ${y + s * 0.28}v${s * 0.44}" stroke="currentColor" stroke-width="1.4"/>` +
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.72}" rx="${s * 0.3}" ry="${s * 0.12}" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
      `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.5}" rx="${s * 0.3}" ry="${s * 0.12}" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.6"/>`,
  },
  yaml: {
    warna: '#cb171e',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.22} ${y + s * 0.3}h${s * 0.14}M${x + s * 0.22} ${y + s * 0.5}h${s * 0.14}M${x + s * 0.22} ${y + s * 0.7}h${s * 0.14}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M${x + s * 0.46} ${y + s * 0.3}h${s * 0.32}M${x + s * 0.46} ${y + s * 0.5}h${s * 0.32}M${x + s * 0.46} ${y + s * 0.7}h${s * 0.32}" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>`,
  },
  toml: {
    warna: '#9c4221',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.24} ${y + s * 0.3}h${s * 0.18}v${s * 0.4}H${x + s * 0.24}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.56} ${y + s * 0.3}h${s * 0.22}M${x + s * 0.56} ${y + s * 0.5}h${s * 0.22}M${x + s * 0.56} ${y + s * 0.7}h${s * 0.22}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  xml: {
    warna: '#8bc34a',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.34} ${y + s * 0.26} ${x + s * 0.1} ${y + s * 0.5} ${x + s * 0.34} ${y + s * 0.74}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.66} ${y + s * 0.26} ${x + s * 0.9} ${y + s * 0.5} ${x + s * 0.66} ${y + s * 0.74}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.56} ${y + s * 0.22} ${x + s * 0.44} ${y + s * 0.78}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  csv: {
    warna: '#4caf50',
    gambar: (x, y, s) =>
      `<rect x="${x + s * 0.16}" y="${y + s * 0.24}" width="${s * 0.68}" height="${s * 0.52}" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
      `<path d="M${x + s * 0.16} ${y + s * 0.42}h${s * 0.68}M${x + s * 0.16} ${y + s * 0.58}h${s * 0.68}M${x + s * 0.4} ${y + s * 0.24}v${s * 0.52}M${x + s * 0.6} ${y + s * 0.24}v${s * 0.52}" stroke="currentColor" stroke-width="0.9" opacity="0.75"/>`,
  },
  gambar: {
    warna: '#ba68c8',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.34}" cy="${y + s * 0.34}" r="${s * 0.11}" fill="currentColor"/>` +
      `<path d="M${x + s * 0.12} ${y + s * 0.82} ${x + s * 0.4} ${y + s * 0.52} ${x + s * 0.58} ${y + s * 0.68} ${x + s * 0.88} ${y + s * 0.4}v${s * 0.42}Z" fill="currentColor" opacity="0.85"/>`,
  },
  kunci: {
    warna: '#8d9db6',
    gambar: (x, y, s) =>
      `<circle cx="${x + s * 0.5}" cy="${y + s * 0.5}" r="${s * 0.17}" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      `<path d="M${x + s * 0.5} ${y + s * 0.14}v${s * 0.12}M${x + s * 0.5} ${y + s * 0.74}v${s * 0.12}M${x + s * 0.14} ${y + s * 0.5}h${s * 0.12}M${x + s * 0.74} ${y + s * 0.5}h${s * 0.12}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  arsip: {
    warna: '#ffa726',
    gambar: (x, y, s) =>
      `<path d="M${x + s * 0.5} ${y + s * 0.16} ${x + s * 0.86} ${y + s * 0.36}v${s * 0.3}L${x + s * 0.5} ${y + s * 0.86} ${x + s * 0.14} ${y + s * 0.66}v${-s * 0.3}Z" fill="none" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>` +
      `<path d="M${x + s * 0.5} ${y + s * 0.16}v${s * 0.32}M${x + s * 0.42} ${y + s * 0.4}h${s * 0.16}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`,
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
  /* Alias lama: nama tanda yang dipakai tabel folder. */
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
};

/*
 * Bingkai FOLDER. Semua tema memakai bentuk folder yang sama (badan + tab);
 * `gaya` yang membedakan. Ini inti permintaan: tema berganti, folder tetap
 * folder.
 */
/*
 * ── BENTUK FOLDER: satu arsitektur per tema ────────────────────────────────
 *
 * Sebelum ini semua tema memakai SATU path badan folder, dan yang berbeda cuma
 * `r` (0.1–2.4px) serta `opacity` (0.14–0.26). Pada ikon 14px perbedaan 1–2px
 * lengkungan dan 0.04 opacity TIDAK TERLIHAT - jadi tujuh tema tampil identik,
 * dan itu benar seperti yang dikeluhkan.
 *
 * Sekarang setiap tema punya ARSITEKTUR yang berbeda, bukan angka yang berbeda:
 *
 *   klasik    badan penuh + tab kiri-atas, sudut membulat kecil
 *   garis     hanya kontur, tanpa isi
 *   padat     kotak penuh tanpa tab, tanpa kontur
 *   duotone   badan gelap + BIDANG TERANG di bagian bawah
 *   bulat     badan bulat penuh (bukan kotak) + tab melengkung
 *   tajam     kotak siku + tab persegi menonjol
 *   terbuka   badan + penutup TERLIPAT TERLIHAT (dua bidang)
 *   minimal   satu garis horizontal + sudut lipat kecil
 *
 * Tanda jenis berkas digambar DI DALAM bentuk itu, jadi tema tetap konsisten
 * sementara bentuk luarnya berbeda.
 */
const BENTUK_FOLDER = {
  /* Badan penuh, tab kiri-atas, sudut membulat. */
  klasik: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.6 4.4Q1.6 3.2 2.8 3.2H6.2L7.6 1.8H13.2Q14.4 1.8 14.4 3V12.4Q14.4 13.6 13.2 13.6H2.8Q1.6 13.6 1.6 12.4Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>` +
    (buka
      ? `<path d="M2.4 13.6 4 7.4h10.4l-1.6 6.2Z" fill="currentColor" opacity="0.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>`
      : '') +
    (tanda ? tanda(4.6, 5.4, 6.8) : '') +
    `</svg>`,

  /* Hanya kontur: tidak ada fill sama sekali. */
  garis: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.6 4.4Q1.6 3.2 2.8 3.2H6.2L7.6 1.8H13.2Q14.4 1.8 14.4 3V12.4Q14.4 13.6 13.2 13.6H2.8Q1.6 13.6 1.6 12.4Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>` +
    (buka ? `<path d="M2.4 13.6 4 7.4h10.4l-1.6 6.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` : '') +
    (tanda ? tanda(4.6, 5.4, 6.8) : '') +
    `</svg>`,

  /* Kotak penuh, TANPA tab, tanpa kontur - blok warna. */
  padat: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<rect x="1.6" y="2.6" width="12.8" height="11" rx="1.4" fill="currentColor" opacity="0.85"/>` +
    (buka ? `<rect x="2.6" y="8.4" width="11.8" height="5.2" rx="1" fill="currentColor" opacity="0.4"/>` : '') +
    (tanda ? tanda(4.6, 5, 6.8) : '') +
    `</svg>`,

  /* Dua nada: badan atas gelap, bidang bawah lebih terang. */
  duotone: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.6 4.4Q1.6 3.2 2.8 3.2H6.2L7.6 1.8H13.2Q14.4 1.8 14.4 3V12.4Q14.4 13.6 13.2 13.6H2.8Q1.6 13.6 1.6 12.4Z" fill="currentColor" opacity="0.3"/>` +
    `<path d="M1.6 8.2h12.8v4.2Q14.4 13.6 13.2 13.6H2.8Q1.6 13.6 1.6 12.4Z" fill="currentColor" opacity="0.75"/>` +
    (buka ? `<path d="M2.4 13.6 4 9.4h10.4l-1.6 4.2Z" fill="currentColor" opacity="0.95"/>` : '') +
    (tanda ? tanda(4.6, 3.4, 6.4) : '') +
    `</svg>`,

  /* Badan BULAT (bukan kotak): lingkaran penuh dengan tab melengkung. */
  bulat: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<circle cx="8" cy="8.4" r="6.2" fill="currentColor" opacity="0.24" stroke="currentColor" stroke-width="1.2"/>` +
    `<path d="M3.4 3.6Q3.4 2.2 4.8 2.2h3.4q1.4 0 1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>` +
    (buka ? `<path d="M8 4.6a3.8 3.8 0 0 1 0 7.6Z" fill="currentColor" opacity="0.6"/>` : '') +
    (tanda ? tanda(5, 5.6, 6) : '') +
    `</svg>`,

  /* Kotak siku, tab persegi yang MENONJOL ke atas. */
  tajam: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.4 2.2h5.4v1.6h8V13.8H1.4Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/>` +
    (buka ? `<path d="M2.4 13.8 3.8 7.6h10.6l-1.4 6.2Z" fill="currentColor" opacity="0.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="miter"/>` : '') +
    (tanda ? tanda(4.4, 5.6, 6.8) : '') +
    `</svg>`,

  /* Penutup TERLIPAT TERLIHAT: dua bidang, penutup menutupi separuh badan. */
  terbuka: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.6 4.4Q1.6 3.2 2.8 3.2H6.2L7.6 1.8H13.2Q14.4 1.8 14.4 3V9.4H1.6Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>` +
    `<path d="M1.6 9.4h12.8l-1.8 4.4H3.4Z" fill="currentColor" opacity="${buka ? 0.75 : 0.5}" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>` +
    (tanda ? tanda(4.6, 4.4, 6.4) : '') +
    `</svg>`,

  /* Satu garis tebal + sudut lipat: seminimal mungkin tapi masih folder. */
  minimal: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.8 4.6h5.2l1.4-1.8h5.8" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="M1.8 4.6v8h12.4v-8" fill="none" stroke="currentColor" stroke-width="1"/>` +
    (buka ? `<path d="M3 12.6 4.2 8h9.6l-1.2 4.6Z" fill="currentColor" opacity="0.35"/>` : '') +
    (tanda ? tanda(4.8, 5.6, 6) : '') +
    `</svg>`,

  /* Kanji: badan bersudut TEGAS dengan garis dalam horizontal (kesan kolom
     aksara). Tidak ada tema geometri yang memakai garis dalam. */
  kanji: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M1.5 3h5.6l1.3-1.5h6.1V13.5H1.5Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.3" stroke-linejoin="miter"/>` +
    `<path d="M1.5 6.6h13M1.5 9.9h13" stroke="currentColor" stroke-width="0.7" opacity="0.6"/>` +
    (buka ? `<path d="M2.6 13.5 4 10.4h10l-1.4 3.1Z" fill="currentColor" opacity="0.45"/>` : '') +
    (tanda ? tanda(4.4, 4.2, 6.6) : '') +
    `</svg>`,

  /* Hanzi: KOTAK GANDA - bingkai luar tipis + bingkai dalam tebal. */
  hanzi: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<rect x="1.4" y="2.2" width="13.2" height="11.6" rx="0.6" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="0.9"/>` +
    `<rect x="3" y="4" width="10" height="8" rx="0.4" fill="none" stroke="currentColor" stroke-width="1.6"/>` +
    (buka ? `<rect x="3" y="8.4" width="10" height="3.6" rx="0.3" fill="currentColor" opacity="0.35"/>` : '') +
    (tanda ? tanda(4.8, 5.2, 6.4) : '') +
    `</svg>`,

  /* Hiragana: sudut MIRING - badan berupa jajar genjang. */
  hiragana: (buka, tanda) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M2.6 3.4h10.8l-1.6 10.2H1Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>` +
    `<path d="M3.4 3.4 5 1.8h9.4" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>` +
    (buka ? `<path d="M2 13.6 3.4 9.4h9.2l-1 4.2Z" fill="currentColor" opacity="0.45"/>` : '') +
    (tanda ? tanda(4.6, 5.4, 6.4) : '') +
    `</svg>`,
};

function folder(style, open, tanda) {
  const bentuk = BENTUK_FOLDER[style.bentuk] ?? BENTUK_FOLDER.klasik;
  return bentuk(open, tanda);
}

/*
 * Bingkai BERKAS: gaya sama dengan tema, tapi bentuknya lembar kertas.
 *
 * Bentuk berkas juga dibedakan per tema supaya pohon berkas tidak terlihat
 * seragam: `garis` dan `minimal` hanya kontur, `padat` tanpa sudut lipat,
 * `bulat` bersudut sangat membulat.
 */
function berkas(style, tanda) {
  const bentuk = style.bentuk ?? 'klasik';
  const n = (v) => Math.round(v * 10) / 10;

  if (bentuk === 'garis' || bentuk === 'minimal') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M3.6 1.8H9.6L12.4 4.8v9.4H3.6Z" fill="none" stroke="currentColor" stroke-width="${bentuk === 'minimal' ? 1 : 1.25}" stroke-linejoin="round"/>` +
      `<path d="M9.6 1.8v3h2.8" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>` +
      tanda(4.6, 6.2, 6.4) +
      `</svg>`
    );
  }

  if (bentuk === 'padat') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<rect x="3.4" y="1.8" width="9.2" height="12.4" rx="1" fill="currentColor" opacity="0.85"/>` +
      tanda(4.6, 6.2, 6.4) +
      `</svg>`
    );
  }

  if (bentuk === 'bulat') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M4.4 1.8h5.2a3 3 0 0 1 3 3v6.4a3 3 0 0 1-3 3H4.4a3 3 0 0 1-3-3V4.8a3 3 0 0 1 3-3Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>` +
      tanda(4.2, 5.8, 6.6) +
      `</svg>`
    );
  }

  if (bentuk === 'tajam') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M3.4 1.6H10l2.6 2.6v10.2H3.4Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter"/>` +
      `<path d="M10 1.6v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      tanda(4.6, 6, 6.4) +
      `</svg>`
    );
  }

  if (bentuk === 'duotone') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M3.4 1.8H9.4L12.6 5v9.2H3.4Z" fill="currentColor" opacity="0.3"/>` +
      `<path d="M3.4 8.4h9.2v5.8H3.4Z" fill="currentColor" opacity="0.75"/>` +
      tanda(4.6, 3.6, 6.2) +
      `</svg>`
    );
  }

  if (bentuk === 'terbuka') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<path d="M3.4 1.8H9.4L12.6 5v4H3.4Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M3.4 9h9.2v5.2H3.4Z" fill="currentColor" opacity="0.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
      tanda(4.6, 3, 6) +
      `</svg>`
    );
  }

  /* klasik */
  const r = 1.2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path d="M3.4 ${n(1.8 + r)}Q3.4 1.8 ${n(3.4 + r)} 1.8H9.4L12.6 5v${n(14.2 - r)}Q12.6 14.2 ${n(12.6 - r)} 14.2H${n(3.4 + r)}Q3.4 14.2 3.4 ${n(14.2 - r)}Z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>` +
    `<path d="M9.4 1.8v2.6h2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>` +
    tanda(4.6, 6.2, 6.4) +
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
    ket: 'Folder standar modern: badan terisi lembut, tab kiri-atas, sudut membulat kecil.',
    style: { bentuk: 'klasik' },
  },
  garis: {
    label: 'Clean Outline',
    ket: 'Hanya garis kontur, tanpa isi sama sekali — bersih dan ringan.',
    style: { bentuk: 'garis' },
  },
  padat: {
    label: 'Solid Modern',
    ket: 'Blok warna penuh tanpa tab dan tanpa kontur — tegas di ukuran kecil.',
    style: { bentuk: 'padat' },
  },
  duotone: {
    label: 'Duotone Accent',
    ket: 'Dua nada: badan atas gelap, bidang bawah terang.',
    style: { bentuk: 'duotone' },
  },
  bulat: {
    label: 'Soft Rounded',
    ket: 'Badan bulat penuh dengan tab melengkung — bukan kotak.',
    style: { bentuk: 'bulat' },
  },
  tajam: {
    label: 'Sharp Grid',
    ket: 'Kotak siku dengan tab persegi yang menonjol ke atas.',
    style: { bentuk: 'tajam' },
  },
  terbuka: {
    label: 'Expanded Dynamic',
    ket: 'Penutup folder terlipat TERLIHAT sebagai bidang tersendiri.',
    style: { bentuk: 'terbuka' },
  },
  minimal: {
    label: 'Minimal Slim',
    ket: 'Satu garis tipis dengan sudut lipat — seminimal mungkin, masih folder.',
    style: { bentuk: 'minimal' },
  },
  /* Tiga tema AKSARA: bentuknya sendiri, bukan meminjam tema geometri - kalau
     meminjam, kartunya terlihat kembar dengan tema itu (hanya aksaranya beda,
     dan pada 14px aksara pun sulit dibaca). */
  kanji: {
    label: 'Kanji',
    ket: 'Aksara Kanji Jepang: 型 TypeScript, 錆 Rust, 蛇 Python. Bentuk folder bersudut tegas.',
    style: { bentuk: 'kanji' },
    tanda: AKSARA_KANJI,
  },
  hanzi: {
    label: 'Hanzi',
    ket: 'Aksara Hanzi China Sederhana: 型 TypeScript, 锈 Rust, 蛇 Python. Folder bergaris ganda.',
    style: { bentuk: 'hanzi' },
    tanda: AKSARA_HANZI,
  },
  hiragana: {
    label: 'Hiragana',
    ket: 'Aksara Hiragana Jepang: か TypeScript, さ Rust, へ Python. Folder bersudut miring.',
    style: { bentuk: 'hiragana' },
    tanda: AKSARA_HIRAGANA,
  },
};

/* Ekstensi -> jenis tanda. Setiap bahasa punya tanda SENDIRI. */
const JENIS = {
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  go: 'go',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c',
  cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'shell',
  lua: 'lua',
  rs: 'rust', py: 'python',
  md: 'md', txt: 'teks', rst: 'teks', log: 'teks',
  json: 'json', jsonc: 'json',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml',
  xml: 'xml', html: 'html', htm: 'html',
  csv: 'csv', sql: 'sql',
  png: 'gambar', jpg: 'gambar', jpeg: 'gambar', gif: 'gambar', svg: 'gambar',
  webp: 'gambar', ico: 'gambar', bmp: 'gambar',
  css: 'css', scss: 'scss', sass: 'scss', less: 'scss',
  lock: 'kunci', pem: 'kunci', key: 'kunci',
  zip: 'arsip', tar: 'arsip', gz: 'arsip', '7z': 'arsip', rar: 'arsip',
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
