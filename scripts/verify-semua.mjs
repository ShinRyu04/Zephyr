/*
 * Fase 7: jalankan SELURUH harness verify-*.mjs dan laporkan apa adanya.
 *
 * Kenapa satu runner: menjalankan 110 skrip satu per satu dengan tangan berarti
 * tidak ada yang menjalankannya. Yang dilaporkan adalah hasil NYATA - termasuk
 * yang gagal, termasuk yang butuh app hidup, termasuk yang butuh kunci model.
 * Runner ini tidak "memperbaiki" angka: exit code 1 kalau ada yang gagal.
 *
 * Klasifikasi penting, karena tidak semua kegagalan sama:
 *   LULUS   exit 0
 *   GAGAL   exit != 0 DAN tidak ada penanda lingkungan
 *   LEWAT   exit != 0 tapi pesannya menyebut prasyarat yang tidak ada
 *           (tanpa app, tanpa kunci model, MCP dimatikan)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const AKAR = process.cwd();
const DIR = path.join(AKAR, 'scripts');

/* Penanda bahwa kegagalan disebabkan lingkungan, bukan kode. */
const PENANDA_LEWAT = [
  /tidak ada folder terbuka/i,
  /open a folder first/i,
  /no usable key/i,
  /butuh kunci/i,
  /ECONNREFUSED/i,
  /belum jalan/i,
  /app tidak hidup/i,
  /mcp.*(dimatikan|disabled)/i,
  /LEWAT/,
  /skip/i,
];

/* Skrip yang butuh app hidup; tanpa CDP semuanya akan gagal seragam. */
const butuhApp = async () => {
  try {
    const r = await fetch('http://127.0.0.1:9223/json/list');
    return r.ok;
  } catch {
    return false;
  }
};

const jalankan = (file) =>
  new Promise((resolve) => {
    const mulai = Date.now();
    const p = spawn(process.execPath, [path.join(DIR, file)], {
      cwd: AKAR,
      env: process.env,
      windowsHide: true,
    });
    let keluaran = '';
    p.stdout.on('data', (d) => (keluaran += d.toString()));
    p.stderr.on('data', (d) => (keluaran += d.toString()));
    /* Batas keras: satu skrip yang menggantung tidak boleh menahan seluruh
       rangkaian. 4 menit cukup untuk probe generator terberat. */
    const batas = setTimeout(() => p.kill('SIGKILL'), 240_000);
    p.on('close', (kode) => {
      clearTimeout(batas);
      resolve({ file, kode: kode ?? 1, ms: Date.now() - mulai, keluaran });
    });
  });

const adaApp = await butuhApp();
const semua = fs
  .readdirSync(DIR)
  .filter((f) => /^verify.*\.mjs$/.test(f) && f !== 'verify.mjs' && !f.startsWith('verify-beban'))
  .sort();

console.log(`Fase 7 — regresi penuh`);
console.log(`app hidup: ${adaApp ? 'ya' : 'TIDAK'}`);
console.log(`harness  : ${semua.length}\n`);

const hasil = [];
for (const f of semua) {
  process.stdout.write(`  ${f.padEnd(34)} `);
  const r = await jalankan(f);
  const lewat = r.kode !== 0 && PENANDA_LEWAT.some((p) => p.test(r.keluaran));
  const status = r.kode === 0 ? 'LULUS' : lewat ? 'LEWAT' : 'GAGAL';
  hasil.push({ ...r, status });
  console.log(`${status.padEnd(6)} ${String(r.ms).padStart(6)} ms`);
}

const hitung = (s) => hasil.filter((h) => h.status === s).length;
console.log(`\n== ${hitung('LULUS')} lulus, ${hitung('LEWAT')} lewat, ${hitung('GAGAL')} gagal ==`);

if (hitung('GAGAL')) {
  console.log('\nYang GAGAL (bukan masalah lingkungan):');
  for (const h of hasil.filter((x) => x.status === 'GAGAL')) {
    console.log(`\n--- ${h.file} (exit ${h.kode}) ---`);
    const baris = h.keluaran.split(/\r?\n/).filter((l) => /GAGAL|Error|error|panicked/.test(l));
    console.log(baris.slice(0, 6).join('\n') || h.keluaran.slice(-400));
  }
}

fs.writeFileSync(
  path.join(AKAR, 'scratch', 'regresi-fase7.json'),
  JSON.stringify(hasil.map(({ keluaran, ...s }) => s), null, 2),
);

process.exit(hitung('GAGAL') ? 1 : 0);
