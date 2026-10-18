/* Perbarui harness lama: 8 tema -> 11 tema, glyph -> SVG. */
const fs = require('fs');

const ubah = (berkas, pasangan) => {
  let s = fs.readFileSync(berkas, 'utf8');
  let n = 0;
  for (const [dari, ke] of pasangan) {
    if (s.includes(dari)) {
      s = s.split(dari).join(ke);
      n++;
    }
  }
  fs.writeFileSync(berkas, s, 'utf8');
  console.log(`${berkas}: ${n}/${pasangan.length} diganti`);
};

ubah('scripts/verify-ikon-berubah.mjs', [
  ["cek('ada 8 paket', (d.paket ?? []).length === 8, String((d.paket ?? []).length));",
   "cek('ada 11 paket', (d.paket ?? []).length === 11, String((d.paket ?? []).length));"],
]);

ubah('scripts/verify-tema-folder.mjs', [
  ["cek('8 tema terpasang', (d.paket ?? []).length === 8, String((d.paket ?? []).length));",
   "cek('11 tema terpasang', (d.paket ?? []).length === 11, String((d.paket ?? []).length));"],
]);

/*
 * verify-ikon-folder menguji GLYPH (`ikon.glyph`), padahal semua tema sekarang
 * SVG. Yang benar diuji: apakah SVG-nya ada dan dipakai. Diganti, bukan dihapus,
 * supaya klaimnya tetap diperiksa.
 */
let f = fs.readFileSync('scripts/verify-ikon-folder.mjs', 'utf8');
f = f.split("cek('folder punya glif', !!d.sesudah?.folder?.glif, String(d.sesudah?.folder?.glif));")
  .join("cek('folder punya gambar (svg)', !!d.sesudah?.folder?.svg || !!d.sesudah?.folder?.glif, d.sesudah?.folder?.svg ? 'svg' : String(d.sesudah?.folder?.glif));");
f = f.split("cek('berkas punya glif', !!d.sesudah?.file?.glif, String(d.sesudah?.file?.glif));")
  .join("cek('berkas punya gambar (svg)', !!d.sesudah?.file?.svg || !!d.sesudah?.file?.glif, d.sesudah?.file?.svg ? 'svg' : String(d.sesudah?.file?.glif));");
f = f.split("cek(\n  'glif folder benar-benar dirender',\n  domPaket.length > 0 && domPaket.every((x) => !!x.glif),")
  .join("cek(\n  'folder benar-benar dirender',\n  domPaket.length > 0 && domPaket.every((x) => !!x.glif || !!x.svg),");
fs.writeFileSync('scripts/verify-ikon-folder.mjs', f, 'utf8');
console.log('scripts/verify-ikon-folder.mjs: diperbarui');
