/*
 * Bersihkan SEMUA konstanta IKON_* lama dari ext_bundled_extra.rs, lalu tulis
 * ulang paket SVG.
 *
 * Kenapa harus dibersihkan dulu: nama konstanta diturunkan dari id paket, jadi
 * paket baru "zephyr.ikon-belah" menghasilkan IKON_BELAH - nama yang PERSIS sama
 * dengan paket glyph lama. Rust menolak nama kembar, dan yang benar bukan
 * mengganti nama baru (nama itu yang diinginkan), melainkan membuang yang lama.
 *
 * Konstanta NON-ikon (tema, keymap, snippet) tidak disentuh: mereka punya nama
 * lain dan masih dipakai tabel PAKET.
 */
const fs = require('fs');
const path = require('path');

const jalur = 'src-tauri/src/ext_bundled_extra.rs';
let s = fs.readFileSync(jalur, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';

const sebelum = (s.match(/pub\(super\) const IKON_[A-Z0-9_]+:/g) ?? []).length;

/*
 * Buang setiap definisi `pub(super) const IKON_X...: &str = r##"..."##;`
 * Definisi ini selalu satu blok yang dibuka dengan r##" dan ditutup "##;
 */
const reDef = /pub\(super\) const IKON_[A-Z0-9_]+: &str = r##"[\s\S]*?"##;\s*\n?/g;
s = s.replace(reDef, '');

/* Buang penanda blok SVG lama kalau ada. */
for (const tanda of [
  /\/\* ══ IKON SVG \(dihasilkan scratch\/ikon-svg\.cjs\) ══ \*\/\n?/g,
  /\/\* ══ AKHIR IKON SVG ══ \*\/\n?/g,
]) {
  s = s.replace(tanda, '');
}

fs.writeFileSync(jalur, s.trimEnd() + eol, 'utf8');

const sesudah = (fs.readFileSync(jalur, 'utf8').match(/pub\(super\) const IKON_[A-Z0-9_]+:/g) ?? []).length;
const lain = (fs.readFileSync(jalur, 'utf8').match(/pub\(super\) const (?!IKON_)[A-Z0-9_]+:/g) ?? []).length;

console.log('konstanta IKON_ sebelum :', sebelum);
console.log('konstanta IKON_ sesudah :', sesudah);
console.log('konstanta lain (aman)   :', lain);
