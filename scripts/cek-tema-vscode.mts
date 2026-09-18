// cek-tema-vscode.mts — bukti penerjemah tema VS Code → token Zephyr bekerja
// dengan file tema NYATA dari Open VSX (cocopon.iceberg-theme).
//
// Jalankan: node --experimental-strip-types scripts/cek-tema-vscode.mts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { petakanTemaVscode } from '../src/lib/vscodeThemeMap.ts';

const API = 'https://open-vsx.org/api/cocopon/iceberg-theme';

async function unduhVsix(): Promise<string> {
  const r = await fetch(API, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`metadata HTTP ${r.status}`);
  const meta = (await r.json()) as { version?: string; files?: Record<string, string> };
  const dl = meta.files?.download;
  if (!dl) throw new Error('metadata tidak punya files.download');
  const r2 = await fetch(dl);
  if (!r2.ok) throw new Error(`vsix HTTP ${r2.status}`);
  const buf = Buffer.from(await r2.arrayBuffer());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-tema-'));
  const zf = path.join(tmp, 'tema.zip');
  fs.writeFileSync(zf, buf);
  return zf;
}

const zf = await unduhVsix();
const dest = zf.replace(/\.zip$/, '-unzip');
if (!fs.existsSync(dest)) {
  fs.mkdirSync(dest, { recursive: true });
  execSync(`tar -xf "${zf}" -C "${dest}"`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'extension', 'package.json'), 'utf8'));
const themes = pkg.contributes?.themes ?? [];
console.log(`ekstensi: ${pkg.publisher}.${pkg.name} — contributes.themes: ${themes.length}`);
if (themes.length === 0) {
  console.log('GAGAL: tema tidak punya contributes.themes');
  process.exit(1);
}

// Jalankan muatTema yang sama persis: baca file tema pertama (versi dark bila ada)
const pilih = themes.find((t: { kind?: string }) => t.kind?.toLowerCase().includes('dark')) ?? themes[0];
const fileTema = path.join(dest, 'extension', pilih.path.replace(/^\.\//, ''));
const raw = JSON.parse(fs.readFileSync(fileTema, 'utf8'));
console.log(`file tema: ${pilih.path} (kind: ${pilih.uiTheme ?? pilih.kind ?? '?'})`);

const colors = (raw.colors ?? {}) as Record<string, unknown>;
const token = petakanTemaVscode(colors);
const jumlah = Object.keys(token).length;

console.log(`\nwarna VS Code terbaca : ${Object.keys(colors).length}`);
console.log(`token Zephyr terisi   : ${jumlah}`);

// Kunci token WAJIB kebab-case — sama seperti nama CSS variable di
// src/styles/*.css (`--editor-bg`, bukan `--editorBg`).
const wajib = ['bg', 'text', 'accent', 'surface', 'editor-bg', 'border'] as const;
let gagal = 0;
for (const k of wajib) {
  const v = token[k];
  console.log(`  --${k.padEnd(14)} = ${v ?? '(KOSONG!)'}`);
  if (!v) gagal++;
}

console.log(`\ncontoh lain:`);
for (const k of Object.keys(token).filter((x) => !wajib.includes(x as never)).slice(0, 12)) {
  console.log(`  --${k.padEnd(14)} = ${token[k]}`);
}

if (jumlah < 20 || gagal > 0) {
  console.log(`\nGAGAL: token terisi ${jumlah} (< 20) atau token wajib kosong: ${gagal}`);
  process.exit(1);
}
console.log(`\nLULUS: ${jumlah} token Zephyr terisi dari tema nyata Open VSX (≥ 20, token wajib lengkap).`);
