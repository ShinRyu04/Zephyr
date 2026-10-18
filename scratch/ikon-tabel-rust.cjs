/*
 * Tulis ulang entri paket ikon di tabel PAKET (ext_bundled.rs) supaya setiap
 * paket memasang manifest + JSON tema + SEMUA berkas SVG-nya.
 *
 * Kenapa seluruh tabel ditulis ulang, bukan ditambal: entri lama menunjuk
 * konstanta glyph (IKON_BULAT_JSON dst) yang sudah diganti isinya oleh
 * ext_bundled_extra.rs. Entri yang tidak ikut berubah akan memasang tema yang
 * menunjuk berkas SVG yang tidak pernah ditulis -> ikon kosong, dan itu lebih
 * buruk daripada tidak ada paket sama sekali.
 */
const fs = require('fs');
const path = require('path');

const daftar = JSON.parse(fs.readFileSync('scratch/ikon/paket-svg.json', 'utf8'));
const AKAR = 'scratch/ikon/svg';

const namaKonst = (id) => 'IKON_' + id.replace(/^zephyr\.ikon-/, '').replace(/-/g, '_').toUpperCase();

/* Satu entri tabel:
 *   (
 *       "id",
 *       &[
 *           ("zephyr-extension.json", K),
 *           ("icons/x.json", K_JSON),
 *           ("icons/kode.svg", K_SVG_KODE),
 *           ...
 *       ],
 *   ),
 */
const entri = daftar.map((p) => {
  const kunci = p.id.replace(/^zephyr\.ikon-/, '');
  const K = namaKonst(p.id);
  const baris = [
    `        ("zephyr-extension.json", extra::${K}),`,
    `        ("icons/${kunci}.json", extra::${K}_JSON),`,
  ];
  const folderIkon = path.join(AKAR, kunci, 'icons');
  for (const f of fs.readdirSync(folderIkon).filter((x) => x.endsWith('.svg')).sort()) {
    const nama = f.replace(/\.svg$/, '').replace(/-/g, '_').toUpperCase();
    baris.push(`        ("icons/${f}", extra::${K}_SVG_${nama}),`);
  }
  return `    (\n        "${p.id}",\n        &[\n${baris.join('\n')}\n        ],\n    ),`;
});

const jalur = 'src-tauri/src/ext_bundled.rs';
let s = fs.readFileSync(jalur, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

/*
 * Buang SEMUA entri paket ikon lama (id zephyr.ikon-*) dari tabel, lalu
 * sisipkan entri baru sebelum penutup tabel.
 */
const reEntri = /\(\s*\n?\s*"zephyr\.ikon-[a-z0-9-]+",\s*\n?\s*&\[[\s\S]*?\n?\s*\],\s*\n?\s*\),/g;
const sebelum = (s.match(reEntri) ?? []).length;
s = s.replace(reEntri, '');

/* Sisipkan sebelum penutup tabel PAKET. */
const AWAL = '/* ══ IKON MARKETPLACE (didaftarkan) ══ */';
const AKHIR = '/* ══ AKHIR IKON MARKETPLACE (didaftarkan) ══ */';
const iA = s.indexOf(AWAL);
const iB = s.indexOf(AKHIR);
if (iA >= 0 && iB >= 0) s = s.slice(0, iA) + s.slice(iB + AKHIR.length);

const blok = [AWAL, ...entri, AKHIR].join(eol);

/* Tabel PAKET: cari `const PAKET: &[Paket] = &[` lalu `\n];` penutupnya. */
const idxTabel = s.indexOf('const PAKET: &[Paket] = &[');
if (idxTabel < 0) {
  console.error('TIDAK KETEMU: const PAKET');
  process.exit(1);
}
const tutup = s.indexOf('\n];', idxTabel);
if (tutup < 0) {
  console.error('TIDAK KETEMU: penutup tabel');
  process.exit(1);
}
s = s.slice(0, tutup) + eol + blok + s.slice(tutup);

fs.writeFileSync(jalur, s, 'utf8');

console.log('entri lama dibuang:', sebelum);
console.log('entri baru ditulis:', entri.length);
console.log('berkas per paket   :', entri[0].split('\n').length - 5);
console.log('contoh id          :', daftar.map((d) => d.id).join(', '));
