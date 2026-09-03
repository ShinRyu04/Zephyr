// buat-fixture28.mjs — fixture fase 28 (CLI launcher).
//
// Semua file taruh di .zephyr/uji28/ (di-gitignore lewat .zephyr/).

import fs from 'node:fs';
import path from 'node:path';

const akar = path.resolve(import.meta.dirname, '..', '..');
const dir = path.join(akar, '.zephyr', 'uji28');
fs.mkdirSync(dir, { recursive: true });

// File target `zephyr file.ts:10:5` — baris 10 kolom 5 harus ada isinya.
const target = [
  '// target28.ts — fixture fase 28',
  '// baris 10 kolom 5 dipakai uji posisi kursor.',
  'export function satu() {',
  '  return 1;',
  '}',
  '',
  'export function dua() {',
  '  return 2;',
  '}',
  '    const TARGET_BARIS_10 = "kolom 5 mulai di sini";',
  '',
  'export function tiga() {',
  '  return 3;',
  '}',
  '',
];
fs.writeFileSync(path.join(dir, 'target28.ts'), target.join('\n'), 'utf8');

// Dua file untuk --diff: beda di tengah, sama di ujung (bukti diff nyata).
const kiri = ['satu', 'dua', 'LAMA-tiga', 'empat', 'lima'];
const kanan = ['satu', 'dua', 'BARU-tiga', 'empat', 'lima'];
fs.writeFileSync(path.join(dir, 'diff-a.txt'), `${kiri.join('\n')}\n`, 'utf8');
fs.writeFileSync(path.join(dir, 'diff-b.txt'), `${kanan.join('\n')}\n`, 'utf8');

// Subfolder untuk uji `zephyr <folder>` → workspace.
const sub = path.join(dir, 'sebagai-workspace');
fs.mkdirSync(sub, { recursive: true });
fs.writeFileSync(path.join(sub, 'isi.txt'), 'workspace fixture fase 28\n', 'utf8');

// File untuk --wait (isinya seperti COMMIT_EDITMSG).
fs.writeFileSync(
  path.join(dir, 'COMMIT_EDITMSG'),
  ['', '# Please enter the commit message for your changes.', ''].join('\n'),
  'utf8',
);

console.log(`fixture 28 siap di ${dir}`);
for (const f of fs.readdirSync(dir)) console.log(`  ${f}`);
