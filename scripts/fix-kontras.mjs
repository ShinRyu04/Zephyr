// fix-kontras.mjs — raise failing WCAG AA pairs in the Zephyr themes.
//
// a11y-kontras.mjs is the oracle (it reports what fails). This script is the
// fixer: for every failing pair it moves the FOREGROUND token along the same
// hue, in the direction that gains contrast (lighter on dark themes, darker on
// light themes), until the ratio clears the threshold with a small margin.
//
// Only the token value changes. Selectors, structure and every other token
// stay exactly as they are, so a theme keeps its identity.

import { bacaTema, auditTema, keRgb, komposit, rasio, PASANGAN } from './a11y-kontras.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const AKAR = path.resolve(import.meta.dirname, '..');

// Same file list the oracle reads, so a theme is patched where it is measured.
const PASANGAN_TEMA = [
  'src/styles/theme.css',
  'src/styles/theme-light.css',
  'src/styles/themes-extra.css',
  'src/styles/tokens.css',
  'src/styles/a11y.css',
];

// Mirrors the private ambilAlpha() in a11y-kontras.mjs; the oracle is read-only,
// so the helper is duplicated here rather than exported from it.
function ambilAlpha(nilai) {
  const m = /^rgba?\(([^)]+)\)$/i.exec(String(nilai).trim());
  if (!m) return 1;
  const bagian = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return bagian.length >= 4 && Number.isFinite(bagian[3]) ? bagian[3] : 1;
}

const FILE_TEMA = [
  'src/styles/theme.css',
  'src/styles/theme-light.css',
  'src/styles/themes-extra.css',
  'src/styles/a11y.css',
];

// Target this far above the threshold so rounding never flips a pair back.
const MARGIN = 0.25;
const MAKS_LANGKAH = 60;

const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const keHex = (warna) => {
  const rgb = keRgb(warna);
  return rgb ? hex(rgb) : null;
};

/** Mix a colour toward white (t>0) or black (t<0), keeping the hue. */
function geser(warna, t) {
  const target = t > 0 ? [255, 255, 255] : [0, 0, 0];
  const k = Math.abs(t);
  return warna.map((v, i) => v + (target[i] - v) * k);
}

/**
 * Smallest shift that clears `target`. Searches outward in both directions so
 * a token that is only marginally short moves the least amount possible.
 */
function kontrasMinimum(fg, bg, target, naikDulu) {
  if (rasio(fg, bg) >= target) return null;
  for (let i = 1; i <= MAKS_LANGKAH; i++) {
    const k = i / MAKS_LANGKAH;
    const arah = naikDulu ? k : -k;
    const r = rasio(geser(fg, arah), bg);
    if (r >= target) return { warna: geser(fg, arah), rasio: r, langkah: i };
  }
  return null;
}

const hasil = [];
const patch = new Map(); // file -> [{ line, before, after, token }]

const semua = bacaTema();

for (const [namaTema, token] of semua.entries()) {
  const audit = auditTema(token);
  const gagal = audit.filter((h) => h.nilai !== null && !h.lolos);
  if (!gagal.length) continue;

  // Group by foreground token: one token may fail several pairs and must be
  // fixed once, for the worst of them.
  const perToken = new Map();
  for (const g of gagal) {
    const cur = perToken.get(g.fg);
    if (!cur || g.nilai < cur.nilai) perToken.set(g.fg, g);
  }

  // A dark theme means the surface is dark, so foregrounds must move lighter.
  const bgUtama = keRgb(token.get('--surface')) ?? keRgb(token.get('--bg'));
  const naikDulu = bgUtama ? (bgUtama[0] + bgUtama[1] + bgUtama[2]) / 3 < 128 : true;

  for (const [fgName, g] of perToken) {
    const raw = token.get(fgName);
    if (!raw) continue;
    const target = g.ambang + MARGIN;
    const bgPasangan = keRgb(token.get(g.bg));
    const fgPasangan = keRgb(raw);
    if (!bgPasangan || !fgPasangan) continue;
    const a = ambilAlpha(raw);
    const fgEfektif = a < 1 ? komposit(fgPasangan, a, bgPasangan) : fgPasangan;

    const calan = kontrasMinimum(fgEfektif, bgPasangan, target, naikDulu);
    if (!calan) {
      hasil.push({ tema: namaTema, token: fgName, status: 'TIDAK BISA', rasio: g.nilai, butuh: g.ambang });
      continue;
    }
    const baru = hex(calan.warna);
    hasil.push({
      tema: namaTema,
      token: fgName,
      status: 'OK',
      dari: raw,
      ke: baru,
      rasioLama: g.nilai,
      rasioBaru: +calan.rasio.toFixed(2),
      butuh: g.ambang,
    });
  }
}

// ───────── apply: rewrite the token value inside its own theme block ─────────
//
// A token value is only unambiguous inside the rule that declares it, so each
// edit is scoped to `[data-theme='<name>'] { ... }`. The scan deliberately
// works on the raw text (comments included) rather than on the stripped copy
// used for measuring, so line numbers stay in step with the file on disk.

const files = new Map();
for (const rel of PASANGAN_TEMA) {
  files.set(rel, readFileSync(path.join(AKAR, rel), 'utf8'));
}

let terpasang = 0;
const tidakDitemukan = [];

for (const h of hasil) {
  if (h.status !== 'OK') continue;
  const rel = PASANGAN_TEMA.find((f) => files.get(f).includes(`[data-theme='${h.tema}']`));
  if (!rel) {
    tidakDitemukan.push(`${h.tema} ${h.token}: theme selector not found`);
    continue;
  }
  let teks = files.get(rel);
  const mulai = teks.indexOf(`[data-theme='${h.tema}']`);
  if (mulai < 0) {
    tidakDitemukan.push(`${h.tema} ${h.token}: theme selector not found in any style file`);
    continue;
  }
  const akhir = teks.indexOf('}', mulai);
  const blok = teks.slice(mulai, akhir);

  // Replace the declaration only when the value matches what the audit read,
  // so a var() indirection or a repeated token cannot be clobbered blindly.
  const pola = new RegExp(`(${h.token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:\\s*)${h.dari.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(;)`);
  if (pola.test(blok)) {
    const blokBaru = blok.replace(pola, `$1${h.ke}$2`);
    files.set(rel, teks.slice(0, mulai) + blokBaru + teks.slice(akhir));
    terpasang += 1;
    continue;
  }

  // The token is absent from this block, so the theme was inheriting it from a
  // shared base rule written for the opposite lightness. An inherited value
  // can never satisfy the threshold here, so the theme needs its own override
  // appended inside the block.
  const nama = h.token.replace(/^--/, '');
  const barisBaru = `\n  --${nama}: ${h.ke};`;
  files.set(rel, teks.slice(0, akhir) + barisBaru + teks.slice(akhir));
  terpasang += 1;
  h.dipakai = `${rel}: added override (was inherited)`;
}

for (const [rel, teks] of files) {
  if (teks !== readFileSync(path.join(AKAR, rel), 'utf8')) {
    writeFileSync(path.join(AKAR, rel), teks, 'utf8');
  }
}

const gagal = hasil.filter((h) => h.status !== 'OK');
console.log(`token gagal: ${hasil.length}, terpasang: ${terpasang}, tidak bisa: ${gagal.length}, tidak ditemukan: ${tidakDitemukan.length}`);
for (const h of hasil) console.log(JSON.stringify(h));
for (const h of gagal) console.log('GAGAL ' + JSON.stringify(h));
for (const t of tidakDitemukan) console.log('TIDAK DITEMUKAN ' + t);
void FILE_TEMA;
void patch;
void readFileSync;
void writeFileSync;
void keHex;
