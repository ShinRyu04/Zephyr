/**
 * Every tool name the model is TOLD to call must actually exist.
 *
 * This is the defect class behind bug 5: `zephyrSelf.ts` instructed the model to
 * refresh the index "via suggest_command", but `suggest_command` had been
 * removed from the catalogue. The model did what it was told, found nothing,
 * and spun through `tool_search` looking for a tool that was not there. Nothing
 * threw - the instruction was just a dead end.
 *
 * `catalog.ts` already warns about this in prose ("SEMUA nama yang diroute
 * prompt harus ikut dikirim ... kalau tidak, model disuruh memanggil tool yang
 * tidak ada"). A comment cannot fail a build; this can.
 *
 * Run: node scripts/verify-tool-hidup.mjs
 *
 * ## What counts as "the model is told"
 *
 * Only text the model actually reads as instruction:
 *   - `description:` literals in the tool specs (zephyrTools/*.ts)
 *   - `systemPrompt.ts`
 *
 * NOT comments. Comments discuss tools that were merged or removed on purpose
 * ("DIPANGKAS: `create_directory` dibuang") and flagging those would bury the
 * real defect under two dozen false positives - which is how a check like this
 * gets switched off.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

const AWALAN = 'mcp__zephyr__';
const telanjang = (n) => (n.startsWith(AWALAN) ? n.slice(AWALAN.length) : n);

const berkas = readdirSync(join(akar, 'src/lib/zephyrTools')).filter((n) => n.endsWith('.ts'));

/**
 * Tool files that live OUTSIDE `zephyrTools/`.
 *
 * `zephyr_kode` is defined in `src/lib/bacaKode.ts`, not in the folder - and the
 * first version of this harness missed it for exactly that reason, reporting it
 * as "catalogue entry with no definition". A tool defined somewhere else is
 * still a tool; the list has to follow the code, not the folder name.
 */
const BERKAS_TOOL_LUAR = ['src/lib/bacaKode.ts'];

/** Every tool the code defines, both namespaced and bare. */
const terdefinisi = new Set();
for (const n of [...berkas.map((x) => `src/lib/zephyrTools/${x}`), ...BERKAS_TOOL_LUAR]) {
  const isi = baca(n);
  for (const m of isi.matchAll(/\bname:\s*'([a-z_0-9]+)'/g)) {
    terdefinisi.add(m[1]);
    terdefinisi.add(telanjang(m[1]));
  }
  /*
   * `worktree.ts` names its tools through constants (`name: PERINTAH_DAFTAR`),
   * so the literal scan above cannot see them. Read the exported list instead -
   * it exists precisely so tests do not have to guess.
   */
  for (const m of isi.matchAll(/NAMA_TOOL_WORKTREE[^=]*=\s*\[([\s\S]*?)\]/g)) {
    for (const x of m[1].matchAll(/'([a-z_0-9]+)'/g)) {
      terdefinisi.add(x[1]);
      terdefinisi.add(telanjang(x[1]));
    }
  }
}

const katalog = baca('src/lib/zephyrTools/catalog.ts');

console.log('\n1. Nama tool yang didefinisikan');
hasil(
  `ada tool yang terdefinisi (${terdefinisi.size} nama, termasuk bentuk tanpa awalan MCP)`,
  terdefinisi.size >= 40,
  `cuma ${terdefinisi.size} - pembacaan sumber gagal?`,
);

console.log('\n2. Tiap tool di TOOL_DIKIRIM_SELALU benar-benar ada');
const blokKirim = /export const TOOL_DIKIRIM_SELALU[^=]*=\s*\[([\s\S]*?)\];/.exec(katalog);
hasil('TOOL_DIKIRIM_SELALU ditemukan', !!blokKirim, 'konstanta tidak terbaca');
if (blokKirim) {
  const nama = [...blokKirim[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
  const hilang = nama.filter((n) => !terdefinisi.has(n));
  hasil(
    `semua ${nama.length} tool yang selalu dikirim punya definisi`,
    hilang.length === 0,
    `tidak terdefinisi: ${hilang.join(', ')}`,
  );
}

console.log('\n3. Tiap tool di katalog punya definisi');
const namaKatalog = [...katalog.matchAll(/^\s*\['([a-z_0-9]+)',/gm)].map((m) => m[1]);
const katalogHilang = namaKatalog.filter((n) => !terdefinisi.has(n));
hasil(
  `semua ${namaKatalog.length} entri katalog punya definisi`,
  katalogHilang.length === 0,
  `tidak terdefinisi: ${katalogHilang.join(', ')}`,
);

console.log('\n4. Nama tool yang disebut di TEKS INSTRUKSI harus ada');

/**
 * Pull only the `description:` literals - the text the model reads as a tool's
 * own contract. Adjacent concatenated strings (`'a' + 'b'`) are joined because
 * that is how they arrive at the model.
 */
function deskripsiSpec(isi) {
  const keluar = [];
  const re = /\bdescription:\s*((?:\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))+)/g;
  for (const m of isi.matchAll(re)) {
    const gabung = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]).join('');
    keluar.push(gabung);
  }
  return keluar.join('\n');
}

const teksInstruksi = [];
for (const n of berkas) {
  const d = deskripsiSpec(baca(`src/lib/zephyrTools/${n}`));
  if (d) teksInstruksi.push([`src/lib/zephyrTools/${n} (deskripsi)`, d]);
}
teksInstruksi.push(['src/lib/systemPrompt.ts', baca('src/lib/systemPrompt.ts')]);

/*
 * Words that LOOK like tool names but are not. Listed explicitly, not
 * pattern-matched: a fuzzy rule would hide the bug this exists for.
 */
const BUKAN_TOOL = new Set([
  'allowlist_web', 'izin_isi_web', 'host_luar_allowlist', 'tanpa_argumen',
  'bodi_terlalu_besar', 'batas_redirect_terlampaui', 'skema_terlarang',
  'ip_privat', 'port_tak_lazim', 'penanda_akhir', 'tanpa_bawaan',
  'tidak_ada', 'ada_di_indeks', 'sudah_segar', 'belum_segar',
  /*
   * `systemPrompt.ts` names the MCP prefix to FORBID it in answers ("never
   * mention internal prefixes like mcp__zephyr__"). The underscore form is the
   * same prohibition. Neither is a tool name.
   */
  'mcp_zephyr', 'mcp_server',
  /* Parameter names quoted in prose, not tools. */
  'panjang_karakter', 'apply_to', 'in_progress',
]);

/** A tool-ish token: snake_case with at least one underscore. */
const calonTool = (t) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(t) && !BUKAN_TOOL.has(t);

const disebut = new Map();
for (const [rel, isi] of teksInstruksi) {
  for (const m of isi.matchAll(/(?<![A-Za-z0-9_`])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?![A-Za-z0-9_])/g)) {
    const t = m[1];
    if (!calonTool(t)) continue;
    if (!disebut.has(t)) disebut.set(t, new Set());
    disebut.get(t).add(rel);
  }
}

const mati = [];
for (const [nama, tempat] of disebut) {
  if (terdefinisi.has(nama)) continue;
  mati.push(`${nama}  <- ${[...tempat].join(', ')}`);
}
hasil(
  `semua ${disebut.size} nama bergaya-tool di teks instruksi punya definisi`,
  mati.length === 0,
  mati.join('\n         '),
);

console.log('\n5. suggest_command tidak lagi disuruh');
const semuaTeks = teksInstruksi.map(([, isi]) => isi).join('\n');
hasil(
  'teks instruksi tidak menyuruh suggest_command (tool itu sudah dihapus)',
  !/suggest_command/.test(semuaTeks),
  'masih ada rujukan suggest_command - model akan mencari tool yang tidak ada',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
