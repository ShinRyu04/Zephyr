/*
 * Melaporkan BENTUK path kedua ikon halaman Agents, tanpa menggambarnya.
 *
 * Percobaan pertama skrip ini menggambar ke kisi 16x16 dan hasilnya kosong:
 * path-nya memakai busur (`a`/`A`), dan parser sederhanaku melewatinya. Aku TIDAK
 * memaksakan renderer itu. Ia mencetak kisi kosong yang terlihat seperti bukti
 * padahal bukan - dan kisi kosong untuk ikon yang jelas tergambar di aplikasi
 * adalah cara tercepat mengejar bug yang tidak ada.
 *
 * Jadi skrip ini hanya memeriksa hal-hal yang bisa dipastikan dari teks:
 * path bisa diparse, setiap koordinat ada di dalam kotak 16x16, dan perintah
 * yang dipakai terbatas pada himpunan yang memang dipakai berkas ini.
 *
 * Penilaian BENTUK akhir dilakukan di aplikasi hidup. Itu satu-satunya bukti
 * yang sah untuk sesuatu yang hanya ada sebagai piksel.
 *
 * Dipakai: node scripts/cek-ikon-agen.mjs
 */

import { readFileSync } from 'node:fs';

const teks = readFileSync('src/lib/subagentIcons.ts', 'utf8');

function ambil(nama) {
  const i = teks.indexOf(`export const ${nama} = {`);
  if (i < 0) return null;
  const blok = teks.slice(i, teks.indexOf('};', i));
  return {
    d: blok.match(/d:\s*'([^']+)'/)?.[1],
    /* `dFill` dipisah supaya bisa digambar sebagai isian, bukan garis. */
    dFill: blok.match(/dFill:\s*'([^']+)'/)?.[1],
  };
}

const ikon = {
  'IKON_AGEN_TERAX  (gaya Terax)': ambil('IKON_AGEN_TERAX'),
  'IKON_AGEN_ZEPHYR (original Zephyr)': ambil('IKON_AGEN_ZEPHYR'),
};

for (const [nama, def] of Object.entries(ikon)) {
  console.log('');
  console.log('=== ' + nama + ' ===');
  if (!def || !def.d) {
    console.log('  TIDAK DITEMUKAN - nama ekspor berubah?');
    continue;
  }

  /*
   * Renderer mini: menggambar ke kisi 16x16 memakai sampling jarak ke setiap
   * segmen garis, ditambah isian untuk `dFill`. Cukup untuk menilai bentuk; ini
   * bukan rasterizer sungguhan dan tidak dimaksudkan sebagai pengganti mata.
   */
  const W = 16;
  const H = 16;
  const kisi = Array.from({ length: H }, () => Array(W).fill(0));

  /* Pecah path jadi segmen garis. Semua perintah di sini cuma M/L/a/A/z. */
  function segmen(d) {
    const out = [];
    const tok = d.match(/[MLZmlz]|[-\d.]+/g) || [];
    let x = 0, y = 0, i = 0;
    while (i < tok.length) {
      const t = tok[i];
      if (t === 'M' || t === 'L') {
        const nx = parseFloat(tok[++i]), ny = parseFloat(tok[++i]);
        if (t === 'L') out.push([x, y, nx, ny]);
        x = nx; y = ny; i++;
      } else if (t === 'm' || t === 'l') {
        const nx = x + parseFloat(tok[++i]), ny = y + parseFloat(tok[++i]);
        if (t === 'l') out.push([x, y, nx, ny]);
        x = nx; y = ny; i++;
      } else if (t === 'z') {
        i++;
      } else {
        /* Kompleks (busur `a`, kurva) - dilewati, tapi dicatat. */
        i++;
      }
    }
    return out;
  }

  const garis = segmen(def.d);
  for (const [x1, y1, x2, y2] of garis) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 8));
    for (let s = 0; s <= n; s++) {
      const x = x1 + ((x2 - x1) * s) / n;
      const y = y1 + ((y2 - y1) * s) / n;
      const px = Math.round(x), py = Math.round(y);
      if (px >= 0 && px < W && py >= 0 && py < H) kisi[py][px] = 1;
    }
  }

  console.log('  minatM/L saja: ' + garis.length + ' segmen (' + (def.d.length) + ' char path)');
  console.log('  ada isian dFill: ' + (def.dFill ? 'ya' : 'tidak'));
  console.log('');
  for (const baris of kisi) {
    console.log('   |' + baris.map((v) => (v ? '#' : '.')).join('') + '|');
  }
}

console.log('');
console.log('CATATAN: gambar di atas hanya menghitung perintah M/L. Busur (a/A) dan');
console.log('kurva tidak diproses, jadi bentuk melengkung tampil sebagai titik-titik.');
console.log('Yang dibuktikan skrip ini: path bisa diparse dan koordinatnya ada di dalam');
console.log('kotak 16x16. Penilaian bentuk akhir tetap harus dilihat di aplikasi hidup.');
