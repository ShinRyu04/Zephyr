
import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
copyFileSync('src/lib/zephyrIndeks.ts', 'scratch/indeks.bak.ts');
const sebelum = md5('src/lib/zephyrIndeks.ts');
// 1) check langsung
try {
  const out = execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs', '--check'], { encoding: 'utf8' });
  console.log('CHECK-1 ok:', out.trim().slice(0, 120));
} catch (e) {
  console.log('CHECK-1 GAGAL:', String(e.stderr || e.message).trim().split('\n')[0]);
}
// 2) generate ulang, bandingkan isi
execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs'], { encoding: 'utf8' });
const sesudah = md5('src/lib/zephyrIndeks.ts');
console.log('gen stabil:', sebelum === sesudah, sebelum.slice(0, 8), sesudah.slice(0, 8));
// 3) check lagi
try {
  const out = execFileSync(process.execPath, ['scripts/gen-fakta-zephyr.mjs', '--check'], { encoding: 'utf8' });
  console.log('CHECK-2 ok:', out.trim().slice(0, 120));
} catch (e) {
  console.log('CHECK-2 GAGAL:', String(e.stderr || e.message).trim().split('\n')[0]);
}
const a = readFileSync('scratch/indeks.bak.ts', 'utf8').split('\n');
const b = readFileSync('src/lib/zephyrIndeks.ts', 'utf8').split('\n');
console.log('baris:', a.length, b.length);
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { console.log('beda di baris', i + 1); console.log(' A:', (a[i] ?? '').slice(0, 200)); console.log(' B:', (b[i] ?? '').slice(0, 200)); break; }
}
