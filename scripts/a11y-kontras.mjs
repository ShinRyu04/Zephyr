// a11y-kontras.mjs — hitung rasio kontras WCAG untuk SEMUA tema (fase 31).
//
// Dipakai dua kali:
//   1. saat audit, untuk tahu token mana yang gagal AA;
//   2. di dalam verify31 V4, sebagai bukti angka — bukan klaim "sudah AA".
//
// Rumus dari WCAG 2.1 (relative luminance + contrast ratio). Ditulis sendiri
// karena hanya butuh ~30 baris dan tidak layak menambah dependensi.
//
// Pakai: node scripts/a11y-kontras.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';

const AKAR = path.resolve(import.meta.dirname, '..');
const PASANGAN_TEMA = [
  'src/styles/theme.css',
  'src/styles/theme-light.css',
  'src/styles/themes-extra.css',
  'src/styles/tokens.css',
  // fase 31: tema high-contrast + override ANSI-nya.
  'src/styles/a11y.css',
];

// ───────────────────────── warna ─────────────────────────

/** #rgb / #rrggbb / rgb(a) / color-mix sederhana → [r,g,b] 0..255, atau null. */
export function keRgb(nilai, resolusi = new Map(), kedalaman = 0) {
  if (!nilai || kedalaman > 8) return null;
  const s = String(nilai).trim();

  // var(--x) atau var(--x, fallback)
  const mv = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(s);
  if (mv) {
    const target = resolusi.get(mv[1]);
    if (target !== undefined) return keRgb(target, resolusi, kedalaman + 1);
    return mv[2] ? keRgb(mv[2], resolusi, kedalaman + 1) : null;
  }

  // #rgb / #rrggbb
  const mh = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (mh) {
    const h = mh[1];
    if (h.length === 3) {
      return [h[0] + h[0], h[1] + h[1], h[2] + h[2]].map((x) => parseInt(x, 16));
    }
    return [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((x) => parseInt(x, 16));
  }

  // rgb() / rgba() — alpha DIABAIKAN di sini; pemanggil harus mengomposit
  // dulu lewat komposit() kalau warnanya transparan (lihat catatan di bawah).
  const mr = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (mr) {
    const bagian = mr[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (bagian.length >= 3 && bagian.slice(0, 3).every((n) => Number.isFinite(n))) {
      return bagian.slice(0, 3);
    }
    return null;
  }

  // color-mix(in srgb, A p%, B) — dihitung linear di sRGB.
  const mm = /^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+)\)$/i.exec(s);
  if (mm) {
    const potong = pisahKoma(mm[1]);
    if (potong.length === 2) {
      const [a, b] = potong;
      const ma = /^([\s\S]+?)\s+([\d.]+)%$/.exec(a.trim());
      const warnaA = keRgb(ma ? ma[1] : a, resolusi, kedalaman + 1);
      const warnaB = keRgb(b, resolusi, kedalaman + 1);
      if (!warnaA || !warnaB) return null;
      const p = ma ? Number(ma[2]) / 100 : 0.5;
      return [0, 1, 2].map((i) => Math.round(warnaA[i] * p + warnaB[i] * (1 - p)));
    }
    return null;
  }

  const nama = { white: [255, 255, 255], black: [0, 0, 0], transparent: null };
  if (s.toLowerCase() in nama) return nama[s.toLowerCase()];
  return null;
}

/** Pisah daftar argumen CSS di koma tingkat atas (hormati kurung). */
function pisahKoma(s) {
  const out = [];
  let dalam = 0;
  let buf = '';
  for (const c of s) {
    if (c === '(') dalam++;
    if (c === ')') dalam--;
    if (c === ',' && dalam === 0) {
      out.push(buf);
      buf = '';
    } else buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** Komposit warna ber-alpha di atas latar (perlu untuk rgba(...)). */
export function komposit(depan, alpha, belakang) {
  return [0, 1, 2].map((i) => Math.round(depan[i] * alpha + belakang[i] * (1 - alpha)));
}

/** Alpha dari string rgba(), atau 1. */
function ambilAlpha(nilai) {
  const m = /^rgba?\(([^)]+)\)$/i.exec(String(nilai).trim());
  if (!m) return 1;
  const bagian = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return bagian.length >= 4 && Number.isFinite(bagian[3]) ? bagian[3] : 1;
}

/** Luminansi relatif WCAG. */
export function luminansi([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rasio kontras WCAG (1..21). */
export function rasio(a, b) {
  const la = luminansi(a);
  const lb = luminansi(b);
  const t = Math.max(la, lb);
  const r = Math.min(la, lb);
  return (t + 0.05) / (r + 0.05);
}

// ───────────────────────── parse CSS ─────────────────────────

/**
 * Baca semua blok tema jadi Map<tema, Map<--token, nilai>>.
 *
 * `:root` diperlakukan sebagai basis SEMUA tema: tema lain hanya menimpa
 * sebagian token, jadi tanpa basis ini token yang tidak ditimpa hilang dan
 * hasil auditnya bohong (kelihatan "tidak ada masalah" karena tidak terbaca).
 */
export function bacaTema() {
  const basis = new Map();
  const perTema = new Map();

  for (const rel of PASANGAN_TEMA) {
    const teks = fs.readFileSync(path.join(AKAR, rel), 'utf8');
    // Buang komentar supaya token di dalam komentar tidak ikut terbaca.
    const bersih = teks.replace(/\/\*[\s\S]*?\*\//g, '');

    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(bersih))) {
      const selektor = m[1].trim();
      const isi = m[2];
      const token = new Map();
      const rt = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let t;
      while ((t = rt.exec(isi))) token.set(t[1], t[2].trim());
      if (token.size === 0) continue;

      const namaTema = [...selektor.matchAll(/\[data-theme='([^']+)'\]/g)].map((x) => x[1]);
      const adaRoot = /(^|,)\s*:root\s*($|,)/.test(selektor);

      if (adaRoot) for (const [k, v] of token) basis.set(k, v);
      for (const nama of namaTema) {
        if (!perTema.has(nama)) perTema.set(nama, new Map());
        for (const [k, v] of token) perTema.get(nama).set(k, v);
      }
    }
  }

  // Gabung: basis dulu, lalu override tema.
  const hasil = new Map();
  for (const [nama, token] of perTema) {
    const gab = new Map(basis);
    for (const [k, v] of token) gab.set(k, v);
    hasil.set(nama, gab);
  }
  return hasil;
}

// ───────────────────────── pasangan yang diuji ─────────────────────────

/**
 * Pasangan (teks, latar) yang benar-benar muncul di UI.
 *
 * `besar: true` = teks >= 18.66px bold atau 24px, ambang AA-nya 3.0 bukan 4.5.
 * `ui: true` = komponen non-teks (border, ikon), ambang AA-nya 3.0 (WCAG 1.4.11).
 */
export const PASANGAN = [
  { nama: 'teks utama / bg editor', fg: '--text', bg: '--editor-bg' },
  { nama: 'teks utama / bg', fg: '--text', bg: '--bg' },
  { nama: 'teks utama / surface', fg: '--text', bg: '--surface' },
  { nama: 'teks utama / surface-2', fg: '--text', bg: '--surface-2' },
  { nama: 'teks utama / surface-3', fg: '--text', bg: '--surface-3' },
  { nama: 'teks sekunder / surface', fg: '--text-secondary', bg: '--surface' },
  { nama: 'teks muted / surface', fg: '--text-muted', bg: '--surface' },
  { nama: 'teks muted / bg', fg: '--text-muted', bg: '--bg' },
  { nama: 'teks inverse / accent', fg: '--text-inverse', bg: '--accent' },
  // fase 31: `--text-inverse` juga dipakai di atas --danger (.btn-danger:hover,
  // .pts-badge.is-error). Pasangan ini yang menangkap one-dark 4.38:1.
  { nama: 'teks inverse / danger', fg: '--text-inverse', bg: '--danger' },
  { nama: 'accent / bg', fg: '--accent', bg: '--bg', ui: true },
  { nama: 'accent / surface', fg: '--accent', bg: '--surface', ui: true },
  { nama: 'danger / surface', fg: '--danger', bg: '--surface' },
  { nama: 'warning / surface', fg: '--warning', bg: '--surface' },
  { nama: 'success / surface', fg: '--success', bg: '--surface' },
  { nama: 'border-strong / surface', fg: '--border-strong', bg: '--surface', ui: true },
  { nama: 'gutter editor / bg editor', fg: '--editor-gutter', bg: '--editor-bg' },
  { nama: 'syntax keyword', fg: '--syn-keyword', bg: '--editor-bg' },
  { nama: 'syntax string', fg: '--syn-string', bg: '--editor-bg' },
  { nama: 'syntax number', fg: '--syn-number', bg: '--editor-bg' },
  { nama: 'syntax comment', fg: '--syn-comment', bg: '--editor-bg' },
  { nama: 'syntax function', fg: '--syn-function', bg: '--editor-bg' },
  { nama: 'syntax variable', fg: '--syn-variable', bg: '--editor-bg' },
  { nama: 'syntax type', fg: '--syn-type', bg: '--editor-bg' },
];

/** Hitung semua pasangan untuk satu tema. */
export function auditTema(token) {
  const out = [];
  for (const p of PASANGAN) {
    const rawBg = token.get(p.bg);
    const rawFg = token.get(p.fg);
    let bg = keRgb(rawBg, token);
    let fg = keRgb(rawFg, token);
    if (!bg || !fg) {
      out.push({ ...p, nilai: null, alasan: `token tak terbaca (fg=${rawFg} bg=${rawBg})` });
      continue;
    }
    // Warna ber-alpha dikomposit dulu di atas latarnya, kalau tidak
    // rasionya dihitung dari warna yang tidak pernah terlihat user.
    const aFg = ambilAlpha(rawFg);
    if (aFg < 1) fg = komposit(fg, aFg, bg);

    const r = rasio(fg, bg);
    const ambang = p.ui || p.besar ? 3.0 : 4.5;
    out.push({ ...p, nilai: r, ambang, lolos: r >= ambang });
  }
  return out;
}

// ───────────────────────── main ─────────────────────────

const jsonMode = process.argv.includes('--json');

// Guard "dijalankan langsung": process.argv[1] TIDAK ADA saat modul di-import
// dari `node --input-type=module -e`, jadi harus dicek dulu — kalau tidak,
// meng-import modul ini untuk memakai bacaTema()/auditTema() akan crash.
const dijalankanLangsung =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (dijalankanLangsung) {
  const tema = bacaTema();
  const ringkas = {};

  for (const [nama, token] of tema) {
    const hasil = auditTema(token);
    const gagal = hasil.filter((h) => h.nilai !== null && !h.lolos);
    const takTerbaca = hasil.filter((h) => h.nilai === null);
    ringkas[nama] = {
      total: hasil.length,
      gagal: gagal.length,
      takTerbaca: takTerbaca.length,
      terendah: hasil
        .filter((h) => h.nilai !== null)
        .sort((a, b) => a.nilai - b.nilai)
        .slice(0, 6)
        .map((h) => ({ nama: h.nama, rasio: +h.nilai.toFixed(2), ambang: h.ambang })),
      daftarGagal: gagal.map((h) => ({
        nama: h.nama,
        rasio: +h.nilai.toFixed(2),
        ambang: h.ambang,
      })),
    };

    if (!jsonMode) {
      console.log(`\n═══ ${nama} ═══`);
      for (const h of hasil) {
        if (h.nilai === null) {
          console.log(`  ??    ${h.nama.padEnd(30)} ${h.alasan}`);
          continue;
        }
        const tanda = h.lolos ? 'OK  ' : 'GAGAL';
        console.log(
          `  ${tanda} ${h.nama.padEnd(30)} ${h.nilai.toFixed(2)}:1 (min ${h.ambang})`,
        );
      }
      console.log(`  -> ${gagal.length} gagal, ${takTerbaca.length} tak terbaca`);
    }
  }

  if (jsonMode) console.log(JSON.stringify(ringkas, null, 2));
  else {
    console.log('\n═══ RINGKASAN ═══');
    for (const [nama, r] of Object.entries(ringkas)) {
      console.log(`  ${nama.padEnd(16)} gagal=${r.gagal} takTerbaca=${r.takTerbaca}`);
    }
  }
}
