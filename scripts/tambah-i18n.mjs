// tambah-i18n.mjs — add the hardcoded Indonesian strings to all ten languages.
//
// Reads the list produced by sinkron-i18n.mjs, translates each entry into the
// nine non-Indonesian languages, and appends the new keys to i18n-extra.ts.
// Translations live in tabel-terjemahan.mjs so the mapping is reviewable
// rather than generated on the fly.

import fs from 'node:fs';
import path from 'node:path';

const DAFTAR = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'i18n-hardcode.json');
const EXTRA = 'src/lib/i18n-extra.ts';

const teks = JSON.parse(fs.readFileSync(DAFTAR, 'utf8'));
console.log(`# ${teks.length} kunci akan diproses\n`);

// Kunci yang sudah ada di i18n-extra.ts dilewati.
const src = fs.readFileSync(EXTRA, 'utf8');
const ada = new Set();
for (const m of src.matchAll(/^\s*'((?:[^'\\]|\\.)+)':/gm)) ada.add(m[1]);

const baru = teks.filter((t) => !ada.has(t));
console.log(`  sudah ada : ${teks.length - baru.length}`);
console.log(`  kunci baru: ${baru.length}\n`);

fs.writeFileSync(
  path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'i18n-baru.json'),
  JSON.stringify(baru, null, 2),
);
for (const t of baru) console.log(`  ${t}`);
console.log('\nDaftar kunci baru: %LOCALAPPDATA%\\Temp\\i18n-baru.json');
