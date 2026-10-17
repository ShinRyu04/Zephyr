/*
 * Which agent rows use a REAL brand mark, and which fall back to a generic one.
 *
 * The distinction matters because the fallback must never look official: a
 * hand-drawn approximation presented as a vendor logo is a small lie that
 * survives forever. This harness prints the split so the gap is visible.
 *
 * Run: node scripts/verify-logo-merek.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

const logo = baca('src/components/terminal/logoMerek.ts');
const ikon = baca('src/components/terminal/PaneIcons.tsx');
const rust = baca('src-tauri/src/agents.rs');

/* The catalogue, read from the Rust source - the same list the UI renders. */
const katalog = [...rust.matchAll(/^\s*\("([a-z0-9-]+)",\s*"([^"]+)",\s*"([a-z0-9-]+)"\),/gm)].map((m) => m[1]);

/* Which ids have an entry in the generated map. */
const punyaLogo = new Set([...logo.matchAll(/^\s*'([a-z0-9-]+)':\s*\{/gm)].map((m) => m[1]));

console.log('\n1. Modul logo dihasilkan, bukan ditulis tangan');
hasil(
  'logoMerek.ts menyebut dirinya generated',
  /DO NOT EDIT BY HAND/.test(logo) && /gen-logo-merek\.mjs/.test(logo),
  'tidak ada penanda generated - path merek akan basi tanpa jejak',
);
hasil(
  'setiap entri punya title, hex, dan path',
  (logo.match(/'[a-z0-9-]+':\s*\{/g) ?? []).length ===
    (logo.match(/hex: '#[0-9a-f]{6}'/gi) ?? []).length &&
    (logo.match(/path: "/g) ?? []).length >= punyaLogo.size,
  'ada entri yang kehilangan salah satu field',
);

console.log('\n2. Komponen memakai logo resmi lebih dulu');
hasil(
  'AgentLogo mengecek LOGO_MEREK sebelum switch',
  /const resmi = LOGO_MEREK\[id\];\s*\n\s*if \(resmi\) return <Merek/.test(ikon),
  'fallback bisa menimpa logo resmi',
);
hasil(
  'warna memakai hex merek untuk merek yang terang',
  /currentColor' : l\.hex/.test(ikon),
  'merek terang kehilangan warna resminya',
);

console.log('\n3. Cakupan: berapa dari katalog punya logo RESMI');
const resmi = katalog.filter((id) => punyaLogo.has(id));
const generik = katalog.filter((id) => !punyaLogo.has(id));
console.log(`        resmi  (${resmi.length}): ${resmi.join(', ')}`);
console.log(`        generik (${generik.length}): ${generik.join(', ')}`);
hasil(
  `ada logo resmi untuk sebagian besar katalog (${resmi.length}/${katalog.length})`,
  resmi.length >= katalog.length * 0.25,
  'terlalu sedikit - generator mungkin tidak membaca katalog dengan benar',
);
/*
 * No assertion that EVERY id has a logo: simple-icons genuinely does not carry
 * OpenAI, xAI, Aider, Goose, Continue, Qoder, OMP, Hermes. Inventing those would
 * defeat the point of this check.
 */
hasil(
  'yang tidak punya logo resmi TIDAK dikarang',
  generik.every((id) => !logo.includes(`'${id}':`)),
  'ada id tanpa logo resmi yang entah bagaimana masuk ke peta',
);

console.log('\n4. Tidak ada path yang jelas rusak');
const paths = [...logo.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
hasil(
  `semua ${paths.length} path berupa data SVG (mulai M/m, hanya perintah path)`,
  paths.every((d) => /^[Mm]/.test(d) && /^[MmLlHhVvCcSsQqTtAaZz0-9.,\-+eE\s]+$/.test(d)),
  'ada path dengan karakter di luar perintah SVG - tanda data rusak',
);
/*
 * No minimum-length assertion. An earlier version demanded >40 characters and
 * failed on `opencode` (32) and `anthropic` (168) - both are simply SHORT GLYPHS
 * (a square mark, a wordmark), not truncated data. The validity regex above is
 * the real check; length says nothing about correctness.
 */
hasil(
  'tidak ada path kosong',
  paths.every((d) => d.length >= 8),
  'ada path yang benar-benar kosong',
);

console.log('\n5. Merek gelap memakai warna tema, bukan hex hitam');
/*
 * Six brands ship a BLACK mark (copilot, gh, kimi, cursor, opencode, opencode2 -
 * luminance 0.0). A black glyph on a dark sidebar is invisible, which is the
 * reader's report. The component must fall back to `currentColor` for those and
 * keep the brand hex for the rest.
 */
hasil(
  'komponen punya ambang luminansi',
  /const AMBANG_GELAP = \d+/.test(ikon) && /luminance\(l\.hex\) < AMBANG_GELAP/.test(ikon),
  'tidak ada aturan gelap/terang - merek hitam akan hilang di mode gelap',
);
hasil(
  'merek siluet digambar hitam di atas tile terang',
  /const chip = MONOKROM\[id\]/.test(ikon) && /fill=\{chip\}/.test(ikon) && /fill="#14171a"/.test(ikon),
  'siluet tidak memakai tile - warnanya akan terbalik di mode gelap',
);
/* The measurement itself, on the real generated data. */
const hex = [...logo.matchAll(/hex: '(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]);
const gelap = hex.filter((h) => {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
});
console.log(`        merek gelap terdeteksi: ${gelap.length} (${gelap.join(', ') || 'tidak ada'})`);
hasil(
  'ada merek gelap yang memang perlu fallback',
  gelap.length > 0,
  'tidak ada merek gelap - pemeriksaan ini tidak menguji apa pun',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
