// tmp-i18n-audit.cjs — how many keys are missing in which of the 10 languages.
const fs = require('fs');
const s = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const langs = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const blocks = {};
const re = /const (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{([\s\S]*?)\n\};/g;
let m;
while ((m = re.exec(s))) blocks[m[1]] = m[2];
console.log('blok ditemukan:', Object.keys(blocks).join(','));
const keys = {};
for (const l of langs) {
  const b = blocks[l] || '';
  keys[l] = new Set([...b.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((x) => x[1]));
  console.log(l, 'keys:', keys[l].size);
}
const all = new Set();
for (const l of langs) for (const k of keys[l]) all.add(k);
const missing = {};
for (const k of all) {
  const miss = langs.filter((l) => !keys[l].has(k));
  if (miss.length) missing[k] = miss;
}
console.log('---');
console.log('total key unik:', all.size);
console.log('key lengkap di 10 bahasa:', all.size - Object.keys(missing).length);
console.log('key kurang di >=1 bahasa:', Object.keys(missing).length);
const byCount = {};
for (const v of Object.values(missing)) byCount[v.length] = (byCount[v.length] || 0) + 1;
console.log('sebaran (kurang di N bahasa -> jumlah key):', JSON.stringify(byCount));
const contoh = Object.entries(missing).slice(0, 12).map(([k, v]) => `${k} [${v.length}]`);
console.log('contoh:', contoh.join(', '));
