// bungkus-tr.mjs — ganti teks Indonesia hardcode di komponen dengan tr('...').
//
// Untuk setiap kunci di terjemahan-i18n.mjs, cari bentuk mentahnya di
// komponen lalu bungkus dengan tr(). Beberapa bentuk ditangani:
//
//   >Teks<                    -> >{tr('Teks')}<
//   hint="Teks"               -> hint={tr('Teks')}
//   label: 'Teks'             -> label: tr('Teks')     (hanya di luar objek i18n)
//   placeholder="Teks"        -> placeholder={tr('Teks')}
//
// Komponen yang belum mengimpor useT/tr diberi impor otomatis; nilainya
// diambil dari useT() di dalam fungsi komponen.

import fs from 'node:fs';
import path from 'node:path';
import { TERJEMAHAN } from './terjemahan-i18n.mjs';

const PERIKSA = process.argv.includes('--periksa');
const kunci = Object.keys(TERJEMAHAN);

/** Berkas yang dipindai — komponen dan pustaka, kecuali berkas i18n. */
function berkas() {
  const hasil = [];
  const jalan = (dir) => {
    for (const nama of fs.readdirSync(dir)) {
      const p = path.join(dir, nama);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (nama === 'node_modules' || nama === 'dist') continue;
        jalan(p);
      } else if (/\.(tsx|ts)$/.test(nama) && !/i18n/.test(nama)) {
        hasil.push(p);
      }
    }
  };
  jalan('src');
  return hasil;
}

let totalGanti = 0;
const laporan = [];

for (const p of berkas()) {
  let s = fs.readFileSync(p, 'utf8');
  const asli = s;
  let ganti = 0;

  for (const k of kunci) {
    // Bentuk 1: teks telanjang di antara tag.
    const bentukTag = new RegExp(`>(\\s*)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*)<`, 'g');
    const sebelumTag = s;
    s = s.replace(bentukTag, (_, a, b) => `>${a}{tr('${k.replace(/'/g, "\\'")}')}${b}<`);
    if (s !== sebelumTag) ganti += 1;

    // Bentuk 2: atribut string pada satu baris.
    for (const atribut of ['hint', 'placeholder', 'title', 'aria-label', 'alt']) {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\'");
      const pola = new RegExp(`${atribut}="[^"]*${esc}[^"]*"`, 'g');
      const sebelumAttr = s;
      s = s.replace(pola, (m) => {
        const isi = m.slice(atribut.length + 2, -1);
        return `${atribut}={tr('${isi.replace(/'/g, "\\'")}')}`;
      });
      if (s !== sebelumAttr) ganti += 1;
    }

    // Bentuk 3: label: 'Teks' di dalam daftar opsi.
    const polaLabel = new RegExp(`label: '${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g');
    const sebelumLabel = s;
    s = s.replace(polaLabel, `label: tr('${k.replace(/'/g, "\\'")}')`);
    if (s !== sebelumLabel) ganti += 1;
  }

  if (s === asli) continue;

  // Pastikan berkas mengimpor useT.
  if (!/\buseT\b/.test(s) && /tr\(/.test(s)) {
    const rel = path.relative(path.dirname(p), 'src/lib/i18n').replace(/\\/g, '/');
    const impor = `import { useT } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
    const barisPertamaImpor = s.search(/^import /m);
    s = barisPertamaImpor >= 0 ? s.slice(0, barisPertamaImpor) + impor + s.slice(barisPertamaImpor) : impor + s;
    ganti += 1;
  }

  // Pastikan ada `const tr = useT();` di dalam fungsi komponen.
  if (/tr\(/.test(s) && !/\bconst tr = useT\(\)/.test(s)) {
    const m = /(export default function \w+\([^)]*\)\s*\{)/.exec(s);
    if (m) {
      s = s.replace(m[1], `${m[1]}\n  const tr = useT();`);
      ganti += 1;
    }
  }

  totalGanti += ganti;
  laporan.push(`${p}: ${ganti} perubahan`);
  if (!PERIKSA) fs.writeFileSync(p, s);
}

console.log(`# ${laporan.length} berkas tersentuh, ${totalGanti} perubahan`);
for (const l of laporan) console.log(`  ${l}`);
if (PERIKSA) console.log('\n(mode --periksa: berkas tidak diubah)');
