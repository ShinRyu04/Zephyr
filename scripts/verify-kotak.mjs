/**
 * `kotak` — the model can draw a formatted box, and it cannot draw an empty one.
 *
 * Two things to prove:
 *   1. the string the tool emits is EXACTLY the shape the renderer parses
 *      (`judul` / optional `ringkas` / `---` / rows) - a mismatch would show the
 *      reader a box full of raw text;
 *   2. a box with no rows is REFUSED, because an empty frame is worse than no
 *      frame: it looks like the answer was cut off.
 *
 * Run: node scripts/verify-kotak.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

const { rakitKotak, kotakTool } = await import(
  pathToFileURL(join(akar, 'src/lib/zephyrTools/kotak.ts')).href
);

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

const chat = baca('src/components/ai/ChatMessage.tsx');
const css = baca('src/styles/ai.css');

console.log('\n1. Bentuk keluaran = bentuk yang diparse renderer');
{
  const teks = rakitKotak('Ringkasan', 'satu baris', [
    { label: 'Baris', nilai: 'isi' },
    { label: 'Bagian', judul: true },
    { label: 'Kedua', nilai: 'isi dua' },
  ]);
  const baris = teks.split('\n');
  hasil('dibuka fence ```kotak', baris[0] === '```kotak', baris[0]);
  hasil('ditutup fence ```', baris[baris.length - 1] === '```', baris[baris.length - 1]);
  hasil('judul di baris kedua', baris[1] === 'Ringkasan', baris[1]);
  hasil('ringkasan di baris ketiga', baris[2] === 'satu baris', baris[2]);
  hasil('pemisah --- ada', baris[3] === '---', baris[3]);
  hasil('baris label|nilai', baris[4] === 'Baris | isi', baris[4]);
  hasil('judul bagian tanpa pipa', baris[5] === 'Bagian', baris[5]);
}

console.log('\n2. Renderer memakai pemisah dan pipa yang sama');
hasil(
  "renderer mencari '---' sebagai pemisah",
  /findIndex\(\(b\) => b\.trim\(\) === '---'\)/.test(chat),
  'pemisah tidak dikenali - seluruh isi akan jadi judul',
);
/*
 * The renderer must split on the FIRST pipe that is not escaped.
 *
 * Asserted by BEHAVIOUR, not by matching the regex literal: the escaping in a
 * regex-as-string is unreadable and an earlier version of this check failed on
 * correct code purely because the pattern text differed. The behaviour is what
 * matters - a value containing `|` must keep it.
 */
const ujiPecah = (() => {
  /* Pull the split expression straight out of the component. */
  const m = /const m = (\/\^.*?\/)\.exec\(b\)/.exec(chat);
  if (!m) return null;
  try {
    const re = eval(m[1]); // eslint-disable-line no-eval -- harness only
    return (baris) => {
      const r = re.exec(baris);
      return r ? [r[1], r[2]] : null;
    };
  } catch {
    return null;
  }
})();
hasil('ekspresi pemecah terbaca dari komponen', ujiPecah !== null, 'tidak menemukan `const m = ...exec(b)`');
if (ujiPecah) {
  hasil('baris biasa terpecah di pipa', JSON.stringify(ujiPecah('Label | Nilai')) === JSON.stringify(['Label ', ' Nilai']), String(ujiPecah('Label | Nilai')));
  const dgnPipa = ujiPecah('a\\|b | c\\|d');
  hasil(
    'pipa ter-escape TIDAK jadi pemisah',
    dgnPipa !== null && dgnPipa[0].includes('a\\|b') && dgnPipa[1].includes('c\\|d'),
    JSON.stringify(dgnPipa),
  );
}
hasil(
  'renderer mengembalikan escape \\| jadi |',
  /replace\(\/\\\\\\\|\\\/g, '\\|'\)/.test(chat),
  'escape dari tool tidak dibuka kembali di layar',
);
hasil(
  'baris tanpa pipa jadi judul bagian',
  /ai-kotak-bagian/.test(chat),
  'judul bagian tidak punya gaya sendiri',
);

console.log('\n3. Kotak kosong DITOLAK');
{
  let pesan = '';
  try {
    await kotakTool.run({ judul: 'Kosong', baris: [] });
  } catch (e) {
    pesan = e.message;
  }
  hasil('tanpa baris -> error', /minimal satu baris/.test(pesan), pesan || '(diterima)');
}
{
  let pesan = '';
  try {
    await kotakTool.run({ baris: [{ label: 'a', nilai: 'b' }] });
  } catch (e) {
    pesan = e.message;
  }
  hasil('tanpa judul -> error', /butuh "judul"/.test(pesan), pesan || '(diterima)');
}
{
  let pesan = '';
  try {
    await kotakTool.run({ judul: 'X', baris: [{ nilai: 'tanpa label' }] });
  } catch (e) {
    pesan = e.message;
  }
  hasil('baris tanpa label -> error', /tidak punya "label"/.test(pesan), pesan || '(diterima)');
}

console.log('\n4. Pipa di label/nilai di-escape, bukan merusak baris');
{
  const teks = await kotakTool.run({
    judul: 'Uji',
    baris: [{ label: 'a|b', nilai: 'c|d' }],
  });
  hasil('label memuat \\|', teks.includes('a\\|b'), teks);
  hasil('nilai memuat \\|', teks.includes('c\\|d'), teks);
  /*
   * After un-escaping, the row must have exactly ONE pipe left: the separator.
   * `a\|b | c\|d` -> `ab | cd` -> one pipe. An earlier version counted pipes in
   * the RAW line, which of course found the escaped ones too.
   */
  const barisIsi = teks.split('\n').find((b) => b.includes('a\\|b')) ?? '';
  const tanpaEscape = barisIsi.replace(/\\\|/g, '');
  hasil('tetap satu pemisah setelah escape dibuka', (tanpaEscape.match(/\|/g) ?? []).length === 1, tanpaEscape);
}

console.log('\n5. Nilai kosong BUKAN judul bagian');
{
  /* A row that means "nothing found" must stay a row with an empty value. */
  const teks = await kotakTool.run({
    judul: 'Uji',
    baris: [{ label: 'Hasil', nilai: '' }],
  });
  hasil('baris dengan nilai kosong tetap punya pipa', /Hasil \| $/m.test(teks), JSON.stringify(teks));
}

console.log('\n6. Gaya ada dan memakai token tema');
for (const kelas of ['.ai-kotak', '.ai-kotak-head', '.ai-kotak-judul', '.ai-kotak-baris', '.ai-kotak-label', '.ai-kotak-nilai', '.ai-kotak-bagian']) {
  hasil(`gaya ${kelas} ada`, new RegExp(`\\${kelas}\\b`).test(css), 'tidak ditemukan di ai.css');
}
hasil(
  'warna memakai var(--...), bukan hex',
  !/\.ai-kotak[^{]*\{[^}]*#[0-9a-f]{3,6}/i.test(css),
  'ada hex hard-coded - kotak akan mengabaikan tema pembaca',
);
hasil(
  'nilai panjang membungkus, bukan menggeser panel',
  /\.ai-kotak-nilai\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css),
  'nilai panjang akan memaksa scroll mendatar',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
