/*
 * gen-skill-bundled.mjs - sematkan 21 skill bawaan ke dalam binary Rust.
 *
 * KENAPA
 * ------
 * Skills hidup sebagai berkas di `<workspace>\.zephyr\skills\`. Itu benar untuk
 * skill yang ditulis user, tapi salah untuk skill BAWAAN: aplikasi yang dipasang
 * orang tidak membawa folder `D:\Zephyr`, jadi 21 skill yang ada di repo ini
 * tidak pernah ikut ke mesin siapa pun. Terukur: `skills_list` mengembalikan 0
 * pada instalasi bersih.
 *
 * Jadi skill bawaan disematkan seperti paket ekstensi bawaan (`ext_bundled.rs`):
 * isinya masuk ke binary sebagai konstanta `&str`, dan `skills.rs` menanamnya ke
 * `%APPDATA%\zephyr\skills` sekali saat pertama jalan. Sesudah ditanam mereka
 * berkas biasa - bisa dibaca, diubah, dan dihapus user, persis seperti skill
 * yang mereka tulis sendiri.
 *
 * Pakai:
 *   node scripts/gen-skill-bundled.mjs          # tulis ulang src-tauri/src/skill_bundled.rs
 *   node scripts/gen-skill-bundled.mjs --check  # exit 1 kalau berkas tidak sinkron
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUMBER = join(akar, '.zephyr', 'skills');
const TUJUAN = join(akar, 'src-tauri', 'src', 'skill_bundled.rs');

/*
 * Skill yang TIDAK ikut dibundel.
 *
 * `modlens` butuh `scripts/run.ps1` dan `scripts/run.sh` (23 KB) yang
 * memanggil Python di mesin user, plus 4 dokumen referensi. Menyematkannya
 * berarti membawa alat yang bergantung pada lingkungan yang belum tentu ada -
 * dan gagalnya akan terlihat seperti skill yang rusak, bukan seperti
 * ketergantungan yang tidak terpasang. Ia tetap bisa dipasang dari katalog.
 */
const LEWATI = new Set(['modlens']);

function berkasSkill() {
  const out = [];
  if (!existsSync(SUMBER)) {
    throw new Error(`folder skill tidak ada: ${SUMBER}`);
  }
  const folder = readdirSync(SUMBER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !LEWATI.has(n))
    .sort();

  for (const nama of folder) {
    const dasar = join(SUMBER, nama);
    if (!existsSync(join(dasar, 'SKILL.md'))) continue;
    const isi = [];
    const telusuri = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          telusuri(p);
        } else {
          const rel = relative(dasar, p).replace(/\\/g, '/');
          isi.push([rel, readFileSync(p, 'utf8')]);
        }
      }
    };
    telusuri(dasar);
    out.push([nama, isi]);
  }
  if (!out.length) throw new Error('tidak ada skill yang terbaca');
  return out;
}

/* Escape untuk literal string Rust `r#"..."#`: pilih jumlah `#` yang aman. */
function literalRust(teks) {
  let pagar = 1;
  while (teks.includes('"'.repeat(1) + '#'.repeat(pagar)) || teks.includes('"#')) {
    pagar++;
    if (pagar > 20) throw new Error('teks mengandung terlalu banyak pagar');
  }
  return `r${'#'.repeat(pagar)}"${teks}"${'#'.repeat(pagar)}`;
}

const skill = berkasSkill();
const totalBerkas = skill.reduce((n, [, isi]) => n + isi.length, 0);
const totalByte = skill.reduce((n, [, isi]) => n + isi.reduce((m, [, t]) => m + Buffer.byteLength(t, 'utf8'), 0), 0);

const hash = createHash('sha256');
for (const [nama, isi] of skill) {
  hash.update(nama);
  for (const [rel, teks] of isi) hash.update(rel).update(teks);
}
const sidik = hash.digest('hex').slice(0, 16);

const konstanta = [];
const entri = [];
let i = 0;
for (const [nama, isi] of skill) {
  const berkasEntri = [];
  for (const [rel, teks] of isi) {
    const id = `SKILL_${i}`;
    konstanta.push(`const ${id}: &str = ${literalRust(teks)};`);
    berkasEntri.push(`        ("${rel}", ${id}),`);
    i++;
  }
  entri.push(`    (\n        "${nama}",\n        &[\n${berkasEntri.join('\n')}\n        ],\n    ),`);
}

const teks = `/* BERKAS HASIL GENERATE - jangan disunting tangan.
 * Dihasilkan oleh scripts/gen-skill-bundled.mjs dari .zephyr/skills/
 *
 * ${skill.length} skill, ${totalBerkas} berkas, ${(totalByte / 1024).toFixed(1)} KB
 * hash sumber: ${sidik}
 *
 * Kenapa disematkan: aplikasi yang dipasang user tidak membawa folder sumber,
 * jadi skill yang cuma ada di disk pengembang tidak pernah sampai ke mereka.
 * Isinya ditanam ke %APPDATA%\\zephyr\\skills sekali saat pertama jalan, lalu
 * menjadi berkas biasa yang boleh dibaca, diubah, dan dihapus user.
 *
 * Hasilkan ulang: node scripts/gen-skill-bundled.mjs
 * Periksa sinkron: node scripts/gen-skill-bundled.mjs --check
 */

${konstanta.join('\n\n')}

/// (nama folder, [(path relatif, isi)])
pub const SKILL_BAWAAN: &[(&str, &[(&str, &str)])] = &[
${entri.join('\n')}
];

/// Sidik isi bundel: dipakai untuk menanam ulang saat skill bawaan berubah
/// antar versi aplikasi, tanpa menimpa skill yang sudah diubah user.
pub const SKILL_BAWAAN_HASH: &str = "${sidik}";
`;

if (process.argv.includes('--check')) {
  const lama = existsSync(TUJUAN) ? readFileSync(TUJUAN, 'utf8') : '';
  if (lama !== teks) {
    console.error('skill_bundled.rs TIDAK sinkron dengan .zephyr/skills/. Jalankan: node scripts/gen-skill-bundled.mjs');
    process.exit(1);
  }
  console.log(`skill_bundled.rs sinkron (${skill.length} skill, ${totalBerkas} berkas, hash ${sidik})`);
  process.exit(0);
}

writeFileSync(TUJUAN, teks, 'utf8');
console.log(`ditulis: ${relative(akar, TUJUAN)}`);
console.log(`  ${skill.length} skill, ${totalBerkas} berkas, ${(totalByte / 1024).toFixed(1)} KB, hash ${sidik}`);
for (const [nama, isi] of skill) {
  console.log(`  ${nama.padEnd(34)} ${isi.length} berkas`);
}
