/* probe ukur panjang bagian blok suntikan (kepala/meta/penutup/total) */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const AKAR = 'D:/Zephyr';
const KERJA = join(AKAR, 'scratch', 'probe-angka');
mkdirSync(KERJA, { recursive: true });

const entri = [
  "import { writeFileSync } from 'node:fs';",
  `import { FAKTA_INDEKS } from '${AKAR}/src/lib/zephyrIndeks';`,
  `import { suntikanIndeks, kepalaSuntikanIndeks, jumlahEntri, versiFakta, petaIndeks } from '${AKAR}/src/lib/zephyrCari';`,
  "const kepala = kepalaSuntikanIndeks();",
  "const meta = 'Index ' + jumlahEntri() + ' entries, app ' + versiFakta().aplikasi + ', source hash ' + versiFakta().hashSumber + ' | categories: ' + petaIndeks();",
  "const kandidat = FAKTA_INDEKS.map((e) => e[1]).filter((k) => /^[a-z][a-z0-9._-]{4,}$/.test(k)).slice(0, 60);",
  "const k0 = kandidat[0];",
  "const blok1200 = suntikanIndeks(k0);",
  "const blok300 = suntikanIndeks(k0, { batasKarakter: 300 });",
  "const semua = kandidat.map((k) => suntikanIndeks(k));",
  "writeFileSync(process.env.PROBE_KELUAR, JSON.stringify({",
  "  kepalaLen: kepala.length, metaLen: meta.length, wajib2: kepala.length + meta.length + 2,",
  "  kepala, meta,",
  "  k0, blok1200Len: blok1200.length, blok300Len: blok300.length,",
  "  maksTotal: Math.max(...semua.map((t) => t.length)),",
  "  maksMetered: Math.max(...semua.map((t) => { const b = String(t).split('\\n'); const p = b[b.length-1] ?? ''; return String(t).length - p.length - 1; })),",
  "  penutupChar: (() => { const b = String(blok1200).split('\\n'); return (b[b.length-1] ?? '').length; })(),",
  "  blok300Dump: blok300,",
  "}, null, 2));",
].join('\n');

const berkas = join(KERJA, 'entri.ts');
writeFileSync(berkas, entri);
const keluar = join(KERJA, 'entri.mjs');
await esbuild.build({
  entryPoints: [berkas], bundle: true, platform: 'node', format: 'esm',
  outfile: keluar, logLevel: 'warning',
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test' }) },
});
const kEluar = join(KERJA, 'hasil.json');
const anak = spawnSync(process.execPath, [keluar], { cwd: AKAR, env: { ...process.env, PROBE_KELUAR: kEluar }, encoding: 'utf8' });
if (anak.status !== 0) { console.error('GAGAL', anak.stdout, anak.stderr); process.exit(1); }
console.log(readFileSync(kEluar, 'utf8'));
