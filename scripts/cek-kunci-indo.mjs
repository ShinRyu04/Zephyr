// cek-kunci-indo.mjs — berapa teks Indonesia yang sudah punya kunci terjemahan?
//
// Membandingkan daftar prosa Indonesia yang dipindai komponen dengan kunci
// yang sudah ada di i18n-extra.ts. Yang SUDAH ada kuncinya berarti tinggal
// dibungkus tr() di komponen; yang BELUM butuh kunci baru.

import fs from 'node:fs';
import path from 'node:path';

const TMP = process.env.LOCALAPPDATA ?? '.';
const bersih = JSON.parse(fs.readFileSync(path.join(TMP, 'Temp', 'indo-bersih.json'), 'utf8'));
const extra = fs.readFileSync('src/lib/i18n-extra.ts', 'utf8');

// Kumpulkan kunci dari semua kamus.
const kunci = new Set();
const re = /^\s*'((?:[^'\\]|\\.)+)':/gm;
let m;
while ((m = re.exec(extra))) kunci.add(m[1].replace(/\\'/g, "'"));

const sudah = bersih.filter((t) => kunci.has(t));
const belum = bersih.filter((t) => !kunci.has(t));

console.log(`  total prosa     : ${bersih.length}`);
console.log(`  SUDAH ada kunci : ${sudah.length}`);
console.log(`  BELUM ada kunci : ${belum.length}\n`);

console.log('  contoh yang SUDAH ada kunci (komponen belum panggil tr()):');
for (const t of sudah.slice(0, 10)) console.log(`    ${t.slice(0, 90)}`);
console.log('\n  contoh yang BELUM ada kunci:');
for (const t of belum.slice(0, 10)) console.log(`    ${t.slice(0, 90)}`);

fs.writeFileSync(path.join(TMP, 'Temp', 'indo-belum.json'), JSON.stringify(belum, null, 1));
fs.writeFileSync(path.join(TMP, 'Temp', 'indo-sudah.json'), JSON.stringify(sudah, null, 1));
console.log(`\n  -> indo-belum.json (${belum.length}) · indo-sudah.json (${sudah.length})`);
