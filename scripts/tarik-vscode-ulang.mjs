// tarik-vscode-ulang.mjs — tarik ulang versi yang highlight-nya kosong (format baru).
//
// Pakai:  node scripts/tarik-vscode-ulang.mjs
//
// Sejak 1.99 halaman release notes tidak lagi memakai daftar bullet "Nama - ...".
// Highlight-nya ditulis sebagai paragraf dengan judul kategori (Chat, Agent,
// Editor experience, ...). Skrip ini menyimpan blok highlight mentah supaya
// penyaring AI bisa membaca kalimatnya apa adanya.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'vscode-updates.json');
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));

const perlu = data.filter((v) => v.highlights.length === 0 && !v.raw);
console.log(`  ${perlu.length} versi perlu ditarik ulang`);

for (const v of perlu) {
  const url = `https://code.visualstudio.com/updates/v${v.versi.replace('.', '_')}`;
  let html = '';
  try {
    html = execFileSync('curl', ['-sL', '--max-time', '25', url], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    console.log(`  ${v.versi} gagal (curl)`);
    continue;
  }

  let isi = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const m = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(isi);
  if (m) isi = m[1];
  isi = isi
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<');
  isi = isi.replace(/\s+/g, ' ').trim();

  const hStart = /key highlights include:\s*/i.exec(isi);
  if (!hStart) {
    console.log(`  ${v.versi} tanpa bagian highlight`);
    continue;
  }

  let blob = isi.slice(hStart.index + hStart[0].length);
  const akhir = blob.search(/If you'd like to read|Insiders:|release notes are arranged|Happy Coding/i);
  if (akhir > 0) blob = blob.slice(0, akhir);
  blob = blob.trim().slice(0, 4000);

  v.raw = blob;
  // Pisah kasar jadi kalimat supaya bisa ditampilkan.
  v.highlights = blob
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 320)
    .slice(0, 30);

  console.log(`  ${v.versi} → ${v.highlights.length} potongan (raw ${blob.length} char)`);
}

fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
console.log('  selesai');
