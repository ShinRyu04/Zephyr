/*
 * Tulis paket ikon SVG ke ext_bundled_extra.rs.
 *
 * Bentuk konstanta mengikuti yang SUDAH dipakai berkas itu:
 *
 *   pub(super) const IKON_X: &str        = manifest JSON (r##"..."##)
 *   pub(super) const IKON_X_JSON: &str   = icon theme JSON
 *   pub(super) const IKON_X_SVG_KODE: &str = isi satu berkas SVG
 *
 * Paket lama (glyph Unicode) DIGANTI, bukan ditambah: dua paket dengan id sama
 * akan membuat tabel PAKET menyebut id kembar, dan tes Rust menolaknya.
 */
const fs = require('fs');
const path = require('path');

const daftar = JSON.parse(fs.readFileSync('scratch/ikon/paket-svg.json', 'utf8'));
const AKAR = 'scratch/ikon/svg';

/* id "zephyr.ikon-belah" -> nama konstanta "IKON_BELAH" */
const namaKonst = (id) => 'IKON_' + id.replace(/^zephyr\.ikon-/, '').replace(/-/g, '_').toUpperCase();

/* SVG aman di dalam r##"..."## selama tidak ada `"##` di dalamnya. */
const aman = (s) => {
  if (s.includes('"##')) throw new Error('SVG memuat "## - tidak bisa masuk r##');
  return s;
};

const blok = [];

for (const p of daftar) {
  const kunci = p.id.replace(/^zephyr\.ikon-/, '');
  const K = namaKonst(p.id);

  /* Manifest: tulis ulang dengan path JSON yang benar (./icons/<kunci>.json). */
  const manifest = JSON.parse(p.manifest);
  manifest.contributes.iconThemes = [{ label: p.label, path: `./icons/${kunci}.json` }];

  blok.push(`pub(super) const ${K}: &str = r##"${aman(JSON.stringify(manifest))}"##;`);
  blok.push(`pub(super) const ${K}_JSON: &str = r##"${aman(p.json)}"##;`);

  /* Setiap SVG jadi konstanta sendiri. Nama berkas "folder-open.svg" ->
     ${K}_SVG_FOLDER_OPEN. */
  const folderIkon = path.join(AKAR, kunci, 'icons');
  for (const f of fs.readdirSync(folderIkon).filter((x) => x.endsWith('.svg')).sort()) {
    const nama = f.replace(/\.svg$/, '').replace(/-/g, '_').toUpperCase();
    const isi = fs.readFileSync(path.join(folderIkon, f), 'utf8').trim();
    blok.push(`pub(super) const ${K}_SVG_${nama}: &str = r##"${aman(isi)}"##;`);
  }
  blok.push('');
}

const hasil = blok.join('\n');

/* Ganti seluruh blok IKON SVG di extra.rs (antara penanda, atau di akhir). */
const jalur = 'src-tauri/src/ext_bundled_extra.rs';
let s = fs.readFileSync(jalur, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

const AWAL = '/* ══ IKON SVG (dihasilkan scratch/ikon-svg.cjs) ══ */';
const AKHIR = '/* ══ AKHIR IKON SVG ══ */';

const iA = s.indexOf(AWAL);
const iB = s.indexOf(AKHIR);
if (iA >= 0 && iB >= 0) {
  s = s.slice(0, iA) + s.slice(iB + AKHIR.length);
}

const isiBaru = [AWAL, hasil, AKHIR].join(eol);
s = s.trimEnd() + eol + eol + isiBaru + eol;

fs.writeFileSync(jalur, s, 'utf8');

/* Laporkan apa yang ditulis. */
const konst = (s.match(/pub\(super\) const IKON_[A-Z0-9_]+:/g) ?? []).length;
console.log('paket SVG ditulis:', daftar.length);
console.log('konstanta total di extra.rs:', konst);
console.log('contoh konstanta:', blok.slice(0, 4).map((b) => b.match(/const (\w+)/)?.[1]).join(', '));
console.log('blok SV G:', blok.filter((b) => /_SVG_/.test(b)).length);
