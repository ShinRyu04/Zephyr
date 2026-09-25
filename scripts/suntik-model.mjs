// suntik-model.mjs — masukkan terjemahan catatan model ke src/lib/i18n-extra.ts.
//
// Pakai:  node scripts/suntik-model.mjs
//
// Catatan model tampil di dropdown pemilih model (panel AI dan Settings →
// Model AI). Teksnya hidup di src/lib/modelCatalog.tsx sebagai data, jadi
// terjemahannya masuk ke kamus dan pemanggilnya memakai tr() saat render.

import fs from 'node:fs';
import { TERJEMAHAN_MODEL } from './terjemahan-model.mjs';

const FILE = 'src/lib/i18n-extra.ts';
const LANGS = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'pt', 'ar'];
const NAMA = { en: 'EN', ja: 'JA', ko: 'KO', zh: 'ZH', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT', ar: 'AR' };

let isi = fs.readFileSync(FILE, 'utf8');
const crlf = isi.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
const baris = isi.split(/\r?\n/);

let disisipkan = 0;

for (const lang of LANGS) {
  const namaVar = NAMA[lang];
  const mulai = baris.findIndex((l) => l.trim() === `const ${namaVar}: Dict = {`);
  if (mulai < 0) continue;
  let akhir = -1;
  for (let i = mulai + 1; i < baris.length; i++) {
    if (baris[i].trim() === '};') {
      akhir = i;
      break;
    }
  }
  if (akhir < 0) continue;

  const adaDiBlok = new Set();
  for (let i = mulai + 1; i < akhir; i++) {
    const m = /^\s{2}'((?:[^'\\]|\\.)*)':/.exec(baris[i]);
    if (m) adaDiBlok.add(m[1].replace(/\\'/g, "'"));
  }

  const barisBaru = [];
  for (const [indo, terjemahan] of Object.entries(TERJEMAHAN_MODEL)) {
    if (adaDiBlok.has(indo)) continue;
    const teks = terjemahan[lang];
    if (!teks) continue;
    const kunci = indo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const nilai = teks.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    barisBaru.push(`  '${kunci}': '${nilai}',`);
  }

  if (barisBaru.length > 0) {
    baris.splice(akhir, 0, ...barisBaru);
    disisipkan += barisBaru.length;
  }
}

fs.writeFileSync(FILE, baris.join(nl), 'utf8');
console.log(`  i18n-extra.ts: +${disisipkan} entri catatan model`);
