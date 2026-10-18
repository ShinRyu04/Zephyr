/*
 * Remove the duplicate theme constants the second run of tambah-tema.mjs added.
 *
 * The script guards on `id: "..."` inside the manifest, but on the second run the
 * manifest of the FIRST copy already contained that id - so the guard passed for
 * a DIFFERENT reason than intended and appended a second copy. This removes the
 * later copy of each duplicated constant, keeping the first.
 *
 * Run once: node scratch/buang-tema-duplikat.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src-tauri/src/ext_bundled_extra.rs';
const s = readFileSync(P, 'utf8');

/** A constant block: `pub(super) const NAME: &str = r##"..."##;` */
const RE = /pub\(super\) const (TEMA_[A-Z_]+): &str = r##"[\s\S]*?"##;\r?\n?/g;

const dilihat = new Set();
let hasil = '';
let akhir = 0;
let dibuang = 0;

for (const m of s.matchAll(RE)) {
  hasil += s.slice(akhir, m.index);
  if (dilihat.has(m[1])) {
    /* Second copy: drop it entirely. */
    dibuang++;
  } else {
    dilihat.add(m[1]);
    hasil += m[0];
  }
  akhir = m.index + m[0].length;
}
hasil += s.slice(akhir);

/* Collapse the blank-line pile the removals can leave behind. */
hasil = hasil.replace(/\r?\n{4,}/g, '\n\n\n');

writeFileSync(P, hasil);
console.log(`ok: ${dibuang} definisi duplikat dibuang`);
