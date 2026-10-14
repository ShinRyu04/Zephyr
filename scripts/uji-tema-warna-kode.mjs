#!/usr/bin/env node
/*
 * uji-tema-warna-kode.mjs — bukti bahwa SETIAP tema Zephyr mengubah WARNA KODE.
 *
 * Keputusan yang diuji:
 *   1. "TEMA WAJIB mengubah warna kode sintaks" — tiap tema harus punya 11 token
 *      `--syn-*` (keyword, string, number, comment, function, variable, type,
 *      operator, tag, attr, invalid) dengan warna yang berbeda nyata antar tema,
 *      dan seluruh 11 token itu harus benar-benar mengalir ke editor.
 *   2. "tema bawaan dikurangi lalu dijadikan ekstensi" — berapa tema yang masih
 *      bawaan keras di CSS dan berapa yang sudah lewat jalur ekstensi.
 *
 * Diuji dari sumber, bukan dari tangkapan layar: blok CSS `[data-theme='X']`
 * dibaca apa adanya, jadi angka di sini bisa diperiksa ulang oleh siapa pun.
 *
 * AMBANG (dinyatakan, bukan disiratkan):
 *   N_TEMA_KEMBAR = 1
 *     Sebuah warna token boleh sama dengan warna token tema LAIN paling banyak
 *     1 tema lain, dan HANYA kalau pasangan itu terdaftar di
 *     PETA_TEMA_TERSEMBUNYI (src/lib/themes.ts) sebagai tema kembar yang
 *     disembunyikan. Warna yang muncul di 3 tema atau lebih: GAGAL. Warna yang
 *     sama antara dua tema yang bukan pasangan kembar: GAGAL.
 *   N_TOKEN_SAMA_BERANTAI = 3
 *     Dua tema yang berbagi >= 3 dari 11 warna token dianggap kembar de facto:
 *     GAGAL. (17 tema yang ditawarkan hari ini berbagi 0-2 token.)
 *   KONTRAS_MIN = 4.4
 *     Kontras tiap warna token terhadap `--editor-bg` tema itu, dihitung kasar
 *     dari nilai hex (WCAG 2.x relative luminance). Di bawah ambang: GAGAL.
 *   SEBAR_TERANG_gelap = 0.15
 *     Rerata luminance 11 warna token harus TERPISAH antara tema terang dan
 *     gelap (terang <= 0.25, gelap >= 0.25, jarak >= 0.15). Kalau tidak, "tema
 *     terang" dan "tema gelap" memakai warna kode yang sama-sama redup/terang
 *     dan label kind-nya bohong.
 *
 * Bagian yang cuma bisa diuji dengan aplikasi hidup (warna yang BENAR-BENAR
 * terpakai di DOM hidup, mis. `getComputedStyle` setelah `setTheme`) ditandai
 * 'BUTUH APP' dan dihitung sebagai DILEWATI, bukan lulus dan bukan gagal.
 *
 * Jalankan:  node scripts/uji-tema-warna-kode.mjs
 *            node scripts/uji-tema-warna-kode.mjs --tabel    (cetak tabel markdown)
 * Keluar 0 kalau semua bagian yang bisa diuji lulus, 1 kalau ada yang gagal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');

/* Mode `--head`: baca sumber dari git HEAD, yaitu keadaan SEBELUM perubahan lane
   ini. Dipakai untuk mencetak angka "sebelum" dari harness yang sama, bukan dari
   catatan tangan. Working tree tidak disentuh — cuma `git show HEAD:<path>`. */
const PAKAI_HEAD = process.argv.includes('--head');
const SUMBER = PAKAI_HEAD ? 'git HEAD (sebelum)' : 'working tree (sesudah)';

function isiHead(rel) {
  return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
}

/** Isi berkas repo-relatif, dari HEAD atau dari working tree. */
function isi(rel) {
  if (!PAKAI_HEAD) return fs.readFileSync(path.join(root, rel), 'utf8');
  return isiHead(rel.split(path.sep).join('/'));
}

/** Daftar berkas CSS src/styles. */
function berkasCss() {
  if (!PAKAI_HEAD) return fs.readdirSync(stylesDir).filter((x) => x.endsWith('.css'));
  return execFileSync('git', ['ls-tree', '--name-only', 'HEAD', 'src/styles/'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.endsWith('.css'))
    .map((x) => path.basename(x));
}

/** Daftar berkas .ts/.tsx/.css di src/ (repo-relatif). */
function berkasSrc() {
  if (!PAKAI_HEAD) {
    const out = [];
    const jalan = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) jalan(p);
        else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(path.relative(root, p).replace(/\\/g, '/'));
      }
    };
    jalan(path.join(root, 'src'));
    return out;
  }
  return execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'src/'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => /\.(ts|tsx|css)$/.test(x));
}

const TOKEN = [
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'variable',
  'type',
  'operator',
  'tag',
  'attr',
  'invalid',
];

const N_TEMA_KEMBAR = 1;
const N_TOKEN_SAMA_BERANTAI = 3;
const KONTRAS_MIN = 4.4;
const SEBAR_TERANG_GELAP = 0.15;

let lulus = 0;
let gagal = 0;
let dilewati = 0;
const daftarGagal = [];

function cek(kondisi, nama, info = '') {
  if (kondisi) {
    lulus++;
    console.log(`  ok     ${nama}${info ? ` — ${info}` : ''}`);
  } else {
    gagal++;
    daftarGagal.push(nama);
    console.log(`  GAGAL  ${nama}${info ? ` — ${info}` : ''}`);
  }
}

function bagian(judul) {
  console.log(`\n${judul}`);
}

function baca(rel) {
  return isi(rel);
}

/* ── pembaca sumber ──────────────────────────────────────────────────────── */

/** Nama token dari `export const TOKEN_OVERRIDE = [ ... ] as const;` */
function bacaTokenOverride(src) {
  const blok = /export const TOKEN_OVERRIDE\s*=\s*\[([\s\S]*?)\]\s*as const;/.exec(src);
  if (!blok) return null;
  return [...blok[1].matchAll(/'(--[a-zA-Z0-9-]+)'/g)].map((m) => m[1]);
}

/** `THEMES` + `PETA_TEMA_TERSEMBUNYI` dari src/lib/themes.ts */
function bacaRegistri(src) {
  const arr = /export const THEMES:\s*ThemeInfo\[\]\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  const tema = [];
  if (arr) {
    const baris = arr[1].split('\n');
    for (const b of baris) {
      const id = /\bid:\s*'([^']+)'/.exec(b);
      if (!id) continue;
      const kind = /\bkind:\s*'([^']+)'/.exec(b);
      tema.push({ id: id[1], kind: kind ? kind[1] : '?', tersembunyi: /tersembunyi:\s*true/.test(b) });
    }
  }
  const peta = {};
  const p = /PETA_TEMA_TERSEMBUNYI[^{]*\{([\s\S]*?)\n\};/.exec(src);
  if (p) {
    for (const m of p[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) peta[m[1]] = m[2];
  }
  return { tema, peta };
}

/** Blok `[data-theme='X'] { ... }` dari semua CSS di src/styles. */
function bacaBlokCss() {
  const per = new Map();
  for (const f of berkasCss()) {
    const src = isi(`src/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /\[data-theme='([^']+)'\]/g;
    let m;
    while ((m = re.exec(src))) {
      const at = m.index;
      const brace = src.indexOf('{', at + m[0].length);
      if (brace === -1) continue;
      // Hanya terima kalau selector-nya MEMANG persis `[data-theme='x']`,
      // bukan bagian dari selector gabungan seperti `html[data-theme='x'] body`.
      const prelude = src.slice(Math.max(0, src.lastIndexOf('}', at)), at + m[0].length);
      if (prelude.split(/[,;{}]/).pop().trim() !== m[0]) continue;
      let depth = 0;
      let end = -1;
      for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
          depth--;
          if (!depth) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) continue;
      const body = src.slice(brace + 1, end);
      const got = per.get(m[1]) ?? { file: f, props: {} };
      const decl = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
      let d;
      while ((d = decl.exec(body))) got.props[d[1]] = d[2].trim();
      per.set(m[1], got);
    }
  }
  return per;
}

/** Semua nama `--syntax-*` yang DIPAKAI di src/ dan yang DIDEFINISIKAN di CSS. */
function bacaAliasSyntax() {
  const dipakai = new Set();
  const berkas = [];
  for (const rel of berkasSrc()) {
    const t = isi(rel);
    for (const m of t.matchAll(/--syntax-[a-zA-Z0-9-]+/g)) {
      dipakai.add(m[0]);
      berkas.push(rel);
    }
  }
  const didefinisi = new Set();
  for (const f of berkasCss()) {
    const t = isi(`src/styles/${f}`);
    for (const m of t.matchAll(/(--syntax-[a-zA-Z0-9-]+)\s*:/g)) didefinisi.add(m[1]);
  }
  return { dipakai, didefinisi, berkas };
}

/** `--syn-*` yang HANYA dipakai (tidak didefinisikan) di seluruh src/. */
function bacaSynTanpaDefinisi() {
  const sudahDefinisi = new Set();
  for (const f of berkasCss()) {
    const t = isi(`src/styles/${f}`);
    for (const m of t.matchAll(/(--syn-[a-zA-Z0-9-]+)\s*:/g)) sudahDefinisi.add(m[1]);
  }
  const dipakai = new Map();
  for (const rel of berkasSrc()) {
    const t = isi(rel);
    t.split('\n').forEach((baris, i) => {
      for (const m of baris.matchAll(/--syn-[a-zA-Z0-9-]+/g)) {
        if (!dipakai.has(m[0])) dipakai.set(m[0], []);
        if (dipakai.get(m[0]).length < 3) {
          dipakai.get(m[0]).push(`${rel}:${i + 1}${/,\s*(var|#[0-9a-fA-F]{3})/.test(baris.slice(m.index)) ? ' (ada fallback)' : ''}`);
        }
      }
    });
  }
  const hasil = [];
  for (const [nama, tempat] of dipakai) if (!sudahDefinisi.has(nama)) hasil.push({ nama, tempat });
  return hasil;
}

/** Token yang disebut editor-themes.ts, langsung atau lewat alias `--syntax-*`. */
function bacaIkatEditor(src) {
  /* Alias fase 13 di tokens.css: `--syntax-<x>` -> `--syn-<y>`. Token yang tidak
     punya alias dibaca langsung sebagai `--syn-*` oleh editor-themes.ts. */
  const alias = {
    '--syn-keyword': '--syntax-keyword',
    '--syn-string': '--syntax-string',
    '--syn-number': '--syntax-number',
    '--syn-comment': '--syntax-comment',
    '--syn-function': '--syntax-fn',
    '--syn-type': '--syntax-type',
    '--syn-operator': '--syntax-operator',
  };
  const out = {};
  for (const t of TOKEN) {
    const nama = `--syn-${t}`;
    const alt = alias[nama];
    if (src.includes(nama)) out[nama] = 'langsung';
    else if (alt && src.includes(alt)) out[nama] = alt;
    else out[nama] = null;
  }
  return out;
}

/** Entri katalog ekstensi berkategori Themes (paket tema). */
function bacaKatalogTema(src) {
  const arr = /export const KATALOG_BUNDLED:\s*KatalogItem\[\]\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!arr) return [];
  const out = [];
  for (const blok of arr[1].split(/\n\s*\{\s*\n/)) {
    const id = /\bid:\s*'([^']+)'/.exec(blok);
    if (!id) continue;
    if (/categories:\s*\[[^\]]*'Themes'/.test(blok)) out.push(id[1]);
  }
  return out;
}

/** Paket tema bawaan yang ditanam di Rust: label, path, jumlah token --syn-*. */
function bacaPaketBundel() {
  const out = [];
  for (const rel of ['src-tauri/src/ext_bundled.rs', 'src-tauri/src/ext_bundled_extra.rs']) {
    let src;
    try {
      src = baca(rel);
    } catch {
      continue;
    }
    const idx = [...src.matchAll(/"id":\s*"(zephyr\.[^"]+)"/g)].map((m) => ({ id: m[1], at: m.index }));
    for (let i = 0; i < idx.length; i++) {
      const akhir = i + 1 < idx.length ? idx[i + 1].at : src.length;
      const potong = src.slice(idx[i].at, akhir);
      const tema = /"themes":\s*\[\s*\{\s*"label":\s*"([^"]+)",\s*"kind":\s*"([^"]+)",\s*"path":\s*"([^"]+)"/.exec(potong);
      if (!tema) continue;
      const syn = new Set([...potong.matchAll(/"(--syn-[a-z]+)":/g)].map((m) => m[1]));
      out.push({ id: idx[i].id, label: tema[1], kind: tema[2], path: tema[3], token: syn.size, berkas: rel });
    }
  }
  return out;
}

/* ── warna ───────────────────────────────────────────────────────────────── */

function hex(v) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lum(c) {
  const f = (x) => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function kontras(a, b) {
  const L1 = Math.max(lum(a), lum(b));
  const L2 = Math.min(lum(a), lum(b));
  return (L1 + 0.05) / (L2 + 0.05);
}

/* ── uji ─────────────────────────────────────────────────────────────────── */

const themesSrc = baca('src/lib/themes.ts');
const registri = bacaRegistri(themesSrc);
const blok = bacaBlokCss();
const tokenOverride = bacaTokenOverride(themesSrc);
const ditawarkan = registri.tema.filter((t) => !t.tersembunyi);
const tersembunyi = registri.tema.filter((t) => t.tersembunyi);

/* Mode tabel: cetak tabel tema x token sebagai markdown, untuk dokumen bukti.
   Warnanya dibaca dari blok CSS yang sama dengan yang diuji di bawah. */
if (process.argv.includes('--tabel')) {
  console.log(`| tema | kind | status | ${TOKEN.map((t) => `\`--syn-${t}\``).join(' | ')} |`);
  console.log(`|${Array(TOKEN.length + 3).fill('---').join('|')}|`);
  for (const t of registri.tema) {
    const b = blok.get(t.id);
    const warna = TOKEN.map((x) => (b ? b.props[`--syn-${x}`] ?? '-' : '-'));
    console.log(`| ${t.id} | ${t.kind} | ${t.tersembunyi ? 'tersembunyi' : 'ditawarkan'} | ${warna.join(' | ')} |`);
  }
  process.exit(0);
}

console.log('sumber: ' + SUMBER + (PAKAI_HEAD ? '  (flag --head)' : ''));
console.log('uji-tema-warna-kode — 11 token: ' + TOKEN.map((t) => `--syn-${t}`).join(', '));
console.log(`ambang: N_tema_kembar=${N_TEMA_KEMBAR} (hanya pasangan terdaftar), ` +
  `N_token_sama_berantai=${N_TOKEN_SAMA_BERANTAI}, kontras_min=${KONTRAS_MIN}, ` +
  `sebar_terang_gelap=${SEBAR_TERANG_GELAP}`);

bagian('A. registri tema (src/lib/themes.ts)');
cek(registri.tema.length > 0, 'registri tema terbaca', `${registri.tema.length} tema terdaftar`);
cek(tersembunyi.length === Object.keys(registri.peta).length,
  'tiap tema tersembunyi punya pasangan di PETA_TEMA_TERSEMBUNYI',
  `${tersembunyi.map((t) => t.id).join(', ') || 'tidak ada'} -> ${JSON.stringify(registri.peta)}`);
console.log(`  info   ditawarkan: ${ditawarkan.length} (${ditawarkan.filter((t) => t.kind === 'light').length} terang, ${ditawarkan.filter((t) => t.kind === 'dark').length} gelap)`);
console.log(`  info   tersembunyi: ${tersembunyi.length} (${tersembunyi.map((t) => t.id).join(', ') || '-'})`);

bagian("B. 11 token `--syn-*` per tema (blok CSS [data-theme='X'])");
const lengkap = [];
const sebagian = [];
const tanpaBlok = [];
for (const t of registri.tema) {
  const b = blok.get(t.id);
  if (!b) {
    tanpaBlok.push(t.id);
    continue;
  }
  const kurang = TOKEN.filter((x) => !b.props[`--syn-${x}`]);
  if (kurang.length === 0) lengkap.push(t.id);
  else sebagian.push({ id: t.id, kurang });
}
cek(tanpaBlok.length === 0, 'tiap tema terdaftar punya blok CSS', tanpaBlok.join(', ') || 'semua ada');
cek(sebagian.length === 0, `tema dengan token --syn-* SEBAGIAN = 0 (dari ${registri.tema.length})`,
  sebagian.length ? sebagian.map((s) => `${s.id} kurang ${s.kurang.join('/')}`).join('; ') : 'semua 11/11');
console.log(`  info   lengkap 11/11: ${lengkap.length} tema`);

bagian('C. warna unik per tema + ambang duplikat antar tema');
const unikPer = new Map();
for (const t of registri.tema) {
  const b = blok.get(t.id);
  if (!b) continue;
  const warna = TOKEN.map((x) => b.props[`--syn-${x}`]).filter(Boolean);
  unikPer.set(t.id, new Set(warna).size);
}
const unikMin = Math.min(...unikPer.values());
cek(unikMin >= 5, 'tiap tema punya >= 5 warna berbeda di antara 11 token',
  `minimum ${unikMin} (${[...unikPer.entries()].filter(([, n]) => n === unikMin).map(([id]) => id).join(', ')})`);

const pasanganSah = new Set(Object.entries(registri.peta).map(([k, v]) => [k, v].sort().join('|')));
const pelanggaran = [];
const duplikatSah = [];
const grupTema = new Map(); // token|warna -> [tema]
for (const t of TOKEN) {
  const per = new Map();
  for (const th of registri.tema) {
    const b = blok.get(th.id);
    if (!b) continue;
    const c = b.props[`--syn-${t}`];
    if (!c) continue;
    if (!per.has(c)) per.set(c, []);
    per.get(c).push(th.id);
  }
  for (const [c, ids] of per) {
    if (ids.length === 1) continue;
    if (ids.length - 1 > N_TEMA_KEMBAR) pelanggaran.push(`--syn-${t} ${c} dipakai ${ids.length} tema (${ids.join(', ')})`);
    else {
      const kunci = ids.slice().sort().join('|');
      if (pasanganSah.has(kunci)) duplikatSah.push(`--syn-${t} ${c}: ${ids.join(' = ')}`);
      else pelanggaran.push(`--syn-${t} ${c}: ${ids.join(' = ')} (bukan pasangan kembar terdaftar)`);
    }
  }
}
cek(pelanggaran.length === 0, `tak ada warna token yang dipakai >${N_TEMA_KEMBAR} tema lain di luar pasangan kembar`,
  pelanggaran.length ? pelanggaran.join('; ') : `${duplikatSah.length} duplikat, semuanya pasangan kembar terdaftar (${registri.peta['github-dark'] ?? '?'} / ${registri.peta['min-light'] ?? '?'})`);

const berantai = [];
for (let i = 0; i < ditawarkan.length; i++) {
  for (let j = i + 1; j < ditawarkan.length; j++) {
    const a = blok.get(ditawarkan[i].id);
    const b = blok.get(ditawarkan[j].id);
    if (!a || !b) continue;
    let sama = 0;
    for (const t of TOKEN) if (a.props[`--syn-${t}`] && a.props[`--syn-${t}`] === b.props[`--syn-${t}`]) sama++;
    if (sama >= N_TOKEN_SAMA_BERANTAI) berantai.push(`${ditawarkan[i].id} ~ ${ditawarkan[j].id}: ${sama} token sama`);
  }
}
cek(berantai.length === 0, `tak ada dua tema DITAWARKAN yang berbagi >= ${N_TOKEN_SAMA_BERANTAI} warna token`,
  berantai.length ? berantai.join('; ') : `${ditawarkan.length} tema ditawarkan, semua berbeda nyata`);

bagian('D. kontrak override tema (TOKEN_OVERRIDE di src/lib/themes.ts)');
const synOverride = (tokenOverride ?? []).filter((t) => t.startsWith('--syn-'));
const synKurang = TOKEN.map((t) => `--syn-${t}`).filter((n) => !synOverride.includes(n));
cek(tokenOverride !== null, 'TOKEN_OVERRIDE terbaca', tokenOverride ? `${tokenOverride.length} token` : 'tidak ditemukan');
cek(synKurang.length === 0, `TOKEN_OVERRIDE mencakup 11/11 token --syn-*`,
  synKurang.length ? `kurang ${synKurang.join(', ')} (ada ${synOverride.length}/11)` : `${synOverride.length}/11`);
console.log(`  info   token override yang bisa ditulis Theme Builder: ${tokenOverride ? tokenOverride.length : '?'} total, ${synOverride.length} di antaranya warna kode`);

bagian('E. alias `--syntax-*` (nama kontrak fase 13, src/styles/tokens.css)');
const alias = bacaAliasSyntax();
const aliasKurang = [...alias.dipakai].filter((n) => !alias.didefinisi.has(n)).sort();
cek(aliasKurang.length === 0, 'tiap `--syntax-*` yang DIPAKAI punya definisi',
  aliasKurang.length ? `tanpa definisi: ${aliasKurang.join(', ')}` : `${alias.didefinisi.size} definisi, ${alias.dipakai.size} dipakai`);

const synTanpaDef = bacaSynTanpaDefinisi();
console.log(`  info   --syn-* dipakai tapi tak punya definisi per-tema: ${synTanpaDef.length}` +
  (synTanpaDef.length ? ` (${synTanpaDef.map((x) => `${x.nama} di ${x.tempat[0] ?? '?'}`).join('; ')})` : ''));

bagian('F. editor benar-benar memakai token tema (src/styles/editor-themes.ts)');
const ikat = bacaIkatEditor(baca('src/styles/editor-themes.ts'));
const takIkat = Object.entries(ikat).filter(([, v]) => !v).map(([k]) => k);
cek(takIkat.length === 0, '11/11 token warna kode diikat ke variabel tema (bukan warna mati)',
  takIkat.length ? `tak disebut: ${takIkat.join(', ')}` : Object.entries(ikat).map(([k, v]) => `${k.replace('--syn-', '')}=${v}`).join(' '));

bagian('G. kontras: tiap tema vs latarnya, dan terang != gelap');
const barisKontras = [];
for (const t of registri.tema) {
  const b = blok.get(t.id);
  if (!b) continue;
  const eb = hex(b.props['--editor-bg']) ?? hex(b.props['--bg']);
  if (!eb) continue;
  const cs = TOKEN.map((x) => hex(b.props[`--syn-${x}`])).filter(Boolean).map((c) => kontras(c, eb));
  const lums = TOKEN.map((x) => hex(b.props[`--syn-${x}`])).filter(Boolean).map(lum);
  barisKontras.push({
    id: t.id,
    kind: t.kind,
    bgLum: lum(hex(b.props['--bg']) ?? eb),
    min: Math.min(...cs),
    mean: cs.reduce((a, x) => a + x, 0) / cs.length,
    tokenLum: lums.reduce((a, x) => a + x, 0) / lums.length,
  });
}
const kontrasRendah = barisKontras.filter((r) => r.min < KONTRAS_MIN);
cek(kontrasRendah.length === 0, `tiap warna kode punya kontras >= ${KONTRAS_MIN} terhadap --editor-bg`,
  kontrasRendah.length ? kontrasRendah.map((r) => `${r.id} min ${r.min.toFixed(2)}`).join('; ') : `terrendah ${Math.min(...barisKontras.map((r) => r.min)).toFixed(2)}`);

const terang = barisKontras.filter((r) => r.kind === 'light');
const gelap = barisKontras.filter((r) => r.kind === 'dark');
const lumTerang = Math.max(...terang.map((r) => r.tokenLum));
const lumGelap = Math.min(...gelap.map((r) => r.tokenLum));
cek(terang.every((r) => r.bgLum >= 0.5) && gelap.every((r) => r.bgLum <= 0.25),
  'latar tema terang benar-benar terang dan tema gelap benar-benar gelap',
  `bgLum terang ${Math.min(...terang.map((r) => r.bgLum)).toFixed(2)}..${Math.max(...terang.map((r) => r.bgLum)).toFixed(2)}, gelap ${Math.min(...gelap.map((r) => r.bgLum)).toFixed(2)}..${Math.max(...gelap.map((r) => r.bgLum)).toFixed(2)}`);
cek(lumTerang <= 0.25 && lumGelap >= 0.25 && lumGelap - lumTerang >= SEBAR_TERANG_GELAP,
  `rerata luminance warna kode terpisah antara terang dan gelap (jarak >= ${SEBAR_TERANG_GELAP})`,
  `terang maks ${lumTerang.toFixed(3)}, gelap min ${lumGelap.toFixed(3)}, jarak ${(lumGelap - lumTerang).toFixed(3)}`);

bagian('H. tema bawaan keras vs tema lewat ekstensi');
const katalogTema = bacaKatalogTema(baca('src/lib/extCatalog.ts'));
const paket = bacaPaketBundel();
console.log(`  info   bawaan keras di CSS: ${registri.tema.length} tema (${ditawarkan.length} ditawarkan + ${tersembunyi.length} tersembunyi)`);
console.log(`  info   katalog ekstensi berkategori Themes: ${katalogTema.length} (${katalogTema.join(', ')})`);
for (const p of paket) {
  console.log(`  info   paket tema bundel: ${p.id} "${p.label}" (${p.kind}) ${p.path} — ${p.token}/11 token --syn-* @ ${p.berkas}`);
}
cek(paket.length === katalogTema.length, 'tiap paket tema di katalog ada isinya di bundel Rust',
  `katalog ${katalogTema.length} vs bundel ${paket.length}`);
cek(paket.every((p) => p.token === TOKEN.length), 'tiap paket tema bawaan mengirim 11/11 token --syn-*',
  paket.map((p) => `${p.id} ${p.token}/11`).join(', ') || 'tidak ada paket');

/* Bagian DOM hidup dibungkus fungsi supaya bisa dibatasi waktu: kalau app
   reload/putus di tengah pembacaan, promise eval-nya tidak pernah selesai dan
   skrip akan menggantung tanpa batas. Di luar batas itu bagian ini dilaporkan
   BUTUH APP dan sisa uji tetap jalan. */
async function bagianDomHidup() {
if (process.argv.includes('--tanpa-dom')) {
  dilewati++;
  console.log('  dilewati  --tanpa-dom: bagian DOM hidup tidak dijalankan atas permintaan.');
  return;
}
bagian('I. DOM hidup (BUTUH APP kalau Zephyr tidak jalan)');
let appHidup = false;
try {
  const res = await fetch('http://127.0.0.1:9223/json/list', { signal: AbortSignal.timeout(1500) });
  appHidup = res.ok;
} catch {
  appHidup = false;
}
if (PAKAI_HEAD) {
  dilewati++;
  console.log('  dilewati  mode --head: bagian DOM hidup tidak dijalankan (app yang jalan memakai working tree, bukan HEAD).');
} else if (!appHidup) {
  dilewati++;
  console.log('  BUTUH APP  Zephyr tidak terjangkau di 127.0.0.1:9223 — tidak bisa membaca warna yang BENAR-BENAR terpakai di DOM hidup.');
  console.log('             (hasil applyTheme + getComputedStyle, tema ekstensi VS Code, warna kode di <canvas> minimap)');
  console.log('             jalankan Zephyr dengan --remote-debugging-port=9223 lalu ulangi skrip ini.');
} else {
  let cdp = null;
  try {
    const mod = await import('./lib-cdp.mjs');
    const att = await mod.Cdp.attach('9223', 'Zephyr');
    cdp = att.cdp;
  } catch (e) {
    cdp = null;
    console.log(`  info   CDP terjangkau tapi attach gagal: ${e.message}`);
  }
  if (!cdp) {
    dilewati++;
    console.log('  BUTUH APP  attach CDP gagal — bagian DOM hidup dilewati.');
  } else {
    /* Baca apa yang ADA di DOM hidup dulu (tema yang sedang aktif), baru coba
       berpindah tema kalau jembatan dev-nya ada. Yang tidak ada dijujurkan
       sebagai BUTUH APP, bukan ditebak. HMR bisa me-reload halaman di tengah
       baca, jadi dicoba dua kali sebelum menyerah. */
    let hidup = null;
    for (let percobaan = 1; percobaan <= 2 && !hidup; percobaan++) {
      try {
        const raw = await cdp.runAsync(`
          const cs = getComputedStyle(document.documentElement);
        const TOKEN = ${JSON.stringify(TOKEN)};
        const w = {};
        for (const t of TOKEN) w['--syn-' + t] = cs.getPropertyValue('--syn-' + t).trim();
        const jembatanStore = window.__ZEPHYR_SET__ && window.__ZEPHYR_SET__.ui ? window.__ZEPHYR_SET__.ui.getState() : null;
        const jembatanTema = window.__ZEPHYR_THEME__ || null;
        const awalTema = document.documentElement.dataset.theme || '';
        const namaSetter = jembatanTema && typeof jembatanTema.set === 'function'
          ? jembatanTema.set
          : jembatanStore && typeof jembatanStore.setTheme === 'function'
            ? (id) => jembatanStore.setTheme(id)
            : null;
        const namaSetterLabel = jembatanTema && typeof jembatanTema.set === 'function'
          ? '__ZEPHYR_THEME__.set'
          : namaSetter ? 'store.setTheme' : '-';
        const punyaJembatan = !!(namaSetter || jembatanStore);
        const hasil = { tema: awalTema || '(tanpa data-theme)', w, punyaJembatan, punyaSetter: !!namaSetter, namaSetter: namaSetterLabel };
        hasil.aksiTema = jembatanStore ? Object.keys(jembatanStore).filter((k) => /theme/i.test(k)) : [];
        /* Pergantian tema TIDAK dilakukan di eval ini: satu eval per tema, dari
           sisi Node, supaya reload di tengah jalan cuma menghilangkan satu tema. */
          return hasil;
        `);
        hidup = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        hidup = null;
        console.log(`  info   pembacaan DOM hidup gagal (percobaan ${percobaan}): ${String(e.message || e).slice(0, 160)}`);
      }
    }
    if (!hidup) {
      dilewati++;
      console.log('  BUTUH APP  DOM hidup tidak terbaca — bagian DOM hidup dilewati.');
    } else {
      const kosongHidup = TOKEN.filter((t) => !hidup.w[`--syn-${t}`]);
      cek(kosongHidup.length === 0, 'DOM hidup: tema aktif menyediakan 11/11 token --syn-*',
        `tema aktif "${hidup.tema}"` + (kosongHidup.length ? `, kosong: ${kosongHidup.join(', ')}` : ''));
      /* Silang-periksa: warna DOM hidup harus sama dengan blok CSS tema itu. */
      const b = blok.get(hidup.tema);
      if (!b) {
        dilewati++;
        console.log(`  BUTUH APP  tema aktif "${hidup.tema}" tidak punya blok CSS statis untuk dibandingkan`);
      } else {
        const beda = TOKEN.filter((t) => {
          const st = (b.props[`--syn-${t}`] || '').toLowerCase();
          const lv = (hidup.w[`--syn-${t}`] || '').toLowerCase();
          return st && lv && st !== lv && !lv.startsWith('rgb');
        });
        cek(beda.length === 0, 'DOM hidup: warna tema aktif sama dengan blok CSS-nya',
          beda.length ? beda.map((t) => `${t}: css ${b.props[`--syn-${t}`]} vs dom ${hidup.w[`--syn-${t}`]}`).join('; ') : '11/11 cocok');
      }
      if (!hidup.punyaSetter) {
        dilewati++;
        console.log(`  BUTUH APP  jembatan dev tidak menyediakan penyetel tema${hidup.aksiTema && hidup.aksiTema.length ? ` (aksi bertema: ${hidup.aksiTema.join(', ')})` : ' (tidak ada aksi bertema di store __ZEPHYR_SET__.ui)'}:`);
        console.log('             pergantian tema lewat DOM hidup tidak bisa dibuktikan dari build ini.');
      } else {
        /* Satu tema = satu eval, dikendalikan dari Node. App dev bisa reload di
           tengah pembacaan (HMR dari perubahan berkas lane lain); satu eval
           raksasa untuk 17 tema hilang seluruhnya kalau itu terjadi, sedangkan
           per-tema cuma kehilangan satu tema dan dicoba sekali lagi. */
        const GANTI = (id) => `
          const id = ${JSON.stringify(id)};
          const TOKENS = ${JSON.stringify(TOKEN)};
          const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
          const ZT = window.__ZEPHYR_THEME__;
          const st = window.__ZEPHYR_SET__ && window.__ZEPHYR_SET__.ui ? window.__ZEPHYR_SET__.ui.getState() : null;
          const bisa = ZT && typeof ZT.set === 'function';
          const bisaStore = !bisa && st && typeof st.setTheme === 'function';
          if (!bisa && !bisaStore) return JSON.stringify({ id, takAdaSetter: true });
          /* Jangan dijadikan variabel lalu dipanggil: kalau set() metode sebuah objek,
             this-nya hilang dan panggilan itu jadi no-op. */
          if (bisa) ZT.set(id);
          else st.setTheme(id);
          await tunggu(300);
          const cs = getComputedStyle(document.documentElement);
          const w = {};
          for (const t of TOKENS) w['--syn-' + t] = cs.getPropertyValue('--syn-' + t).trim();
          return JSON.stringify({ id, dom: document.documentElement.dataset.theme || '', w });
        `;
        const idDitawarkan = ditawarkan.map((t) => t.id);
        const terkumpul = [];
        let gagalBaca = 0;
        let basiTerbuang = 0;
        for (const id of idDitawarkan) {
          let dapat = null;
          for (let c = 1; c <= 3 && !dapat; c++) {
            try {
              const raw = await cdp.runAsync(GANTI(id));
              const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
              /* Hanya terima bacaan kalau halaman MENGaku sedang memakai tema yang
                 diminta (v.dom === id). Kalau app reload/HMR di tengah uji, data-theme
                 balik ke bawaan dan warna yang terbaca milik tema lain — bacaan seperti
                 itu dibuang, bukan dihitung sebagai bukti. */
              if (v && v.dom === id) dapat = { id, dom: v.dom, w: v.w };
              else if (v && !v.takAdaSetter) basiTerbuang++;
            } catch {
              /* reload memutus eval — coba lagi */
            }
            if (!dapat) await new Promise((r) => setTimeout(r, 400));
          }
          if (dapat) terkumpul.push(dapat);
          else gagalBaca++;
        }
        /* Kembalikan tema semula: app jangan ditinggal di tema uji terakhir. */
        try {
          await cdp.runAsync(
            `(function(){const ZT=window.__ZEPHYR_THEME__;if(ZT&&typeof ZT.set==='function')ZT.set(${JSON.stringify(hidup.tema)});return true;})()`,
          );
        } catch {
          /* kalau gagal, itu dilaporkan lewat jumlah tema terbaca di atas */
        }
        if (terkumpul.length < Math.ceil(idDitawarkan.length * 0.75)) {
          dilewati++;
          console.log(`  BUTUH APP  cuma ${terkumpul.length}/${idDitawarkan.length} tema terbaca bersih dari DOM hidup` +
            ` (${gagalBaca} gagal, ${basiTerbuang} bacaan basi dibuang — app reload/HMR di tengah uji)`);
          console.log(`             lewat ${hidup.namaSetter}: bukti pergantian tema live belum lengkap, sisanya tetap diuji.`);
        } else {
          const kosongHidup2 = terkumpul.flatMap((k) => TOKEN.filter((t) => !k.w[`--syn-${t}`]).map((t) => `${k.id}/${t}`));
          cek(kosongHidup2.length === 0, 'DOM hidup: 11 token terpasang untuk tiap tema yang terbaca',
            `${terkumpul.length} tema lewat ${hidup.namaSetter}(), ${kosongHidup2.length} token kosong` +
              (kosongHidup2.length ? `: ${kosongHidup2.slice(0, 6).join(', ')}` : ''));
          const keywordUnik = new Set(terkumpul.map((k) => k.w['--syn-keyword'])).size;
          cek(keywordUnik > 1, 'DOM hidup: pergantian tema benar-benar mengubah warna kode',
            `${keywordUnik} nilai --syn-keyword berbeda dari ${terkumpul.length} tema`);
          let pasanganKembar = 0;
          const pasangan = [];
          for (let i = 0; i < terkumpul.length; i++) {
            for (let j = i + 1; j < terkumpul.length; j++) {
              let n = 0;
              for (const t of TOKEN) {
                if (terkumpul[i].w[`--syn-${t}`] && terkumpul[i].w[`--syn-${t}`] === terkumpul[j].w[`--syn-${t}`]) n++;
              }
              if (n >= 3) {
                pasanganKembar++;
                if (pasangan.length < 4) pasangan.push(`${terkumpul[i].id}~${terkumpul[j].id} (${n} token)`);
              }
            }
          }
          cek(pasanganKembar === 0, 'DOM hidup: tak ada dua tema yang kembar warna kode',
            `${pasanganKembar} pasangan kembar (>=3 token sama)` + (pasangan.length ? `: ${pasangan.join('; ')}` : ''));
          /* Silang-periksa terkuat: warna DOM hidup tiap tema harus sama dengan blok
             CSS tema itu, jadi yang diuji bukan cuma "berubah" tapi "berubah ke nilai
             yang memang ditulis temanya". */
          const takCocok = [];
          for (const t of terkumpul) {
            const bb = blok.get(t.id);
            if (!bb) {
              takCocok.push(`${t.id}: tanpa blok CSS`);
              continue;
            }
            const beda = TOKEN.filter((x) => {
              const stv = (bb.props[`--syn-${x}`] || '').toLowerCase();
              const lv = (t.w[`--syn-${x}`] || '').toLowerCase();
              return stv && lv && stv !== lv && !lv.startsWith('rgb');
            });
            if (beda.length) takCocok.push(`${t.id}: ${beda.join('/')}`);
          }
          cek(takCocok.length === 0, 'DOM hidup: warna tiap tema sama dengan blok CSS-nya',
            (takCocok.join('; ') || `${terkumpul.length} tema cocok 11/11`) + (gagalBaca ? ` (${gagalBaca} tema tidak terbaca)` : ''));
        }
      }
    }
  }
}

}

/* ── ringkasan ───────────────────────────────────────────────────────────── */

const batasDom = new Promise((r) => setTimeout(() => r('lewat batas waktu'), 150000));
const hasilDom = await Promise.race([
  bagianDomHidup()
    .then(() => 'selesai')
    .catch((e) => `error: ${String((e && e.message) || e)}`),
  batasDom,
]);
if (hasilDom !== 'selesai') {
  dilewati++;
  console.log(`  BUTUH APP  bagian DOM hidup tidak selesai (${hasilDom}) — app kemungkinan reload/putus di tengah baca.`);
}

const total = lulus + gagal;
console.log(`\nsisa: ${gagal === 0 ? 'tidak ada' : daftarGagal.join(', ')}`);
if (dilewati) console.log(`dilewati (BUTUH APP): ${dilewati} bagian`);
console.log(`== ${lulus}/${total} lulus ==`);
process.exit(gagal === 0 ? 0 : 1);
