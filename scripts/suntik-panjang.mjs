// suntik-panjang.mjs — masukkan kalimat panjang (Security/MCP/Extensions) ke kamus.
//
// Pakai:  node scripts/suntik-panjang.mjs

import fs from 'node:fs';
import { TERJEMAHAN_PANJANG } from './terjemahan-panjang.mjs';

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

  const ada = new Set();
  for (let i = mulai + 1; i < akhir; i++) {
    const m = /^\s{2}'((?:[^'\\]|\\.)*)':/.exec(baris[i]);
    if (m) ada.add(m[1].replace(/\\'/g, "'"));
  }

  const baru = [];
  for (const [indo, t] of Object.entries(TERJEMAHAN_PANJANG)) {
    if (ada.has(indo)) continue;
    const teks = t[lang];
    if (!teks) continue;
    const k = indo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const v = teks.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    baru.push(`  '${k}': '${v}',`);
  }
  if (baru.length > 0) {
    baris.splice(akhir, 0, ...baru);
    disisipkan += baru.length;
  }
}

fs.writeFileSync(FILE, baris.join(nl), 'utf8');
console.log(`  i18n-extra.ts: +${disisipkan} entri kalimat panjang`);
