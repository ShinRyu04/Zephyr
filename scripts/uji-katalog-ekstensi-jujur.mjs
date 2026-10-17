#!/usr/bin/env node
/*
 * uji-katalog-ekstensi-jujur.mjs
 *
 * Menuntut katalog ekstensi Zephyr JUJUR tentang paket bahasa: yang no-op
 * ditandai no-op, yang cuma menambah ekstensi sisa ditandai "sudah didukung
 * bawaan", dan yang benar-benar menambah bahasa TIDAK boleh dilabeli begitu.
 *
 * Cara kerjanya: berkas ini TIDAK memakai daftar tebakan. Ia membaca sumber
 * katalog yang sebenarnya, menurunkan sendiri status tiap paket, lalu meminta
 * tabel di `src/lib/labelPaket.ts` setuju -- dua arah:
 *
 *   - sumber -> modul : tiap paket no-op / ekstensi-sisa dari sumber wajib ada
 *                       di modul, dengan daftar ekstensi yang persis.
 *   - modul -> sumber : tiap id di modul wajib ada di katalog, dan tidak boleh
 *                       melabeli paket yang bahasanya memang bahasa baru.
 *
 * Kalau katalog berubah (paket ditambah, ekstensi dipindah, urutan diubah),
 * uji ini gagal - itu maksudnya. Node-only, tanpa dependensi: berkas .ts
 * di-import langsung lewat type-stripping bawaan Node (>= 23.6).
 *
 * Jalankan: node scripts/uji-katalog-ekstensi-jujur.mjs
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = fileURLToPath(new URL('../', import.meta.url));
const baca = (rel) => readFileSync(AKAR + rel, 'utf8');

/* Angka sebelum perubahan label (diukur 2026-10-14 pada katalog yang sama;
   katalog tidak disentuh oleh perubahan label, jadi harus tetap sama). */
const SEBELUM = {
  idsKatalog: 105,
  paketBahasa: 88,
  paketNonBahasa: 17,
  ekstensiNative: 61,
  bahasaNative: 28,
  katalogBundledTs: 17,
};

let lulus = 0;
let total = 0;
const gagal = [];

function cek(nama, kondisi, detail) {
  total += 1;
  if (kondisi) {
    lulus += 1;
    console.log(`  ok   ${nama}`);
  } else {
    gagal.push(nama);
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
}

const potongBlok = (teks, mulai, selesai) => {
  const a = teks.indexOf(mulai);
  if (a < 0) return '';
  const b = teks.indexOf(selesai, a);
  return teks.slice(a, b < 0 ? undefined : b);
};

const samaHimpunan = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};
const beda = (a, b) => {
  const B = new Set(b);
  return a.filter((x) => !B.has(x));
};
const samaUrut = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

console.log('== uji katalog ekstensi jujur ==');
console.log('sumber:');
console.log('  src-tauri/src/ext_bundled.rs (const LANG_*, PAKET_BAHASA, PAKET)');
console.log('  src-tauri/src/ext_bundled_extra.rs');
console.log('  src/lib/lang.ts (BY_EXT, LANG_LABEL)');
console.log('  src/lib/extLoader.ts (muatBahasa)',);
console.log('  src/lib/cmLegacyModes.ts (MODE_TERSEDIA)');
console.log('  src/lib/labelPaket.ts (tabel label yang diuji)');
console.log('');

/* ------------------------------------------------------------------ baca */

const rs = baca('src-tauri/src/ext_bundled.rs');
const rsExtra = baca('src-tauri/src/ext_bundled_extra.rs');
const langTs = baca('src/lib/lang.ts');
const loaderTs = baca('src/lib/extLoader.ts');
const modeTs = baca('src/lib/cmLegacyModes.ts');
const uiTsx = baca('src/components/extensions/ExtensionsView.tsx');
const katalogTs = baca('src/lib/extCatalog.ts');

cek(
  'sumber katalog terbaca (ext_bundled.rs, lang.ts, cmLegacyModes.ts, ExtensionsView.tsx)',
  rs.length > 1000 && langTs.length > 1000 && modeTs.length > 100 && uiTsx.length > 1000,
);

/* ---------------------------------------------- turunkan fakta dari sumber */

const paket = [];
for (const m of rs.matchAll(/const (LANG_[A-Z0-9_]+)\s*:\s*&str\s*=\s*r##"([\s\S]*?)"##;/g)) {
  const j = JSON.parse(m[2]);
  const c = j.contributes ?? {};
  const langs = Array.isArray(c.languages) ? c.languages : [];
  const exts = [];
  for (const l of langs) for (const e of l.extensions ?? []) exts.push(String(e).toLowerCase().replace(/^\./, ''));
  paket.push({
    id: String(j.id),
    constName: m[1],
    baris: rs.slice(0, m.index).split('\n').length,
    deskripsi: String(j.description ?? ''),
    label: String(langs[0]?.label ?? ''),
    langId: String(langs[0]?.id ?? ''),
    mode: String(langs[0]?.legacyMode || langs[0]?.cmLang || ''),
    exts,
    grammars: Array.isArray(c.grammars) ? c.grammars.length : 0,
  });
}

const urutanBahasa = [...potongBlok(rs, 'const PAKET_BAHASA', 'const PAKET:')
  .matchAll(/"zephyr\.lang-[a-z0-9.-]+"/g)].map((x) => x[0].slice(1, -1));
const bobot = (id) => {
  const i = urutanBahasa.indexOf(id);
  return i < 0 ? 1e9 : i;
};
paket.sort((a, b) => bobot(a.id) - bobot(b.id));
for (const p of paket) p.posisi = bobot(p.id);

const BY_EXT = new Map();
for (const m of potongBlok(langTs, 'const BY_EXT: Record<string, LangId> = {', '};')
  .matchAll(/^\s*([a-zA-Z0-9_]+):\s*'([a-z0-9]+)',?\s*$/gm)) BY_EXT.set(m[1].toLowerCase(), m[2]);
const NATIVE = new Set(
  [...potongBlok(langTs, 'export const LANG_LABEL', '};').matchAll(/^\s*([a-z0-9]+):\s*'/gm)].map((m) => m[1]),
);
const MODE = new Set(
  [...potongBlok(modeTs, 'MODE_IMPORTER', '};').matchAll(/^\s*'?([a-zA-Z0-9_.-]+)'?:\s*\(\)\s*=>/gm)].map((m) => m[1]),
);

cek(
  `fakta native dari lang.ts: ${BY_EXT.size} ekstensi -> ${NATIVE.size} bahasa, ${MODE.size} mode legacy (sama seperti sebelum)`,
  BY_EXT.size === SEBELUM.ekstensiNative && NATIVE.size === SEBELUM.bahasaNative,
  `BY_EXT=${BY_EXT.size} (harap ${SEBELUM.ekstensiNative}), LANG_LABEL=${NATIVE.size} (harap ${SEBELUM.bahasaNative})`,
);
cek(
  'lang.ts (extLangUntuk): peta bawaan menang, kontribusi paket hanya mengisi ekstensi yang belum dikenal',
  /export function extLangUntuk/.test(langTs) &&
    langTs.includes("if (detectLang(nameOrPath) !== 'plain') return null;"),
);
cek(
  'extLoader.ts (muatBahasa): klaim ekstensi paket "yang pertama menang" (ekstensi yang sudah dipakai tidak ditimpa)',
  /langPemilik/.test(loaderTs) && /sudah dipakai/.test(loaderTs) && /dipakai = true/.test(loaderTs),
);

/* ------------------------------------------------- klaim ekstensi, berurut */

const pemilikExt = new Map();
for (const p of paket) {
  p.extsNative = [];
  p.extsDirebut = [];
  p.extsBaru = [];
  p.ekstensiBaruStr = [];
  for (const e of p.exts) {
    if (BY_EXT.has(e)) {
      p.extsNative.push(e);
      continue;
    }
    if (pemilikExt.has(e)) {
      p.extsDirebut.push(`${e} <- ${pemilikExt.get(e)}`);
      continue;
    }
    pemilikExt.set(e, p.id);
    p.extsBaru.push(e);
    p.ekstensiBaruStr.push('.' + e);
  }
  p.bahasaNative = NATIVE.has(p.langId);
  p.diterapkan = p.grammars === 0 && MODE.has(p.mode);
  if (!p.diterapkan) p.sebab = p.grammars > 0 ? 'bawa grammars sendiri' : `mode "${p.mode}" tidak ada`;
  else if (p.extsBaru.length === 0) p.status = 'no-op';
  else if (p.bahasaNative) p.status = 'ekstensi-sisa';
  else p.status = 'bahasa-baru';
}

const semuaBahasa = [...new Set([...rs.matchAll(/"id"\s*:\s*"(zephyr\.[a-z0-9.-]+)"/g), ...rsExtra.matchAll(/"id"\s*:\s*"(zephyr\.[a-z0-9.-]+)"/g)].map((m) => m[1]))];
const idBahasa = semuaBahasa.filter((i) => i.includes('lang-'));
const idNonBahasa = semuaBahasa.filter((i) => !i.includes('lang-'));
const katalogBundledTsJumlah = (katalogTs.match(/^    id: '/gm) ?? []).length;

const dariSumberNoOp = paket.filter((p) => p.status === 'no-op');
const dariSumberSisa = paket.filter((p) => p.status === 'ekstensi-sisa');
const dariSumberBaru = paket.filter((p) => p.status === 'bahasa-baru');

console.log('');
console.log(`turunan dari sumber: ${paket.length} paket berkontribusi bahasa`);
console.log(`  no-op         : ${dariSumberNoOp.length}  ${dariSumberNoOp.map((p) => p.id).join(', ')}`);
console.log(`  ekstensi-sisa : ${dariSumberSisa.length}  ${dariSumberSisa.map((p) => p.id).join(', ')}`);
console.log(`  bahasa-baru   : ${dariSumberBaru.length}`);
for (const p of dariSumberNoOp) {
  console.log(
    `  bukti no-op: ${p.id} (${p.constName} @ src-tauri/src/ext_bundled.rs:${p.baris}) mengklaim ` +
      `${p.exts.map((e) => '.' + e).join(', ')}, direbut ${p.extsDirebut.join(', ')}`,
  );
}
for (const p of dariSumberSisa) {
  const nat = [...new Set(p.exts.filter((e) => BY_EXT.has(e)).map((e) => `${e}->${BY_EXT.get(e)}`))];
  console.log(
    `  bukti sisa: ${p.id} (${p.constName} @ src-tauri/src/ext_bundled.rs:${p.baris}) hanya menambah ` +
      `${p.ekstensiBaruStr.join(', ')}; ${p.langId} sudah native (${nat.join(', ') || 'via nama bahasa'})`,
  );
}

/* ------------------------------------------------------ tabel label nyata */

let mod = null;
try {
  mod = await import(pathToFileURL(AKAR + 'src/lib/labelPaket.ts').href);
} catch (e) {
  console.log(`  (import src/lib/labelPaket.ts gagal: ${e.message})`);
}
const tabel = mod?.LABEL_PAKET ?? {};
const daftarLabel = mod?.daftarLabelPaket?.() ?? Object.keys(tabel).sort().map((k) => tabel[k]);
const modNoOp = daftarLabel.filter((l) => l.jenis === 'no-op').map((l) => l.id).sort();
const modSisa = daftarLabel.filter((l) => l.jenis === 'ekstensi-sisa').map((l) => l.id).sort();
const sumberNoOpIds = dariSumberNoOp.map((p) => p.id).sort();
const sumberSisaIds = dariSumberSisa.map((p) => p.id).sort();

console.log('');
console.log(`tabel src/lib/labelPaket.ts: ${daftarLabel.length} label`);
console.log(`  no-op         : ${modNoOp.join(', ')}`);
console.log(`  ekstensi-sisa : ${modSisa.join(', ')}`);
console.log('');

/* -------------------------------------------------------------- tuntutan */

cek('modul label src/lib/labelPaket.ts bisa dibaca (import .ts langsung)', mod !== null && Object.keys(tabel).length > 0);
cek(
  'paket no-op dari sumber terdeteksi sebagai no-op di modul (persis, bukan tebakan)',
  modNoOp.length > 0 && samaUrut(modNoOp, sumberNoOpIds),
  `sumber=[${sumberNoOpIds.join(', ')}] modul=[${modNoOp.join(', ')}]`,
);
cek(
  'zephyr.lang-puppet (kasus .pp) ada di daftar no-op',
  modNoOp.includes('zephyr.lang-puppet'),
);
{
  const l = tabel['zephyr.lang-puppet'];
  const p = dariSumberNoOp.find((x) => x.id === 'zephyr.lang-puppet');
  cek(
    'label puppet menyebut NO-OP, ekstensi yang direbut, dan pemiliknya (.pp <- pascal)',
    !!l &&
      /NO-OP/.test(l.teks) &&
      l.ekstensiDitambah.length === 0 &&
      l.ekstensiTidakEfek.includes('.pp') &&
      p?.extsDirebut.some((d) => d.startsWith('.pp'.slice(1) + ' <- zephyr.lang-pascal')) === true &&
      /pascal/i.test(l.teks),
    `teks="${l?.teks ?? '(tidak ada)'}"`,
  );
}
cek(
  'paket no-op: pemilik ekstensi yang direbut muncul LEBIH DULU di katalog (PAKET_BAHASA)',
  dariSumberNoOp.every((p) =>
    p.extsDirebut.every((d) => {
      const q = paket.find((x) => x.id === d.split(' <- ')[1]);
      return !!q && q.posisi < p.posisi;
    }),
  ),
  dariSumberNoOp.map((p) => `${p.id} (posisi ${p.posisi}) direbut oleh ${p.extsDirebut.join(', ')}`).join(' | '),
);
cek(
  'paket ekstensi-sisa dari sumber terdeteksi + daftar ekstensinya persis',
  modSisa.length > 0 &&
    samaUrut(modSisa, sumberSisaIds) &&
    dariSumberSisa.every((p) => samaUrut(tabel[p.id]?.ekstensiDitambah ?? [], p.ekstensiBaruStr)),
  `sumber=[${sumberSisaIds.join(', ')}] modul=[${modSisa.join(', ')}]`,
);
{
  const salah = dariSumberSisa.filter((p) => {
    const l = tabel[p.id];
    if (!l) return true;
    /* The label text is ENGLISH (the app's default language); the CONTRACT is
       what is asserted, not the wording. Keep these in step with labelPaket.ts. */
    if (!l.teks.includes('already built in')) return true;
    if (!l.teks.includes('only adds')) return true;
    if (!l.teks.includes(l.bahasa)) return true;
    return !p.ekstensiBaruStr.every((e) => l.teks.includes(e));
  });
  cek(
    'tiap label ekstensi-sisa menulis "already built in" + bahasa + ekstensi sisa persis',
    salah.length === 0,
    salah.map((p) => p.id).join(', '),
  );
}
{
  const dilabeli = daftarLabel.map((l) => l.id);
  const salahLabel = dilabeli.filter((id) => dariSumberBaru.some((p) => p.id === id));
  const contoh = dariSumberBaru.slice(0, 3).map((p) => p.id);
  cek(
    `anti-salah-label: paket yang benar-benar menambah bahasa tidak dilabeli "already built in" (contoh: ${contoh.join(', ')})`,
    salahLabel.length === 0,
    salahLabel.join(', '),
  );
  cek(
    'anti-salah-label: paket no-op tidak ikut dilabeli "already built in"',
    !daftarLabel.some((l) => l.jenis === 'no-op' && l.teks.includes('already built in')),
  );
  cek(
    'anti-salah-label: tidak ada entri modul untuk paket bahasa-baru',
    daftarLabel.every((l) => l.jenis === 'no-op' || l.jenis === 'ekstensi-sisa'),
  );
}
cek(
  'tidak ada id hantu: tiap id di modul ada di katalog bawaan',
  (() => {
    const hantu = daftarLabel.map((l) => l.id).filter((id) => !semuaBahasa.includes(id));
    if (hantu.length) console.log(`         id hantu: ${hantu.join(', ')}`);
    return hantu.length === 0;
  })(),
);
cek(
  'tiap paket berkontribusi bahasa punya tepat satu status (no-op / ekstensi-sisa / bahasa-baru / tidak-diterapkan)',
  paket.every((p) => !!p.status || !p.diterapkan),
);
cek(
  'jumlah paket TIDAK berkurang: total id katalog sesudah == sebelum',
  semuaBahasa.length >= SEBELUM.idsKatalog &&
    idBahasa.length >= SEBELUM.paketBahasa &&
    idNonBahasa.length >= SEBELUM.paketNonBahasa &&
    katalogBundledTsJumlah >= SEBELUM.katalogBundledTs,
  `sesudah: ${semuaBahasa.length} (bahasa ${idBahasa.length} + non-bahasa ${idNonBahasa.length}), ` +
    `KATALOG_BUNDLED ${katalogBundledTsJumlah} | sebelum: ${SEBELUM.idsKatalog} ` +
    `(${SEBELUM.paketBahasa} + ${SEBELUM.paketNonBahasa}), KATALOG_BUNDLED ${SEBELUM.katalogBundledTs}`,
);
cek(
  'UI tetap menampilkan seluruh daftar (tidak ada paket yang disembunyikan/difilter karena label)',
  /*
   * `daftar.map(` muncul DUA kali dengan benar: sekali untuk kartu MCP
   * (`McpCatalog`) dan sekali untuk kartu ekstensi. Cek lama menuntut tepat satu
   * dan karena itu MERAH di HEAD juga — bukan karena ada yang menyaring, tapi
   * karena ada dua daftar yang memang sah. Yang penting adalah TIDAK ada
   * penyaringan berdasarkan label; itu yang dites di sini.
   */
  (uiTsx.match(/daftar\.map\(/g) ?? []).length >= 1 && !/\.filter\([^)]*labelPaket/.test(uiTsx),
);
cek(
  'UI memakai tabel label nyata (labelPaket(item.id)) dan menandai jenisnya',
  uiTsx.includes('labelPaket(item.id)') && uiTsx.includes('data-jenis-label={label.jenis}'),
);
cek(
  'label lama "melengkapi bahasa bawaan" sudah tidak dipakai di UI',
  !uiTsx.includes('melengkapi bahasa bawaan') && !uiTsx.includes('CATATAN_BAHASA'),
);

console.log('');
console.log('angka katalog:');
console.log(`  paket ditawarkan (bahasa + non-bahasa) : SEBELUM ${SEBELUM.idsKatalog} -> SESUDAH ${semuaBahasa.length}`);
console.log(`  paket bahasa                            : SEBELUM ${SEBELUM.paketBahasa} -> SESUDAH ${idBahasa.length}`);
console.log(`  paket non-bahasa                        : SEBELUM ${SEBELUM.paketNonBahasa} -> SESUDAH ${idNonBahasa.length}`);
console.log(`  paket berlabel jujur                    : 0 -> ${daftarLabel.length} (no-op ${modNoOp.length}, ekstensi-sisa ${modSisa.length})`);
try {
  const head = execFileSync('git', ['show', 'HEAD:src-tauri/src/ext_bundled.rs'], { encoding: 'utf8', cwd: AKAR });
  const headIds = [...new Set([...head.matchAll(/"id"\s*:\s*"(zephyr\.[a-z0-9.-]+)"/g)].map((m) => m[1]))];
  console.log(
    `  catatan: HEAD commit ext_bundled.rs punya ${headIds.length} id (angka 118->105 ada di ` +
      'docs/KEPUTUSAN-KATALOG-118-105.md, bukan dari perubahan label ini)',
  );
} catch (e) {
  console.log(`  catatan: git show HEAD gagal (${e.message.split('\n')[0]})`);
}

console.log('');
console.log(`== ${lulus}/${total} lulus ==`);
if (gagal.length) {
  console.log(`gagal: ${gagal.join(' | ')}`);
  process.exitCode = 1;
}
