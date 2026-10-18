#!/usr/bin/env node
/*
 * verify-wiki-eksplorer.mjs — Repo Wiki + Outline/Timeline di Explorer.
 *
 * DUA HAL YANG DIKUNCI, dan keduanya kelas bug yang tidak terlihat tsc:
 *
 * 1. OUTLINE/TIMELINE PINDAH KE EXPLORER.
 *    Sebelumnya keduanya tombol tersendiri di ActivityBar. VS Code dan Qoder
 *    menaruhnya sebagai seksi lipat di BAWAH pohon berkas. Kesalahan yang mudah
 *    terjadi saat memindahkan: tombolnya dihapus dari rel TAPI seksinya tidak
 *    pernah dipasang - sehingga fiturnya hilang sama sekali, tanpa error.
 *
 * 2. ATLAS: DUA ARTEFAK, DUA PEMBACA (Map untuk manusia, Cards untuk agen).
 *    Map untuk manusia, Cards untuk agen. Yang diuji:
 *      - keduanya dihasilkan dari SATU jalan (bukan dua yang bisa berbeda),
 *      - `Generate` deterministik (nol jaringan, baca disk saja),
 *      - `Create With Plan` mengirim prompt, bukan mengaku sudah membuat,
 *      - ekspor menulis ke .zephyr/ dan MELAPORKAN jumlah nyata.
 *
 * Statis saja: tidak menyentuh app. Bukti perilaku ada di harness live terpisah.
 *
 * Usage: node scripts/verify-wiki-eksplorer.mjs [--verbose]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

let lulus = 0;
let gagal = 0;
const kegagalan = [];

function cek(nama, fn) {
  try {
    const catatan = fn();
    lulus++;
    console.log(`[LULUS] ${nama}`);
    if (verbose && catatan) console.log(`        ${catatan}`);
  } catch (e) {
    gagal++;
    const pesan = e instanceof Error ? e.message : String(e);
    kegagalan.push({ nama, pesan });
    console.log(`[GAGAL] ${nama}`);
    console.log(`        ${pesan}`);
  }
}

function baca(rel) {
  const p = join(AKAR, rel);
  if (!existsSync(p)) throw new Error(`berkas tidak ada: ${rel}`);
  return readFileSync(p, 'utf8');
}

function tanpaKomentar(isi) {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

console.log('=== verify-wiki-eksplorer ===\n');
console.log('Lapis 1 — Outline/Timeline pindah ke Explorer\n');

cek('ActivityBar tidak lagi punya tombol outline', () => {
  const ab = baca('src/components/shell/ActivityBar.tsx');
  const order = ab.match(/const ORDER: ActivityId\[\] = \[([\s\S]*?)\n\];/);
  if (!order) throw new Error('ORDER tidak ditemukan');
  if (order[1].includes("'outline'")) {
    throw new Error("'outline' masih ada di ORDER - rel akan punya tombol yang seksinya juga ada di Explorer");
  }
  return 'rel bersih';
});

cek('ExplorerPanel merender Outline DAN Timeline sebagai seksi lipat', () => {
  const ep = baca('src/components/explorer/ExplorerPanel.tsx');
  for (const [nama, testid] of [
    ['OutlinePanel', 'sec-outline'],
    ['TimelineView', 'sec-timeline'],
  ]) {
    if (!ep.includes(`<${nama}`)) throw new Error(`${nama} tidak dirender di Explorer`);
    if (!ep.includes(testid)) throw new Error(`seksi ${testid} tidak ada`);
  }
  if (!/<SectionLipat/.test(ep)) throw new Error('SectionLipat tidak dipakai');
  return '2 seksi';
});

cek('SectionLipat bisa diakses papan tuts dan melaporkan keadaannya', () => {
  const sl = baca('src/components/explorer/SectionLipat.tsx');
  /* A div with onClick looks the same and is invisible to a keyboard. */
  if (!/<button/.test(sl)) throw new Error('header seksi bukan <button> - tidak bisa diakses papan tuts');
  if (!/aria-expanded=/.test(sl)) throw new Error('tidak ada aria-expanded - pembaca layar tidak tahu terbuka/tidak');
  if (!/useState/.test(sl)) throw new Error('tidak ada state - seksi tidak bisa dilipat');
  return 'button + aria-expanded';
});

cek('CSS seksi lipat ada dan chevron-nya berputar', () => {
  const css = tanpaKomentar(baca('src/index.css'));
  for (const k of ['.sec-lipat', '.sec-lipat-head', '.sec-lipat-isi']) {
    if (!css.includes(k)) throw new Error(`${k} tidak punya aturan`);
  }
  if (!/\.sec-lipat-chev\.is-open/.test(css)) {
    throw new Error('chevron tidak punya keadaan terbuka - arahnya tidak akan berubah');
  }
  return 'lengkap';
});

console.log('\nLapis 2 — Repo Wiki\n');

cek('store wiki punya dua artefak dan opsi yang dibagi', () => {
  const st = baca('src/lib/wikiStore.ts');
  /* `entri: Record<WikiTab, EntriWiki[]>` - the two artefacts are keyed by tab,
     which is what keeps one walk feeding both without a second store. */
  if (!/Record<WikiTab, EntriWiki\[\]>/.test(st)) {
    throw new Error('dua artefak tidak dipisah per tab di store');
  }
  if (!/export type WikiTab = 'wiki' \| 'knowledge'/.test(st)) {
    throw new Error('WikiTab tidak mendeklarasikan kedua artefak');
  }
  for (const o of ['autoUpdate', 'autoExport', 'citation']) {
    if (!st.includes(o)) throw new Error(`opsi ${o} tidak ada`);
  }
  return '2 artefak, 3 opsi';
});

cek('generator membaca DISK, bukan mengarang', () => {
  const gen = baca('src/lib/wikiGen.ts');
  /* The whole value of this path is that every claim traces to a file. A model
     call here would produce a confident page about a codebase nobody checked. */
  if (!/cmd\.scanDir|scanDir\(/.test(gen)) throw new Error('tidak memindai direktori');
  if (!/cmd\.fsRead|fsRead\(/.test(gen)) throw new Error('tidak membaca berkas');
  for (const terlarang of ['fetch(', 'invoke(\'ai', 'aiStore']) {
    if (gen.includes(terlarang)) {
      throw new Error(`generator memakai "${terlarang}" - jalur ini harus deterministik dan luring`);
    }
  }
  return 'scanDir + fsRead, nol jaringan';
});

cek('ekspor menulis ke .zephyr/ dan melaporkan jumlah nyata', () => {
  const gen = baca('src/lib/wikiGen.ts');
  if (!/\.zephyr/.test(gen)) throw new Error('tidak menulis ke .zephyr/');
  /* A write that fails silently would let the pane claim an export that is not
     on disk - worse than no export. */
  if (!/ditulis/.test(gen) || !/gagal/.test(gen)) {
    throw new Error('ekspor tidak melaporkan berhasil/gagal');
  }
  return 'hitung + laporkan';
});

cek('Create With Plan mengirim prompt, bukan mengaku sudah membuat', () => {
  const page = baca('src/components/wiki/WikiPage.tsx');
  if (!/knowledge-plan/.test(page)) {
    throw new Error('prompt /knowledge-plan tidak ada - tombolnya jadi tidak menjelaskan apa pun');
  }
  if (!/zephyr-ai-isi|dispatchEvent/.test(page)) {
    throw new Error('prompt tidak dikirim ke chat');
  }
  /* It must NOT call the generator: this button hands the work to the agent. */
  const blok = page.match(/const buatRencana[\s\S]{0,900}?\n {2}\};/);
  if (blok && /hasilkanWiki/.test(blok[0])) {
    throw new Error('Create With Plan memanggil generator - dua jalur akan tertukar');
  }
  return 'kirim prompt';
});

cek('Generate memakai generator deterministik', () => {
  const page = baca('src/components/wiki/WikiPage.tsx');
  /* The handler is an arrow assigned to a const; matching its body by a fixed
     indent depth is brittle, so the check anchors on the function and reads a
     generous window instead. */
  const i = page.indexOf('const jalankan');
  if (i < 0) throw new Error('fungsi jalankan tidak ditemukan');
  const blok = page.slice(i, i + 2200);
  if (!/hasilkanWiki/.test(blok)) throw new Error('Generate tidak memanggil generator');
  if (!/setGalat/.test(blok)) {
    throw new Error('kegagalan tidak dilaporkan - tombol akan diam saat gagal');
  }
  return 'generator + galat';
});

cek('Wiki terpasang di Sidebar, ActivityBar, dan area editor', () => {
  const sb = baca('src/components/shell/Sidebar.tsx');
  if (!/case 'wiki'/.test(sb)) throw new Error('Sidebar tidak merender pane wiki');
  const ab = baca('src/components/shell/ActivityBar.tsx');
  if (!/'wiki'/.test(ab.match(/const ORDER[\s\S]*?\];/)?.[0] ?? '')) {
    throw new Error('wiki tidak ada di ORDER - tidak bisa dibuka dari rel');
  }
  const se = baca('src/components/shell/SplitEditor.tsx');
  if (!/WikiPage/.test(se)) throw new Error('halaman wiki tidak dirender di area editor');
  return '3 tempat';
});

cek('kunci i18n ada di kesepuluh kamus', () => {
  const i18n = baca('src/lib/i18n.ts');
  const wajib = ['Map', 'Cards', 'Generate Your Atlas', 'Create With Plan'];
  for (const k of wajib) {
    const pola = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':", 'g');
    const n = (i18n.match(pola) ?? []).length;
    if (n < 10) throw new Error(`"${k}" hanya di ${n} kamus, harus 10`);
  }
  return `${wajib.length} kunci x 10`;
});

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
if (gagal) {
  console.log('\nKegagalan:');
  for (const k of kegagalan) console.log(`  - ${k.nama}: ${k.pesan}`);
}
process.exit(gagal ? 1 : 0);
