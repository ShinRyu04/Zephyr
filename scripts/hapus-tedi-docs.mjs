// hapus-tedi-docs.mjs — bersihkan kata "TEDI" dari berkas docs.
//
// Pakai:  node scripts/hapus-tedi-docs.mjs
//
// "TEDI" bukan nama yang diminta user; itu sisipan yang salah waktu menyusun
// pesan commit. Skrip ini menggantinya dengan penyebutan netral.

import fs from 'node:fs';

const FILE = ['docs/laporan-zephyr-doc.py', 'docs/laporan/laporan-zephyr-doc.py'];

const GANTI = [
  ["('Subagent paralel (ala TEDI)'", "('Subagent paralel'"],
  ["'Panel subagent dibuat seperti TEDI: grid 2 kolom", "'Panel subagent dibuat: grid 2 kolom"],
];

let total = 0;
for (const f of FILE) {
  if (!fs.existsSync(f)) {
    console.log(`  ! ${f} tidak ada`);
    continue;
  }
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const [old, baru] of GANTI) {
    if (s.includes(old)) {
      s = s.split(old).join(baru);
      n++;
    }
  }
  if (n > 0) {
    fs.writeFileSync(f, s, 'utf8');
    total += n;
    console.log(`  ${f}: ${n} penggantian`);
  } else {
    console.log(`  ${f}: tidak ada perubahan`);
  }
}
console.log(`  total: ${total}`);
