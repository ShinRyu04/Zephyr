/**
 * A pasted screenshot must exist as a FILE, not only as a data URL.
 *
 * Bug 8. The `modlens` rule in `customInstructions` says images must be read
 * through the skill BEFORE answering about them, and `modlens` takes a path or a
 * URL. A pasted screenshot lives only in the composer as a data URL - it has
 * neither. So the rule promised something the pipeline could not deliver, and
 * the model was left describing an image it could not open.
 *
 * Run: node scripts/verify-lampiran-tempel.mjs
 *
 * The Rust command already existed (`simpan_gambar_temp`, written for the hosted
 * CLI path). This checks that the paste paths now USE it, and that its contract
 * is what the JS side assumes.
 */
import { readFileSync } from 'node:fs';
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

const panel = baca('src/components/ai/AiPanel.tsx');
const commands = baca('src/lib/commands.ts');
const rust = baca('src-tauri/src/gambar.rs');
const lib = baca('src-tauri/src/lib.rs');
const i18n = baca('src/lib/i18n-extra.ts');

console.log('\n1. Perintah Rust-nya ada dan terdaftar');
hasil(
  'simpan_gambar_temp didefinisikan di gambar.rs',
  /pub fn simpan_gambar_temp\(base64: String, ext: String\) -> ZResult<String>/.test(rust),
  'fungsi Rust tidak ditemukan',
);
hasil(
  'perintahnya terdaftar di handler lib.rs',
  /gambar::simpan_gambar_temp/.test(lib),
  'perintah tidak didaftarkan - invoke akan gagal',
);
hasil(
  'menulis ke folder temp, bukan workspace',
  /zephyr-paste/.test(rust),
  'tujuan temp tidak terlihat',
);
hasil(
  'ekstensi divalidasi terhadap allow-list',
  /"png" \| "jpg" \| "jpeg" \| "gif" \| "webp" \| "bmp"/.test(rust),
  'ekstensi diterima apa adanya',
);

console.log('\n2. Jembatan TS-nya ada');
hasil(
  'simpanGambarTemp diekspor dari commands.ts',
  /export const simpanGambarTemp = \(base64: string, ext: string\) =>/.test(commands),
  'binding TS tidak ditemukan',
);

console.log('\n3. Jalur tempel MEMAKAI perintah itu');
hasil(
  'AiPanel mengimpor simpanGambarTemp',
  /import \{[^}]*simpanGambarTemp[^}]*\} from '\.\.\/\.\.\/lib\/commands'/.test(panel),
  'belum diimpor - jalur tempel tidak menulis apa pun',
);
hasil(
  'ada satu helper yang menulis data URL ke berkas',
  /const simpanJalurGambar = async \(dataUrl: string\)/.test(panel),
  'helper penulis tidak ada',
);
hasil(
  'helper mem-parse data URL (mime + base64)',
  /data:image\\\/\(\[a-z0-9\+\.-\]\+\);base64,/.test(panel),
  'data URL tidak dipecah - base64 mentah akan salah',
);
/*
 * BOTH paste routes must call it. Checking only one would leave the other
 * silently half-fixed, and the composer's own `onPaste` is the route a reader
 * actually uses (Ctrl+V into the textarea).
 *
 * Counted as `await simpanJalurGambar(` + `.then(`-chained call, i.e. CALLS.
 * The definition itself (`const simpanJalurGambar = async (...)`) is excluded on
 * purpose - including it made an earlier version of this check report 3 and pass
 * for the wrong reason.
 */
const panggilan = [
  ...panel.matchAll(/(?:await\s+|void\s+)simpanJalurGambar\(/g),
].length;
hasil(
  'dipakai di kedua jalur tempel (tombol + onPaste)',
  panggilan >= 2,
  `cuma ${panggilan} pemanggilan (2 diharapkan: tempelGambar + onPaste)`,
);
hasil(
  'kegagalan menulis tidak menggagalkan lampiran',
  /catch \{\s*return null;\s*\}/.test(panel),
  'helper melempar - lampiran ikut gagal saat temp tidak bisa ditulis',
);

console.log('\n4. Kunci i18n ada di 10 bahasa');
const kunci = [...i18n.matchAll(/^\s*'Screenshot attached \(\{path\}\)':/gm)].length;
hasil(`kunci baru ada di 10 blok bahasa (${kunci})`, kunci === 10, `ditemukan ${kunci}`);
hasil(
  'placeholder {path} dipertahankan di semua bahasa',
  (i18n.match(/'Screenshot attached \(\{path\}\)':\s*'[^']*\{path\}[^']*'/g) ?? []).length === 10,
  'ada terjemahan yang membuang placeholder - path tidak akan tampil',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
