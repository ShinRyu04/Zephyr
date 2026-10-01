// suntik-hint.mjs — masukkan terjemahan hint/label ke src/lib/i18n-extra.ts
// lalu bungkus nilai atribut mentah di komponen dengan tr().
//
// Pakai:  node scripts/suntik-hint.mjs [--periksa]
//
// Sumber terjemahan: scripts/terjemahan-hint.mjs (10 bahasa per teks).

import fs from 'node:fs';
import path from 'node:path';
import { TERJEMAHAN_HINT } from './terjemahan-hint.mjs';

const PERIKSA = process.argv.includes('--periksa');
const LANGS = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];
const NAMA = { id: 'ID', en: 'EN', ja: 'JA', ko: 'KO', zh: 'ZH', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT', ar: 'AR' };

const FILE = 'src/lib/i18n-extra.ts';
let isi = fs.readFileSync(FILE, 'utf8');

// Deteksi EOL
const crlf = isi.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
const baris = isi.split(/\r?\n/);

// ── 1. Sisipkan kunci baru ke tiap dict bahasa ──
let disisipkan = 0;
let dilewati = 0;

for (const lang of LANGS) {
  const namaVar = NAMA[lang];
  // Cari blok "const XX: Dict = {" ... "\n};"
  const mulai = baris.findIndex((l) => l.trim() === `const ${namaVar}: Dict = {`);
  if (mulai < 0) {
    console.log(`  ! blok ${namaVar} tidak ditemukan`);
    continue;
  }
  let akhir = -1;
  for (let i = mulai + 1; i < baris.length; i++) {
    if (baris[i].trim() === '};') {
      akhir = i;
      break;
    }
  }
  if (akhir < 0) {
    console.log(`  ! akhir blok ${namaVar} tidak ditemukan`);
    continue;
  }

  // Kunci yang sudah ada di blok ini
  const adaDiBlok = new Set();
  for (let i = mulai + 1; i < akhir; i++) {
    const m = /^\s{2}'((?:[^'\\]|\\.)*)':/.exec(baris[i]);
    if (m) adaDiBlok.add(m[1].replace(/\\'/g, "'"));
  }

  const barisBaru = [];
  for (const [indo, terjemahan] of Object.entries(TERJEMAHAN_HINT)) {
    if (adaDiBlok.has(indo)) {
      dilewati++;
      continue;
    }
    const teks = lang === 'id' ? indo : terjemahan[lang];
    if (!teks) continue;
    // Escape kutip tunggal + backslash
    const kunci = indo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const nilai = teks.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    barisBaru.push(`  '${kunci}': '${nilai}',`);
  }

  if (barisBaru.length > 0) {
    baris.splice(akhir, 0, ...barisBaru);
    disisipkan += barisBaru.length;
  }
}

if (!PERIKSA) {
  fs.writeFileSync(FILE, baris.join(nl), 'utf8');
  console.log(`  i18n-extra.ts: +${disisipkan} entri (${dilewati} sudah ada)`);
} else {
  console.log(`  [periksa] akan menambah ${disisipkan} entri`);
}

// ── 2. Bungkus atribut mentah dengan tr() di komponen ──
const KOMPONEN = [
  'src/components/settings/SectionsBasic.tsx',
  'src/components/settings/SectionsAdvanced.tsx',
  'src/components/settings/SectionsMisc.tsx',
  'src/components/settings/SectionsExtensions.tsx',
  'src/components/settings/SectionsLsp.tsx',
  'src/components/settings/AccessibilitySection.tsx',
  'src/components/settings/McpPanel.tsx',
  'src/components/settings/SecuritySection.tsx',
  'src/components/settings/SettingsControls.tsx',
  'src/components/settings/PromptSection.tsx',
  'src/components/settings/UpdatePanel.tsx',
  'src/components/settings/SectionsDiag.tsx',
];

const ATTR = ['hint', 'label', 'title', 'placeholder', 'aria-label', 'desc', 'note'];
let totalBungkus = 0;
const laporan = [];

for (const f of KOMPONEN) {
  if (!fs.existsSync(f)) continue;
  let c = fs.readFileSync(f, 'utf8');
  let n = 0;

  for (const a of ATTR) {
    // attr="teks" -> attr={tr('teks')}   (hanya kalau teksnya ada di tabel)
    const re = new RegExp(`(\\s${a.replace('-', '\\-')}=)"([^"]+)"`, 'g');
    c = c.replace(re, (m, pre, teks) => {
      if (!(teks in TERJEMAHAN_HINT)) return m;
      // Escape kutip tunggal di teks
      const t = teks.replace(/'/g, "\\'");
      n++;
      return `${pre}{tr('${t}')}`;
    });
  }

  if (n > 0) {
    // Mode periksa tidak menyentuh berkas komponen sama sekali.
    if (!PERIKSA) fs.writeFileSync(f, c, 'utf8');
    totalBungkus += n;
    laporan.push(`  ${f}: ${n} atribut`);
  }
}

console.log(`  atribut dibungkus tr(): ${totalBungkus}`);
for (const l of laporan) console.log(l);
