import { readFileSync } from 'node:fs';
const isi = readFileSync('src/lib/systemPrompt.ts', 'utf8');
const tanpaImport = isi.replace(/^\s*import[\s\S]*?from\s*'[^']*';/gm, '');
const nama = new Set();
for (const m of tanpaImport.matchAll(/`([a-z][a-z0-9_]{2,40})`/g)) {
  const t = m[1];
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(t)) nama.add(t);
}
console.log([...nama].sort().join('\n'));
console.log('TOTAL=' + nama.size);
