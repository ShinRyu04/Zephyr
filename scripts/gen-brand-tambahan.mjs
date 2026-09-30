// Menambahkan mark merek untuk keluarga model yang belum punya.
//
// Sumber: @lobehub/icons-static-svg (24x24, path saja). Nama file diambil dari
// daftar ikon paket itu; yang tidak ada di sana dilewati dan tetap memakai titik
// netral — lebih baik tanpa logo daripada logo yang salah.
//
// Jalankan: node scripts/gen-brand-tambahan.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = join(akar, 'src/lib/modelBrandIcons.ts');

/*
 * Keluarga baru -> nama file di @lobehub/icons-static-svg + warna merek.
 *
 * `warna: null` = merek monokrom; mark mengikuti warna teks sekitarnya supaya
 * tetap terbaca di tema terang maupun gelap.
 */
const BARU = {
  glm: { file: 'zhipu', warna: '#3859FF' },
  minimax: { file: 'minimax', warna: '#EE3D5C' },
  nvidia: { file: 'nvidia', warna: '#76B900' },
  tencent: { file: 'hunyuan', warna: null },
  bytedance: { file: 'doubao', warna: '#325AB4' },
  inclusion: { file: 'inclusionai', warna: null },
  longcat: { file: 'longcat', warna: null },
  mimo: { file: 'xiaomimimo', warna: '#FF6900' },
  stepfun: { file: 'stepfun', warna: null },
  baidu: { file: 'wenxin', warna: '#2932E1' },
  spark: { file: 'spark', warna: '#0070F0' },
  yi: { file: 'yi', warna: null },
  baichuan: { file: 'baichuan', warna: null },
  siliconflow: { file: 'siliconcloud', warna: '#6E29F6' },
  together: { file: 'together', warna: null },
  groq: { file: 'groq', warna: '#F55036' },
  cerebras: { file: 'cerebras', warna: '#F15A29' },
  fireworks: { file: 'fireworks', warna: null },
  openrouter: { file: 'openrouter', warna: null },
  azure: { file: 'azure', warna: '#0078D4' },
  bedrock: { file: 'bedrock', warna: null },
  vertexai: { file: 'vertexai', warna: '#4285F4' },
  ollama: { file: 'ollama', warna: null },
  lmstudio: { file: 'lmstudio', warna: null },
};

const VERSI = '1.95.1';

async function ambilPath(nama) {
  const url = `https://unpkg.com/@lobehub/icons-static-svg@${VERSI}/icons/${nama}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${nama}: HTTP ${res.status}`);
  const svg = await res.text();
  const m = svg.match(/<path d="([^"]+)"/);
  if (!m) throw new Error(`${nama}: tidak ada path`);
  return m[1];
}

let isi = readFileSync(P, 'utf8');
const ditambah = [];
const gagal = [];

for (const [fam, { file, warna }] of Object.entries(BARU)) {
  // Lewati yang sudah ada supaya skrip ini aman dijalankan ulang.
  if (new RegExp(`^\\s{2}${fam}: \\{`, 'm').test(isi)) {
    continue;
  }
  try {
    const d = await ambilPath(file);
    const baris = `  ${fam}: {\n    d: '${d}',\n    warna: ${warna ? `'${warna}'` : 'null'},\n  },\n`;
    isi = isi.replace(/(\nexport const BRAND_MARKS: Record<string, BrandMark> = \{\n)/, `$1${baris}`);
    ditambah.push(fam);
  } catch (e) {
    gagal.push(`${fam} (${file}): ${e.message}`);
  }
}

writeFileSync(P, isi, 'utf8');
console.log(`  ditambah: ${ditambah.length} -> ${ditambah.join(', ')}`);
if (gagal.length) console.log(`  gagal: ${gagal.join(' | ')}`);
