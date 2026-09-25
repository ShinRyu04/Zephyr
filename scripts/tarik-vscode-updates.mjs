// tarik-vscode-updates.mjs — tarik release notes VS Code 2018..2026 dari arsip.
//
// Pakai:  node scripts/tarik-vscode-updates.mjs
//
// Menyimpan daftar highlight tiap versi ke $LOCALAPPDATA/Temp/vscode-updates.json
// lalu mencetak ringkasannya. Halaman diambil dengan curl (Node fetch bisa
// diblokir), lalu bagian "key highlights" diekstrak dari teks.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'vscode-updates.json');

// Versi 1.20 (Jan 2018) .. 1.139. Nomor rilis = bulan ke-2 sejak 1.20.
const VERSI = [];
for (let minor = 20; minor <= 139; minor++) VERSI.push(`1_${minor}`);

function ambilTeks(v) {
  const url = `https://code.visualstudio.com/updates/v${v}`;
  let html = '';
  try {
    html = execFileSync('curl', ['-sL', '--max-time', '25', url], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  if (!html || html.length < 5000) return null;

  // Buang skrip + gaya, ambil <main> kalau ada.
  let isi = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const m = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(isi);
  if (m) isi = m[1];
  isi = isi.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<');
  isi = isi.replace(/\s+/g, ' ').trim();

  // Judul bulan/tahun
  const judul = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+\(version\s+([\d.]+)\)/i.exec(isi);

  // Highlight: kalimat setelah "key highlights include:" sampai tanda titik berikutnya
  // yang diikuti bullet-bullet.
  const highlights = [];
  const hStart = /key highlights include:\s*/i.exec(isi);
  if (hStart) {
    const sisa = isi.slice(hStart.index + hStart[0].length);
    // Bullet di halaman teks: "Nama fitur - penjelasan." dipisah kapital.
    const potong = sisa.slice(0, 2600);
    // Pisah pada pola "X - " (nama fitur diikuti tanda hubung)
    const bagian = potong.split(/(?=[A-Z][A-Za-z0-9 ()/'’.\-]{3,60}\s-\s)/);
    for (const b of bagian) {
      const t = b.trim();
      if (t.length < 8 || t.length > 260) continue;
      if (!/ - /.test(t)) continue;
      highlights.push(t.replace(/\s+/g, ' ').trim());
      if (highlights.length >= 14) break;
    }
  }

  return {
    versi: v.replace('_', '.'),
    bulan: judul ? `${judul[1]} ${judul[2]}` : null,
    nomor: judul ? judul[3] : null,
    highlights,
  };
}

const hasil = [];
for (const v of VERSI) {
  const r = ambilTeks(v);
  if (r) {
    hasil.push(r);
    console.log(`  ${r.versi.padEnd(6)} ${String(r.bulan ?? '?').padEnd(18)} ${r.highlights.length} highlight`);
  } else {
    console.log(`  ${v.replace('_', '.').padEnd(6)} (gagal / belum ada)`);
  }
}

fs.writeFileSync(OUT, JSON.stringify(hasil, null, 2), 'utf8');
console.log(`\n== ${hasil.length} versi tersimpan ==`);
console.log(`   ${OUT}`);
