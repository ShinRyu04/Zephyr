/*
 * uji-bahasa-noop-puppet.mjs — paket bahasa mana yang BENAR-BENAR mengubah apa
 * yang dilihat pemakai, dan mana yang NO-OP / PUPPET (terpasang, nol efek)?
 *
 * Cara membuktikan, tanpa menyalakan aplikasi:
 *   1. Baca katalog nyata (src-tauri/src/ext_bundled.rs) + sumber kebenaran
 *      bahasa bawaan (src/lib/lang.ts BY_EXT/LANG_LABEL/build(),
 *      src/lib/cmLegacyModes.ts MODE_IMPORTER, src/lib/extLoader.ts).
 *   2. Tiru aturan presedensi yang SUNGGUH dipakai lang.ts `extLangUntuk`:
 *      ekstensi yang sudah dikenal BY_EXT tetap milik bawaan; sebuah paket
 *      hanya memiliki ekstensi yang belum diklaim siapa pun, dan yang lebih
 *      dulu di urutan PAKET_BAHASA menang.
 *   3. UJI NEGATIF: "matikan" satu paket, lalu hitung ekstensi yang kehilangan
 *      highlight. Kalau 0 -> paket itu NO-OP (tidak ada yang berubah).
 *
 * Setiap klaim menunjuk berkas + nomor baris nyata (dibaca saat jalan).
 * READ-ONLY untuk src/** dan src-tauri/**.
 *
 * Pemakaian: node scripts/uji-bahasa-noop-puppet.mjs [--json]
 * Keluar 1 kalau ada kasus gagal.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const baca = (rel) => readFileSync(`${ROOT}/${rel}`, 'utf8');

const BERKAS = {
  katalog: 'src-tauri/src/ext_bundled.rs',
  extra: 'src-tauri/src/ext_bundled_extra.rs',
  label: 'src/lib/lang.ts',
  mode: 'src/lib/cmLegacyModes.ts',
  loader: 'src/lib/extLoader.ts',
};
const teks = Object.fromEntries(Object.entries(BERKAS).map(([k, v]) => [k, baca(v)]));

const barisCari = (kunci, pola) => {
  const out = [];
  teks[kunci].split(/\r?\n/).forEach((l, i) => {
    if (pola.test(l)) out.push({ berkas: BERKAS[kunci], baris: i + 1, teks: l.trim() });
  });
  return out;
};
const barisSatu = (kunci, pola) => barisCari(kunci, pola)[0] ?? null;
const ringkas = (b) => (b ? `${b.berkas.split('/').pop()}:${b.baris}` : '(tidak ada)');

// ------------------------------------------------------------- bahasa BAWAAN
const BY_EXT = new Map();
// HANYA blok BY_EXT (BY_NAME di bawahnya juga berisi `dockerfile: 'shell',`).
const awalBE = teks.label.indexOf('const BY_EXT');
const barisAwalBE = teks.label.slice(0, awalBE).split(/\r?\n/).length;
teks.label
  .slice(awalBE, teks.label.indexOf('};', awalBE))
  .split(/\r?\n/)
  .forEach((l, i) => {
    const m = l.match(/^\s*([a-z0-9_]+):\s*'([a-z0-9]+)',?\s*$/);
    if (m && m[1] !== 'plain') BY_EXT.set(m[1].toLowerCase(), { berkas: BERKAS.label, baris: barisAwalBE + i, teks: l.trim() });
  });
const idxLabel = teks.label.slice(0, teks.label.indexOf('export const LANG_LABEL')).split(/\r?\n/).length;
const barisLabelBawaan = (lang) =>
  barisCari('label', new RegExp(`^\\s{2}${lang}: '`)).find((b) => b.baris >= idxLabel) ?? null;
const LANG_LABEL = new Set(
  barisCari('label', /^\s{2}[a-z0-9]+: '[A-Za-z]/).filter((b) => b.baris >= idxLabel).map((b) => b.teks.match(/^([a-z0-9]+):/)[1]),
);
const MODE_IMPORTER = new Set(
  [...teks.mode.matchAll(/^\s*'([a-z0-9.-]+)':\s*\(\)\s*=>\s*import\(/gm)].map((m) => m[1]),
);
const PAKET_DIIZINKAN = new Set([...teks.loader.matchAll(/'(?:@codemirror\/lang-[a-z0-9-]+)':/g)].map((m) => m[0].slice(1, -2)));

// --------------------------------------------------------- manifest paket bahasa
const manifes = new Map();
for (const [kunci, src] of [['katalog', teks.katalog], ['extra', teks.extra]]) {
  for (const m of src.matchAll(/const (LANG_[A-Z0-9_]+)\s*:\s*&str\s*=\s*r##"([\s\S]*?)"##;/g)) {
    let j;
    try {
      j = JSON.parse(m[2]);
    } catch {
      continue;
    }
    const c = j.contributes ?? {};
    const lang = (c.languages ?? [])[0] ?? {};
    if (!lang.id) continue; // bukan paket bahasa
    manifes.set(String(j.id), {
      id: String(j.id),
      nama: String(j.name ?? ''),
      defBaris: barisSatu(kunci, new RegExp(`^const ${m[1]}\\s*:`)),
      langId: String(lang.id),
      exts: (lang.extensions ?? []).map((e) => String(e).replace(/^\./, '').toLowerCase()),
      legacyMode: String(lang.legacyMode ?? ''),
      cmLang: String(lang.cmLang ?? ''),
      grammars: Array.isArray(c.grammars) ? c.grammars.length : 0,
    });
  }
}

// urutan PAKET_BAHASA (yang lebih dulu menang atas ekstensi)
const awalPB = teks.katalog.indexOf('const PAKET_BAHASA');
const barisAwalPB = teks.katalog.slice(0, awalPB).split(/\r?\n/).length;
const blokPB = teks.katalog.slice(awalPB, teks.katalog.indexOf('\n];', awalPB));
const urutan = [];
blokPB.split(/\r?\n/).forEach((l, i) => {
  const m = l.match(/"(zephyr\.lang-[a-z0-9.-]+)"/);
  if (m) urutan.push({ id: m[1], baris: barisAwalPB + i });
});

// ------------------------------------------------------------------- klasifikasi
// Tiru lang.ts extLangUntuk + extLoader.ts muatCmBahasa.
const pemilikExt = new Map(); // ext -> id paket
const paketUrut = urutan.map((u) => manifes.get(u.id)).filter(Boolean);
for (const p of paketUrut) {
  const baru = [];
  const rebuT = [];
  const nativeT = [];
  for (const e of p.exts) {
    if (BY_EXT.has(e)) { nativeT.push(e); continue; }
    if (pemilikExt.has(e)) { rebuT.push(`${e}<-${pemilikExt.get(e)}`); continue; }
    pemilikExt.set(e, p.id);
    baru.push(e);
  }
  p.extsBaru = baru;
  p.extsRebuT = rebuT;
  p.extsNative = nativeT;
  p.modeLoadable = (p.cmLang && PAKET_DIIZINKAN.has(p.cmLang)) || (!!p.legacyMode && MODE_IMPORTER.has(p.legacyMode));
  p.status = !p.modeLoadable ? 'GAGAL' : baru.length > 0 ? 'EFEKTIF' : 'NO-OP';
  if (p.status === 'NO-OP' && !p.legacyMode && !p.cmLang && p.grammars > 0) p.status = 'NO-OP-textmate';
}

// "matikan" sebuah paket: hitung ekstensi yang kehilangan satu-satunya pemilik
const hilangKalau = (idMatikan) => {
  const extBaru = new Map();
  for (const p of paketUrut) {
    if (p.id === idMatikan) continue;
    for (const e of p.exts) if (!BY_EXT.has(e) && !extBaru.has(e)) extBaru.set(e, p.id);
  }
  return [...pemilikExt.entries()].filter(([e, own]) => own === idMatikan && !extBaru.has(e)).map(([e]) => e).sort();
};

// ---------------------------------------------------------------------- kasus
const kasus = [];
const uji = (nama, ok, klaim, bukti = [], angka) =>
  kasus.push({ nama, ok: !!ok, klaim, bukti: bukti.filter(Boolean), angka });

const jumlahEfektif = paketUrut.filter((p) => p.status === 'EFEKTIF').length;
const jumlahNoop = paketUrut.filter((p) => p.status.startsWith('NO-OP')).length;
const jumlahGagal = paketUrut.filter((p) => p.status === 'GAGAL').length;

// C01 — katalog bahasa utuh
uji(
  'C01-katalog-terbaca',
  paketUrut.length === 88 && urutan.length === 88,
  `katalog memuat 88 paket bahasa (manifest + urutan PAKET_BAHASA)`,
  [{ berkas: BERKAS.katalog, baris: barisAwalPB, teks: teks.katalog.split(/\r?\n/)[barisAwalPB - 1].trim() }],
  paketUrut.length,
);

// C02 — tak ada mode hantu (gagal senyap)
uji(
  'C02-tak-ada-mode-hantu',
  jumlahGagal === 0,
  'setiap paket menyebut mode yang benar-benar bisa dimuat (MODE_IMPORTER / PAKET_DIIZINKAN) — jadi NO-OP bukan karena mode hilang',
  [barisSatu('mode', /^export const MODE_IMPORTER/)],
  jumlahGagal,
);

// C03 — tak ada paket bahasa penyumbang grammar TextMate (mesinnya belum ada)
const paketTextmate = paketUrut.filter((p) => p.grammars > 0);
uji(
  'C03-tak-ada-penyumbang-textmate',
  paketTextmate.length === 0,
  'tidak ada paket bahasa yang menyumbang grammar TextMate — jadi cabang "terpasang tetapi mesin TextMate belum ada" kosong (bukan sumber no-op di sini)',
  [barisSatu('loader', /TextMate grammars are parsed by Rust/)],
  paketTextmate.length,
);

// C04 — contoh paket yang BENAR-BENAR menambah (bukan no-op): mIRC
const mirc = manifes.get('zephyr.lang-mirc');
uji(
  'C04-mirc-efektif',
  !!mirc && mirc.status === 'EFEKTIF' && mirc.extsBaru.includes('mrc'),
  `zephyr.lang-mirc EFEKTIF: .mrc tidak ada di BY_EXT, bukan diklaim paket lain, mode "mirc" bisa dimuat`,
  [mirc?.defBaris, barisSatu('mode', /^\s*'mirc':\s*\(\)\s*=>\s*import\(/)],
  mirc?.extsBaru,
);

// C05 — pascal adalah PEMILIK .pp yang sebenarnya
const pascal = manifes.get('zephyr.lang-pascal');
uji(
  'C05-pascal-pemilik-pp',
  !!pascal && pascal.extsBaru.includes('pp') && pemilikExt.get('pp') === 'zephyr.lang-pascal',
  'zephyr.lang-pascal EFEKTIF dan pemilik .pp: .pp tidak ada di BY_EXT dan pascal lebih dulu di urutan PAKET_BAHASA',
  [pascal?.defBaris, urutan.find((u) => u.id === 'zephyr.lang-pascal') && { berkas: BERKAS.katalog, baris: urutan.find((u) => u.id === 'zephyr.lang-pascal').baris, teks: '(entri urutan pascal)' }],
  pascal?.extsBaru,
);

// C06 — puppet NO-OP: satu-satunya ekstensinya direbut pascal
const puppet = manifes.get('zephyr.lang-puppet');
const entriPuppet = urutan.find((u) => u.id === 'zephyr.lang-puppet');
const entriPascal = urutan.find((u) => u.id === 'zephyr.lang-pascal');
uji(
  'C06-puppet-noop',
  !!puppet && puppet.status === 'NO-OP' && puppet.exts.length === 1 && puppet.extsRebuT.length === 1 && entriPascal.baris < entriPuppet.baris,
  'zephyr.lang-puppet NO-OP: satu-satunya ekstensi .pp sudah dipegang pascal yang lebih dulu di urutan — terpasang, tampil di daftar, nol efek',
  [puppet?.defBaris, { berkas: BERKAS.katalog, baris: entriPascal.baris, teks: '(entri pascal — lebih dulu)' }, { berkas: BERKAS.katalog, baris: entriPuppet.baris, teks: '(entri puppet — lebih belakang)' }],
  { exts: puppet?.exts, rebuT: puppet?.extsRebuT },
);

// C07 — UJI NEGATIF: matikan puppet -> tidak ada yang berubah (no-op terbukti)
const hilangPuppet = hilangKalau('zephyr.lang-puppet');
uji(
  'C07-negatif-puppet-nol',
  hilangPuppet.length === 0,
  'NEGATIF: pupppet dimatikan -> 0 ekstensi kehilangan highlight = tidak ada yang berubah = NO-OP terbukti',
  [puppet?.defBaris],
  hilangPuppet,
);

// C08 — UJI NEGATIF: matikan pascal -> .pas/.dpr/.lpr hilang, tetapi .pp TIDAK
// hilang karena langsung diwarisi puppet. Itulah bukti puppet = bayangan:
// selama pascal ada ia tidak menambah apa pun; ia baru "hidup" kalau pascal mati.
const hilangPascal = hilangKalau('zephyr.lang-pascal');
const pemilikPpSetelahPascalMati = (() => {
  const extBaru = new Map();
  for (const p of paketUrut) {
    if (p.id === 'zephyr.lang-pascal') continue;
    for (const e of p.exts) if (!BY_EXT.has(e) && !extBaru.has(e)) extBaru.set(e, p.id);
  }
  return extBaru.get('pp');
})();
uji(
  'C08-negatif-pascal-pp',
  hilangPascal.length === 3 && ['dpr', 'lpr', 'pas'].every((e) => hilangPascal.includes(e)) && !hilangPascal.includes('pp') && pemilikPpSetelahPascalMati === 'zephyr.lang-puppet',
  'NEGATIF: pascal dimatikan -> .pas/.dpr/.lpr kehilangan highlight, TETAPI .pp tidak, karena pemiliknya langsung jatuh ke puppet — puppet hanya bayangan pascal, bukan penyumbang apa pun',
  [pascal?.defBaris, puppet?.defBaris],
  { hilang: hilangPascal, pemilikBaru: pemilikPpSetelahPascalMati },
);

// C09..C13 — UJI NEGATIF per paket "sudah didukung bawaan": yang hilang hanya ekstensi sisa
const SISA = [
  { paket: 'zephyr.lang-perl', bahasa: 'perl', sisa: ['pod', 't'] },
  { paket: 'zephyr.lang-python', bahasa: 'python', sisa: ['pyi'] },
  { paket: 'zephyr.lang-ruby', bahasa: 'ruby', sisa: ['erb', 'gemspec'] },
  { paket: 'zephyr.lang-shell', bahasa: 'shell', sisa: ['fish'] },
  { paket: 'zephyr.lang-xml', bahasa: 'xml', sisa: ['xhtml', 'xsd', 'xsl'] },
];
for (const s of SISA) {
  const p = manifes.get(s.paket);
  const hilang = hilangKalau(s.paket);
  const bahasaTetap = !!barisLabelBawaan(s.bahasa);
  const sama = hilang.length === s.sisa.length && hilang.every((e) => s.sisa.includes(e));
  uji(
    `C09-${s.bahasa}-hilang-hanya-sisa`,
    !!p && p.status === 'EFEKTIF' && sama && bahasaTetap,
    `NEGATIF: ${s.paket} dimatikan -> hanya ekstensi sisa (${s.sisa.map((e) => '.' + e).join(', ')}) yang kehilangan highlight; bahasa "${s.bahasa}" TETAP ada (LANG_LABEL + BY_EXT)`,
    [p?.defBaris, barisLabelBawaan(s.bahasa)],
    hilang,
  );
}

// C14 — ringkasan: EFEKTIF 87, NO-OP 1
uji(
  'C14-rekap-87-1',
  jumlahEfektif === 87 && jumlahNoop === 1 && jumlahGagal === 0,
  'rekap: 87 paket EFEKTIF (mengubah apa yang dilihat pemakai), 1 NO-OP (puppet), 0 GAGAL',
  [],
  { efektif: jumlahEfektif, noop: jumlahNoop, gagal: jumlahGagal },
);

// C15 — daftar paket NO-OP + alasan bisa dilacak
const daftarNoop = paketUrut.filter((p) => p.status.startsWith('NO-OP'));
uji(
  'C15-daftar-noop',
  daftarNoop.length === 1 && daftarNoop[0].id === 'zephyr.lang-puppet',
  `daftar NO-OP: ${daftarNoop.map((p) => p.id).join(', ') || '(kosong)'}`,
  daftarNoop.map((p) => p.defBaris),
  daftarNoop.map((p) => ({ id: p.id, exts: p.exts, rebuT: p.extsRebuT, mode: p.legacyMode })),
);

// ------------------------------------------------------------------- keluaran
const lulus = kasus.filter((k) => k.ok).length;
const gagal = kasus.filter((k) => !k.ok);

console.log('== uji bahasa no-op / puppet: siapa yang benar-benar mengubah, siapa yang cuma terpasang? ==');
console.log(`   sumber: ${Object.values(BERKAS).join(' | ')}`);
console.log(`   BY_EXT=${BY_EXT.size} | LANG_LABEL=${LANG_LABEL.size} | MODE_IMPORTER=${MODE_IMPORTER.size} | paket bahasa=${paketUrut.length}`);
console.log('');
for (const k of kasus) {
  console.log(`   [${k.ok ? 'LULUS' : 'GAGAL'}] ${k.nama} — ${k.klaim}`);
  for (const e of k.bukti) console.log(`           bukti ${ringkas(e)} :: ${String(e.teks).slice(0, 110)}`);
}
console.log('');
console.log(`   vonis: ${jumlahEfektif} EFEKTIF, ${jumlahNoop} NO-OP, ${jumlahGagal} GAGAL`);
console.log(`   NO-OP: ${daftarNoop.map((p) => `${p.id} (${p.extsRebuT.join(',') || 'tanpa ekstensi'})`).join('; ') || '(kosong)'}`);
console.log(`   ${kasus.length} kasus: ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) for (const g of gagal) console.log(`     GAGAL: ${g.nama}`);
console.log(gagal.length === 0 ? '   LULUS: 1 paket terbukti NO-OP (puppet); sisanya mengubah ekstensi nyata.' : '   GAGAL: ada klaim yang tidak terpenuhi.');

if (process.argv.includes('--json')) {
  console.log('\n' + JSON.stringify({ kasus, jumlahEfektif, jumlahNoop, jumlahGagal }, null, 2));
}

process.exitCode = gagal.length ? 1 : 0;
