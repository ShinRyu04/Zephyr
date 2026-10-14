// banding-tema.mjs — bandingkan palet antar tema: mana yang kembar / nyaris kembar?
//
// Latar (item J): katalog tema sempat berisi pasangan yang praktis sama
// (min-light vs zephyr-light, github-dark vs zephyr-dark) dan pasangan yang cuma
// beda sedikit (tokyo-night vs kanagawa, dracula vs catppuccin-mocha). Dua tema yang
// identik itu bukan "pilihan", cuma kartu duplikat di grid.
//
// Pembaca tokennya sama dengan gate kontras (`bacaTema()` dari a11y-kontras.mjs),
// jadi angka di sini menghitung token yang benar-benar berlaku di app — bukan teks
// mentah di CSS yang bisa tertimpa blok lain.
//
// Pakai:
//   node scripts/banding-tema.mjs              # ringkas: pasangan terdekat dulu
//   node scripts/banding-tema.mjs --batas 20   # ambang "nyaris kembar" (jumlah token beda)
//   node scripts/banding-tema.mjs --tegas      # "nyaris kembar" ikut menggagalkan (exit 1)
//   node scripts/banding-tema.mjs --detail     # tampilkan token yang sama per pasangan
//
// Yang menggagalkan secara bawaan cuma KEMBAR (0 token beda): dua kartu tema yang
// menampilkan hal yang sama persis. "Nyaris kembar" dilaporkan tapi tidak menggagalkan,
// karena dua tema boleh saja mirip karena asalnya (github-dark memang harus terasa
// seperti GitHub) — yang tidak boleh adalah kartu duplikat tanpa beda apa pun.
import { bacaTema } from './a11y-kontras.mjs';

import { keluarBersih } from './lib-cdp.mjs';
const iBatas = process.argv.indexOf('--batas');
const BATAS = iBatas > 0 ? Number(process.argv[iBatas + 1]) : 20;
const detail = process.argv.includes('--detail');
const tegas = process.argv.includes('--tegas');

const tema = bacaTema();
const nama = [...tema.keys()];
const semuaToken = new Set();
for (const t of tema.values()) for (const k of t.keys()) semuaToken.add(k);

const baris = [];
for (let i = 0; i < nama.length; i++) {
  for (let j = i + 1; j < nama.length; j++) {
    const a = tema.get(nama[i]);
    const b = tema.get(nama[j]);
    let sama = 0;
    let beda = 0;
    const samaToken = [];
    for (const k of semuaToken) {
      const va = a.get(k);
      const vb = b.get(k);
      if (va === undefined || vb === undefined) continue;
      if (va === vb) {
        sama++;
        samaToken.push(k);
      } else beda++;
    }
    baris.push({ a: nama[i], b: nama[j], sama, beda, samaToken });
  }
}

baris.sort((x, y) => x.beda - y.beda);
console.log(`${nama.length} tema, ${semuaToken.size} token dibandingkan\n`);
console.log('pasangan paling mirip:');
for (const r of baris.slice(0, 8)) {
  const tanda = r.beda === 0 ? 'KEMBAR' : r.beda <= BATAS ? 'nyaris kembar' : '';
  console.log(`  ${String(r.beda).padStart(3)} token beda  ${r.a} <-> ${r.b}${tanda ? '   <- ' + tanda : ''}`);
  if (detail && r.beda <= BATAS) console.log(`      sama: ${r.samaToken.join(' ')}`);
}
const kembar = baris.filter((r) => r.beda === 0);
const nyaris = baris.filter((r) => r.beda > 0 && r.beda <= BATAS);
console.log(`\nkembar: ${kembar.length} pasangan | nyaris kembar (<= ${BATAS} token): ${nyaris.length} pasangan`);
for (const r of nyaris) console.log(`  PERINGATAN ${r.a} <-> ${r.b}: ${r.beda} token beda`);
if (kembar.length || (tegas && nyaris.length)) keluarBersih(1);
