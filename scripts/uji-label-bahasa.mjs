/*
 * uji-label-bahasa.mjs — APAKAH paket bahasa `perl/python/ruby/shell/xml`
 * benar-benar MENAMBAH dukungan bahasa, atau hanya menambah EKSTENSI SISA
 * sementara bahasanya sudah didukung bawaan Zephyr?
 *
 * Skrip ini READ-ONLY untuk src/** dan src-tauri/**. Ia hanya membaca berkas
 * nyata dan melacak setiap klaim ke berkas + NOMOR BARIS sebenarnya (nomor
 * baris dibaca saat jalan, bukan dikunci di sini, jadi tak bisa basi).
 *
 * Sumber kebenaran yang dibaca:
 *   - src-tauri/src/ext_bundled.rs  manifest paket bahasa + urutan PAKET_BAHASA
 *   - src/lib/lang.ts               BY_EXT / LANG_LABEL / build() = bahasa BAWAAN
 *   - src/lib/cmLegacyModes.ts      MODE_IMPORTER = allow-list mode legacy
 *   - src/lib/extLoader.ts          PAKET_DIIZINKAN + muatCmBahasa + gerbang label
 *
 * Vonis yang mungkin, per bahasa:
 *   "BAHASA-BAWAAN + EKSTENSI-SISA"  paket TIDAK menambah bahasa; ia hanya
 *                                    mengklaim ekstensi yang belum ada di BY_EXT
 *   "MENAMBAH-BAHASA"                paket mengklaim id bahasa yang TIDAK ada
 *                                    di LANG_LABEL (tidak terjadi di berkas ini)
 *
 * Keluar 1 kalau ada kasus gagal.
 *
 * Pemakaian: node scripts/uji-label-bahasa.mjs [--json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const baca = (rel) => readFileSync(`${ROOT}/${rel}`, 'utf8');

const BERKAS = {
  katalog: 'src-tauri/src/ext_bundled.rs',
  label: 'src/lib/lang.ts',
  mode: 'src/lib/cmLegacyModes.ts',
  loader: 'src/lib/extLoader.ts',
};
const teks = Object.fromEntries(Object.entries(BERKAS).map(([k, v]) => [k, baca(v)]));

// ------------------------------------------------------------------ indeks baris
const barisCari = (kunci, pola) => {
  const hasil = [];
  teks[kunci].split(/\r?\n/).forEach((l, i) => {
    if (pola.test(l)) hasil.push({ berkas: BERKAS[kunci], baris: i + 1, teks: l.trim() });
  });
  return hasil;
};
const barisSatu = (kunci, pola) => barisCari(kunci, pola)[0] ?? null;
const ringkas = (b) => (b ? `${b.berkas.split('/').pop()}:${b.baris}` : '(tidak ada)');

// blok sumber: dari baris awal pola sampai baris akhir
const potongBlok = (kunci, mulai, selesai) => {
  const t = teks[kunci];
  const a = t.indexOf(mulai);
  if (a < 0) return '';
  const b = t.indexOf(selesai, a + mulai.length);
  return t.slice(a, b < 0 ? undefined : b);
};

// ------------------------------------------------- sumber kebenaran bahasa BAWAAN
const BY_EXT = new Map(); // ext -> baris
// HANYA blok BY_EXT di lang.ts (BY_NAME di bawahnya juga berisi `dockerfile: 'shell',`).
const awalBE = teks.label.indexOf('const BY_EXT');
const barisAwalBE = teks.label.slice(0, awalBE).split(/\r?\n/).length;
teks.label
  .slice(awalBE, teks.label.indexOf('};', awalBE))
  .split(/\r?\n/)
  .forEach((l, i) => {
    const m = l.match(/^\s*([a-z0-9_]+):\s*'([a-z0-9]+)',?\s*$/);
    if (m && m[1] !== 'plain') {
      BY_EXT.set(m[1].toLowerCase(), { berkas: BERKAS.label, baris: barisAwalBE + i, teks: l.trim() });
    }
  });
const MODE_IMPORTER = new Set(
  [...teks.mode.matchAll(/^\s*'([a-z0-9.-]+)':\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]),
);
const PAKET_DIIZINKAN = new Set(
  [...teks.loader.matchAll(/'(?:@codemirror\/lang-[a-z0-9-]+)':/g)].map((m) => m[0].slice(1, -2)),
);

// ------------------------------------------------------ manifest paket (katalog)
const manifes = new Map();
for (const m of teks.katalog.matchAll(/const (LANG_[A-Z0-9_]+)\s*:\s*&str\s*=\s*r##"([\s\S]*?)"##;/g)) {
  let j;
  try {
    j = JSON.parse(m[2]);
  } catch {
    continue;
  }
  const konstanta = m[1];
  const barisDef = barisSatu('katalog', new RegExp(`^const ${konstanta}\\s*:`));
  const c = j.contributes ?? {};
  const lang = (c.languages ?? [])[0] ?? {};
  manifes.set(String(j.id), {
    id: String(j.id),
    nama: String(j.name ?? ''),
    deskripsi: String(j.description ?? ''),
    defBaris: barisDef,
    langId: String(lang.id ?? ''),
    label: String(lang.label ?? ''),
    exts: (lang.extensions ?? []).map((e) => String(e).replace(/^\./, '').toLowerCase()),
    legacyMode: String(lang.legacyMode ?? ''),
    cmLang: String(lang.cmLang ?? ''),
  });
}

// urutan pemuatan = urutan di PAKET_BAHASA (yang lebih dulu menang)
const blokPaketBahasa = potongBlok('katalog', 'const PAKET_BAHASA', '\n];');
const offsetPaketBahasa = teks.katalog.slice(0, teks.katalog.indexOf('const PAKET_BAHASA')).split(/\r?\n/).length;
const urutanBahasa = [];
blokPaketBahasa.split(/\r?\n/).forEach((l, i) => {
  const m = l.match(/"(zephyr\.lang-[a-z0-9.-]+)"/);
  if (m) urutanBahasa.push({ id: m[1], baris: offsetPaketBahasa + i, teks: l.trim() });
});
const urutanIndex = new Map(urutanBahasa.map((x, i) => [x.id, i]));

// LANG_LABEL = daftar bahasa BAWAAN. Ia blok ketiga di lang.ts, jadi cari
// khusus SESUDAH 'export const LANG_LABEL' (BY_EXT di atasnya juga punya
// baris `perl: 'perl',` yang bisa tertangkap kalau tidak dibatasi).
const barisLabelBawaan = (lang) => {
  const awal = teks.label.slice(0, teks.label.indexOf('export const LANG_LABEL')).split(/\r?\n/).length;
  return barisCari('label', new RegExp(`^\\s{2}${lang}: '`)).find((b) => b.baris >= awal) ?? null;
};

// --------------------------------------------------------------- kasus per bahasa
const BAHASA = [
  { id: 'perl', label: 'Perl', paket: 'zephyr.lang-perl', nativeExts: ['perl', 'pl', 'pm'] },
  { id: 'python', label: 'Python', paket: 'zephyr.lang-python', nativeExts: ['py', 'pyw'] },
  { id: 'ruby', label: 'Ruby', paket: 'zephyr.lang-ruby', nativeExts: ['rb'] },
  { id: 'shell', label: 'Shell / Bash', paket: 'zephyr.lang-shell', nativeExts: ['sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd'] },
  { id: 'xml', label: 'XML / HTML', paket: 'zephyr.lang-xml', nativeExts: ['xml', 'svg'] },
];

const kasus = [];
const uji = (nama, ok, klaim, bukti) => kasus.push({ nama, ok: !!ok, klaim, bukti: bukti.filter(Boolean) });

for (const b of BAHASA) {
  const p = manifes.get(b.paket);
  if (!p) {
    uji(`${b.id}/paket-ada`, false, `paket ${b.paket} harus ada di katalog`, []);
    continue;
  }

  // K1 — paket ada di katalog, punya manifest + entri urutan
  const entri = urutanBahasa.find((x) => x.id === b.paket);
  uji(
    `${b.id}/K1-paket-ada`,
    !!p.defBaris && !!entri,
    `paket ${b.paket} dideklarasikan di katalog dan terdaftar di urutan PAKET_BAHASA`,
    [p.defBaris, entri ? { berkas: BERKAS.katalog, baris: entri.baris, teks: entri.teks } : null],
  );

  // K2 — bahasanya SUDAH didukung bawaan (ada di LANG_LABEL)
  const labelBawaan = barisLabelBawaan(b.id);
  uji(
    `${b.id}/K2-bahasa-sudah-bawaan`,
    !!labelBawaan && !!labelBawaan.teks.match(/:\s*'/),
    `bahasa "${b.id}" sudah ada di LANG_LABEL (lang.ts) — paket TIDAK memperkenalkan bahasa baru`,
    [labelBawaan],
  );

  // K3 — build() bawaan sudah memasang grammar nyata untuk bahasa ini
  const kasusBawaan = barisSatu('label', new RegExp(`^\\s*case '${b.id}':`));
  const imporBawaan = kasusBawaan
    ? barisCari('label', /@codemirror\/(lang-|legacy-modes\/mode\/)/).find(
        (x) => x.baris >= kasusBawaan.baris && x.baris <= kasusBawaan.baris + 12,
      ) ?? null
    : null;
  uji(
    `${b.id}/K3-grammar-bawaan-ada`,
    !!kasusBawaan && !!imporBawaan,
    `build() (lang.ts) memasang grammar nyata untuk "${b.id}": bahasa ini jalan tanpa paket apa pun`,
    [kasusBawaan, imporBawaan],
  );

  // K4 — mode/grammar yang dibawa paket: duplikat (legacy sama) atau lebih lemah
  const barisMode = p.legacyMode ? barisSatu('mode', new RegExp(`^\\s*'${p.legacyMode}':\\s*\\(\\)\\s*=>\\s*import\\(`)) : null;
  const modeSamaDenganBawaan = !!p.legacyMode && !!imporBawaan && imporBawaan.teks.includes(`mode/${p.legacyMode}'`);
  const modeLegacyVsCm6 = !!p.legacyMode && !!imporBawaan && imporBawaan.teks.includes('@codemirror/lang-');
  uji(
    `${b.id}/K4-paket-duplikat-mode`,
    (modeSamaDenganBawaan || modeLegacyVsCm6) && MODE_IMPORTER.has(p.legacyMode),
    modeSamaDenganBawaan
      ? `paket memakai mode legacy "${p.legacyMode}" — SAMA PERSIS dengan yang sudah dipakai build() bawaan (duplikat)`
      : `paket memakai mode legacy "${p.legacyMode}" (StreamLanguage) sementara bawaan memakai paket CM6 nyata ${imporBawaan ? imporBawaan.teks.match(/'([^']+)'/)?.[1] ?? '' : ''} — paket lebih lemah, bukan penambah bahasa`,
    [barisMode, imporBawaan],
  );

  // K5 — setiap ekstensi paket TIDAK ada di BY_EXT => benar-benar "ekstensi sisa"
  const extsSisa = p.exts.filter((e) => !BY_EXT.has(e));
  const extsBentrok = p.exts.filter((e) => BY_EXT.has(e));
  uji(
    `${b.id}/K5-ekstensi-sisa-saja`,
    p.exts.length > 0 && extsSisa.length === p.exts.length,
    `semua ekstensi paket (${p.exts.map((e) => '.' + e).join(', ')}) TIDAK ada di BY_EXT — paket hanya menambah ekstensi sisa`,
    [
      p.defBaris,
      ...(extsBentrok.length ? extsBentrok.map((e) => BY_EXT.get(e)) : []),
    ],
  );

  // K6 — bahasa itu sudah terjangkau lewat ekstensi bawaan lain (tanpa paket)
  const bawaanAda = b.nativeExts.filter((e) => BY_EXT.has(e));
  uji(
    `${b.id}/K6-terjangkau-tanpa-paket`,
    bawaanAda.length === b.nativeExts.length,
    `"${b.id}" sudah terjangkau lewat ekstensi bawaan ${b.nativeExts.map((e) => '.' + e).join(', ')} — paket tak diperlukan untuk bahasanya`,
    bawaanAda.map((e) => BY_EXT.get(e)),
  );
}

// --------------------------------------------------------------- rekap + vonis
const vonis = BAHASA.map((b) => {
  const p = manifes.get(b.paket);
  const labelBawaan = !!barisLabelBawaan(b.id);
  if (!p) return { bahasa: b.id, vonis: 'TIDAK-ADA' };
  if (!labelBawaan) return { bahasa: b.id, vonis: 'MENAMBAH-BAHASA', exts: p.exts };
  return { bahasa: b.id, vonis: 'BAHASA-BAWAAN + EKSTENSI-SISA', exts: p.exts.map((e) => '.' + e) };
});

const lulus = kasus.filter((k) => k.ok).length;
const gagal = kasus.filter((k) => !k.ok);

console.log('== uji label bahasa: apakah paket menambah BAHASA atau hanya EKSTENSI SISA? ==');
console.log(`   sumber: ${Object.values(BERKAS).join(' | ')}`);
console.log(`   BY_EXT=${BY_EXT.size} ekstensi bawaan | MODE_IMPORTER=${MODE_IMPORTER.size} mode | PAKET_DIIZINKAN=${PAKET_DIIZINKAN.size} cmLang`);
console.log('');

for (const k of kasus) {
  console.log(`   [${k.ok ? 'LULUS' : 'GAGAL'}] ${k.nama} — ${k.klaim}`);
  for (const e of k.bukti) console.log(`           bukti ${ringkas(e)} :: ${e.teks.slice(0, 120)}`);
}

console.log('');
console.log('   vonis per bahasa:');
for (const v of vonis) {
  console.log(`     - ${v.bahasa.padEnd(8)} -> ${v.vonis}${v.exts ? ` (${v.exts.join(', ')})` : ''}`);
}
console.log('');
console.log(`   ${kasus.length} kasus: ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) for (const g of gagal) console.log(`     GAGAL: ${g.nama}`);
console.log(gagal.length === 0 ? '   LULUS: kelima paket TIDAK menambah bahasa; hanya ekstensi sisa.' : '   GAGAL: ada klaim yang tidak terpenuhi.');

if (process.argv.includes('--json')) {
  console.log('\n' + JSON.stringify({ kasus, vonis, lulus, gagal: gagal.map((g) => g.nama) }, null, 2));
}

process.exitCode = gagal.length ? 1 : 0;
