/*
 * Prove the rendered logo IS the official brand path, not a hand-drawn one.
 *
 * Comparing "it looks right" needs eyes; comparing the `d` attribute against the
 * source table needs none. If the string in the DOM is byte-identical to
 * `BRAND_MARKS[family].d`, then whatever the screenshot looks like, the shape is
 * the official one from simple-icons — that is the claim worth verifying.
 */
import fs from 'node:fs';
import { panelCdp } from './panel-cdp.mjs';

/* The official paths, read straight out of the generated table. */
const brand = fs.readFileSync('src/lib/modelBrandIcons.ts', 'utf8');
const resmi = {};
for (const m of brand.matchAll(/^ {2}([a-zA-Z0-9_-]+): \{\r?\n {4}d: '([^']+)'/gm)) {
  resmi[m[1]] = m[2];
}
console.log('brand asli di tabel:', Object.keys(resmi).length);

const c = await panelCdp(9223, '#panel=models');

/* Open both groups so every row is in the DOM. */
await c.eval(`(()=>{for(const id of ['aim-grup-builtin','aim-grup-custom']){const b=document.querySelector('[data-testid="'+id+'"]');if(b&&b.getAttribute('aria-expanded')==='false')b.click();}return 1})()`);
await new Promise((r) => setTimeout(r, 800));

const rows = JSON.parse(
  await c.eval(`JSON.stringify([...document.querySelectorAll('[data-testid="aim-table-row"]')].map(r=>{
    const p=r.querySelector('.aim-logo svg path');
    return {model:r.getAttribute('data-model'), d:p?p.getAttribute('d'):null, fill:p?p.getAttribute('fill'):null};
  }))`),
);

/* Which family each rendered row claims, by matching its `d` against the table. */
const keluargaDariD = new Map(Object.entries(resmi).map(([k, v]) => [v, k]));

let resmiCount = 0;
let inisialCount = 0;
let asingCount = 0;
const asing = [];

for (const r of rows) {
  if (!r.d) {
    inisialCount++; // initials / dot: no brand for this model, by design
    continue;
  }
  const fam = keluargaDariD.get(r.d);
  if (fam) resmiCount++;
  else {
    asingCount++;
    asing.push(r.model);
  }
}

console.log('baris:', rows.length);
console.log('  logo RESMI (cocok byte-per-byte dengan tabel):', resmiCount);
console.log('  inisial/titik (model tanpa merek):', inisialCount);
console.log('  TIDAK DIKENAL (path karangan):', asingCount, asing.slice(0, 6));
console.log(asingCount === 0 ? 'LULUS  tidak ada satu pun logo karangan' : 'GAGAL  ada logo karangan');
c.close();
process.exit(asingCount === 0 ? 0 : 1);
