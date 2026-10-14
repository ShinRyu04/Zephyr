/*
 * UJI-TABEL-MARKDOWN - kenapa jawaban Zeph "belum bisa mengeluarkan TABEL"
 * (item ZEPH-FORMAT-TABEL).
 *
 * Yang diuji BUKAN mock: perender MARKDOWN YANG SAMA dengan yang dipakai
 * jawaban Zeph di `src/components/ai/ChatMessage.tsx`:
 *   - baris 206:  const MD_PLUGINS = [remarkGfm];
 *   - baris 773/825/954: <Markdown remarkPlugins={MD_PLUGINS} .../>
 * Skrip ini memakai react-markdown + remark-gfm yang TERPASANG di repo (tanpa
 * bundling, jadi benar-benar versi yang dipakai app), merender teks Markdown
 * lewat `react-dom/server` (tanpa browser, tanpa app, tanpa jaringan), lalu
 * memeriksa HTML hasilnya. Jadi hasilnya nyata, bukan klaim.
 *
 * Jalan: node scripts/uji-tabel-markdown.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-tabel-markdown');
mkdirSync(KERJA, { recursive: true });

const gagal = [];
const lulus = [];
const catat = (nama, benar, pesan) => {
  (benar ? lulus : gagal).push(nama);
  console.log(`  ${benar ? 'OK   ' : 'GAGAL'} ${nama.padEnd(44)} ${pesan}`);
};
const info = (nama, pesan) => console.log(`  INFO  ${nama.padEnd(44)} ${pesan}`);

console.log('UJI TABEL MARKDOWN (ZEPH-FORMAT-TABEL)');

/* ---------------------------------------------------------------- *
 * (0) Perender yang dipakai app: baca ChatMessage.tsx APA ADANYA
 * ---------------------------------------------------------------- */
console.log('\n(0) perender yang dipakai jawaban Zeph (dibaca dari sumber)');
const SUMBER_CHAT = path.join(AKAR, 'src', 'components', 'ai', 'ChatMessage.tsx');
const teksChat = readFileSync(SUMBER_CHAT, 'utf8');

catat(
  'plugin GFM terpasang di ChatMessage.tsx',
  /const MD_PLUGINS = \[remarkGfm\]/.test(teksChat),
  'MD_PLUGINS = [remarkGfm]',
);
catat(
  'jawaban dirender lewat <Markdown remarkPlugins={MD_PLUGINS}>',
  /<Markdown remarkPlugins=\{MD_PLUGINS\} components=\{MD_JAWABAN\}>/.test(teksChat),
  'komponen MD_JAWABAN',
);
const blokJawaban = (teksChat.match(/const MD_JAWABAN: Components = \{[\s\S]*?\n\};/) ?? [''])[0];
info('MD_JAWABAN menimpa `table`', /\btable\s*:/.test(blokJawaban) ? 'ya' : 'tidak (pakai bawaan react-markdown)');
info('pembungkus scroll tabel', /ai-table-wrap|tableWrap|overflowX/.test(teksChat) ? 'ada' : 'tidak ada');

/* ---------------------------------------------------------------- *
 * (1) Bundel react-markdown + remark-gfm repo ini
 * ---------------------------------------------------------------- */
const ENTRI = path.join(KERJA, 'perender.mjs');
writeFileSync(
  ENTRI,
  `import { createRequire } from 'node:module';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
export function render(md) {
  return renderToStaticMarkup(React.createElement(Markdown, { remarkPlugins: [remarkGfm] }, md));
}
`,
  'utf8',
);

const { render } = await import(pathToFileURL(ENTRI).href);

/* ---------------------------------------------------------------- *
 * (2) Kasus render
 * ---------------------------------------------------------------- */
const punyaTabel = (html) => /<table[^>]*>/.test(html) && /<td[^>]*>/.test(html);

console.log('\n(1) render nyata (react-dom/server, react-markdown@9 + remark-gfm@4)');

/* Kasus A - bentuk IDEAL: tabel didahului baris kosong. */
const A = 'Berikut tabelnya:\n\n| Setelan | Default |\n| --- | --- |\n| theme | dark |\n| fontSize | 13 |\n';
const hA = render(A);
catat('A tabel didahului baris kosong', punyaTabel(hA), punyaTabel(hA) ? 'HTML memuat <table><td>' : 'TIDAK jadi tabel');
if (!punyaTabel(hA)) console.log('     HTML:', hA.slice(0, 300));

/* Kasus B - bentuk yang SERING dikeluarkan model: tabel menempel di baris
   berikutnya tanpa baris kosong. */
const B = 'Berikut tabelnya:\n| Setelan | Default |\n| --- | --- |\n| theme | dark |\n| fontSize | 13 |\n';
const hB = render(B);
catat('B tabel TANPA baris kosong di depan', punyaTabel(hB), punyaTabel(hB) ? 'HTML memuat <table><td>' : 'TIDAK jadi tabel (pipa tampil mentah)');
if (!punyaTabel(hB)) console.log('     HTML:', hB.slice(0, 300));

/* Kasus C - tabel di awal jawaban (tanpa teks pembuka). */
const C = '| Setelan | Default |\n| --- | --- |\n| theme | dark |\n';
const hC = render(C);
catat('C tabel di awal jawaban', punyaTabel(hC), punyaTabel(hC) ? 'HTML memuat <table><td>' : 'TIDAK jadi tabel');

/* Kasus D - daftar + tabel (pola "daftar seperti agen luar"). */
const D = 'Yang berubah:\n\n- theme\n- fontSize\n\n| Kunci | Nilai |\n| --- | --- |\n| theme | light |\n';
const hD = render(D);
catat('D daftar + tabel', punyaTabel(hD) && /<ul[^>]*>/.test(hD), punyaTabel(hD) ? 'tabel + <ul> keduanya ada' : 'tabel tidak jadi');

/* Kasus E - pipa di dalam kode fenced TIDAK boleh jadi tabel. */
const E = 'Contoh perintah:\n\n```bash\necho "a | b"\n```\n';
const hE = render(E);
catat('E pipa di dalam kode tetap kode', !punyaTabel(hE) && /<code/.test(hE), !punyaTabel(hE) ? 'bukan tabel (benar)' : 'salah jadi tabel');

/* Kasus F - tabel GFM di dalam blockquote (dipakai di catatan), tidak wajib. */
const F = '> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n';
const hF = render(F);
catat('F tabel di dalam blockquote', punyaTabel(hF), punyaTabel(hF) ? 'jadi tabel' : 'tidak jadi tabel (informasi)');

/* ---------------------------------------------------------------- *
 * (3) Verdict
 * ---------------------------------------------------------------- */
const mutlak = ['A tabel didahului baris kosong', 'C tabel di awal jawaban', 'E pipa di dalam kode tetap kode'];
const merahMutlak = gagal.filter((g) => mutlak.includes(g));

console.log('');
console.log(`  SKOR: ${lulus.length} lulus / ${lulus.length + gagal.length} diperiksa`);
if (merahMutlak.length) {
  console.log(`  VERDICT: GAGAL - perender tidak sanggup tabel dasar: ${merahMutlak.join(', ')}`);
  process.exit(1);
}
if (gagal.length) {
  console.log(`  VERDICT: LULUS BERSYARAT - perender sanggup tabel, tapi ${gagal.length} bentuk tidak lolos: ${gagal.join(', ')}`);
  process.exit(0);
}
console.log('  VERDICT: LULUS - perender sanggup mengeluarkan tabel GFM di semua bentuk yang diuji');
process.exit(0);
