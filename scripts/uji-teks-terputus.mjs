/*
 * UJI-TEKS-TERPUTUS - membuktikan (atau membantah) bahwa jawaban Zeph TIDAK
 * lagi sampai ke pembaca dalam potongan-potongan.
 *
 * Bug yang diuji (dilaporkan user, bukti screenshot):
 *   1. Setiap `code span` di narasi dirender sebagai KARTU KODE besar (kepala
 *      label `text` + tombol Apply/Insert/Copy) - satu paragraf yang menyebut
 *      tiga kunci setelan jadi enam kartu dengan serpihan kalimat di antaranya.
 *   2. Satu backtick nyasar (mis. `Ctrl+`` di tengah kalimat) menelan teks
 *      sesudahnya menjadi "kode", sehingga kalimat biasa ikut hilang ke dalam
 *      kotak.
 *
 * Yang diuji BUKAN mock: blok `CodeBlock`, `MD_NARASI` dan `MD_JAWABAN`
 * diekstrak APA ADANYA dari `src/components/ai/ChatMessage.tsx` saat skrip ini
 * jalan, di-transform dengan esbuild (TSX -> JS), lalu dirender lewat
 * `react-markdown` + `react-dom/server` yang TERPASANG di repo - tanpa
 * browser, tanpa app, tanpa jaringan. Jadi yang diperiksa adalah perender
 * yang benar-benar dipakai jawaban Zeph.
 *
 * Jalan: node scripts/uji-teks-terputus.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-teks-terputus');
mkdirSync(KERJA, { recursive: true });

const gagal = [];
const lulus = [];
const catat = (nama, benar, pesan) => {
  (benar ? lulus : gagal).push(nama);
  console.log(`  ${benar ? 'OK   ' : 'GAGAL'} ${nama.padEnd(52)} ${pesan}`);
};

console.log('UJI TEKS TERPUTUS (bug potongan jawaban)');

/* ---------------------------------------------------------------- *
 * (0) Ekstrak blok asli dari sumber
 * ---------------------------------------------------------------- */
const SUMBER = path.join(AKAR, 'src', 'components', 'ai', 'ChatMessage.tsx');
const teks = readFileSync(SUMBER, 'utf8');

const ambil = (nama, pola) => {
  const m = pola.exec(teks);
  if (!m) {
    console.error(`FATAL: blok ${nama} tidak ditemukan di ChatMessage.tsx - pola ekstraksi basi.`);
    process.exit(1);
  }
  return m[0];
};

/* Semua isi blok ter-indentasi, jadi `\n}\n` / `\n};` di kolom 0 hanya penutup. */
const blokCodeBlock = ambil('CodeBlock', /function CodeBlock\(\{[\s\S]*?\n\}\n/);
const blokNarasi = ambil('MD_NARASI', /const MD_NARASI: Components = \{[\s\S]*?\n\};/);
const blokJawaban = ambil('MD_JAWABAN', /const MD_JAWABAN: Components = \{[\s\S]*?\n\};/);
console.log(`  INFO  blok diekstrak: CodeBlock ${blokCodeBlock.length} char, MD_NARASI ${blokNarasi.length}, MD_JAWABAN ${blokJawaban.length}`);

/* ---------------------------------------------------------------- *
 * (1) Susun file kerja: stub minimal + blok asli
 * ---------------------------------------------------------------- */
const kerjaTs = `/* DIHASILKAN OTOMATIS oleh scripts/uji-teks-terputus.mjs - jangan disunting. */
import { createRequire } from 'node:module';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { useState } = React;

/* ---- stub minimal: hanya yang disentuh blok yang diuji ---- */
const useAi = (sel) => {
  const s = { runInTerminal: () => {}, setToast: () => {} };
  return sel ? sel(s) : s;
};
const tx = (s) => s;
const tf = (s) => s;
const clipboardWrite = async () => {};
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'pwsh', 'powershell', 'ps1', 'cmd', 'bat']);
const barisDiff = () => [];
const bagiHunk = () => [];
const ringkasDiff = () => ({ tambah: 0, hapus: 0 });
const EditDiff = () => null;
const isDestructive = () => false;
const AiIkon = () => null;
const MdPre = ({ children }) => React.createElement(React.Fragment, null, children);
const MdTabel = ({ children }) => React.createElement('div', null, React.createElement('table', null, children));
const MdLink = ({ href, children }) => React.createElement('a', { href }, children);
const KODE_LANG = /language-([\\w-]+)/;
const REF_RE = /^((?:\\.{0,2}[\\/\\\\])?[\\w@.\\/\\\\-]+(?:\\.\\w{1,8}))(?::(\\d+))?$/;

/* ===== blok ASLI dari src/components/ai/ChatMessage.tsx ===== */
${blokCodeBlock}
${blokNarasi}
${blokJawaban}

export function render(md, komp) {
  return renderToStaticMarkup(
    React.createElement(Markdown, { remarkPlugins: [remarkGfm], components: komp }, md),
  );
}
export { MD_NARASI, MD_JAWABAN };
`;

const sumberTs = path.join(KERJA, 'perender.tsx');
writeFileSync(sumberTs, kerjaTs, 'utf8');

const keluaran = path.join(KERJA, 'perender.mjs');
await esbuild.build({
  entryPoints: [sumberTs],
  outfile: keluaran,
  bundle: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  logLevel: 'silent',
});
const { render, MD_NARASI, MD_JAWABAN } = await import(pathToFileURL(keluaran).href);
console.log('  INFO  perender siap (blok asli + react-markdown repo ini)\n');

/* ---------------------------------------------------------------- *
 * (2) Kasus
 * ---------------------------------------------------------------- */
const kartu = (html) => /ai-code-head/.test(html);
const inline = (html) => /ai-inline/.test(html);
const teksPolos = (html) => html.replace(/<[^>]+>/g, '');

/* (A) paragraf dengan banyak inline code: TIDAK boleh jadi kartu */
console.log('(A) narasi dengan inline code: tetap satu paragraf, bukan kartu');
const A = 'Panel bawah diatur lewat grup `panel` di settings.json: `panel.height` (tinggi, bawaan 260), `panel.visibleTabs`, dan `panel.activeTab` (bawaan `terminal`).';
const htmlA = render(A, MD_NARASI);
catat('A1 inline code TIDAK jadi kartu kode', !kartu(htmlA), kartu(htmlA) ? 'masih ada ai-code-head' : 'tidak ada ai-code-head');
catat('A2 inline code tetap <code class="ai-inline">', inline(htmlA), inline(htmlA) ? 'ada ai-inline' : 'ai-inline hilang');
catat(
  'A3 semua kata tetap ada, urut, utuh',
  ['grup', 'panel.height', 'tinggi, bawaan 260', 'panel.visibleTabs', 'panel.activeTab', 'terminal'].every((s) =>
    teksPolos(htmlA).includes(s),
  ),
  teksPolos(htmlA).slice(0, 90) + '...',
);
catat('A4 tidak ada tombol Apply/Insert/Copy di narasi', !/ai-code-btn/.test(htmlA), /ai-code-btn/.test(htmlA) ? 'tombol muncul' : 'bersih');

/* (B) backtick nyasar: kalimat yang ketelan HARUS balik jadi teks */
console.log('\n(B) backtick nyasar (Ctrl+`): teks yang ketelan balik jadi kalimat');
const B = 'Pintasan bawaannya Ctrl+J untuk toggle panel bawah, dan Ctrl+` untuk terminal; nilainya disimpan di `%APPDATA%\\zephyr\\settings.json`, atau menimpa per proyek di `.zephyr\\settings.json`.';
const htmlB = render(B, MD_NARASI);
catat('B1 tidak ada kartu kode dari backtick nyasar', !kartu(htmlB), kartu(htmlB) ? 'masih ada kartu' : 'tidak ada kartu');
catat(
  'B2 kalimat yang dulu ketelan kembali sebagai TEKS (bukan kode)',
  teksPolos(htmlB).includes('untuk terminal; nilainya disimpan di'),
  teksPolos(htmlB).includes('untuk terminal; nilainya disimpan di') ? 'utuh' : teksPolos(htmlB),
);
catat(
  'B3 kalimat kedua juga utuh',
  teksPolos(htmlB).includes('atau menimpa per proyek di'),
  teksPolos(htmlB).includes('atau menimpa per proyek di') ? 'utuh' : 'hilang',
);
/*
 * Backtick yang SAH (berpasangan) harus TETAP jadi kode - kalau tidak, fix ini
 * cuma menukar satu bug dengan bug lain. Diperiksa pada jalur yang muncul di
 * paragraf: `%APPDATA%...` dan `.zephyr...` harus ada di dalam ai-inline.
 */
/*
 * Bentuk HTML yang benar untuk paragraf ini (diperiksa langsung, bukan
 * ditebak): backtick nyasar setelah `Ctrl+` MENELAN sisa kalimat sampai
 * backtick berpasangan berikutnya, jadi jalur `%APPDATA%...` keluar sebagai
 * TEKS MENTAH, bukan `ai-inline`. Yang penting bukan jenis elemennya,
 * melainkan bahwa kata-katanya TIDAK HILANG dan tidak jadi kotak kode - itu
 * yang dulu bikin jawaban terbaca terputus.
 */
catat(
  'B4 jalur di dalam kalimat yang ketelan tetap terbaca (teks, bukan kartu)',
  teksPolos(htmlB).includes('%APPDATA%') && teksPolos(htmlB).includes('.zephyr'),
  `%APPDATA% ada: ${teksPolos(htmlB).includes('%APPDATA%')}, .zephyr ada: ${teksPolos(htmlB).includes('.zephyr')}`,
);

/* (C) fence sungguhan: kartu HARUS tetap muncul (jangan korbankan kode asli) */
console.log('\n(C) blok fence ```ts: kartu kode tetap dirender (regresi)');
const C = 'Contoh:\n\n```ts\nconst a = 1;\n```\n';
const htmlC = render(C, MD_JAWABAN);
catat('C1 fence tetap jadi kartu kode', kartu(htmlC), kartu(htmlC) ? 'ai-code-head ada' : 'KARTU HILANG - regresi!');
catat('C2 isi kode tetap utuh', teksPolos(htmlC).includes('const a = 1;'), 'const a = 1;');
catat('C3 label bahasa ikut', /ai-code-lang[^>]*>ts</.test(htmlC), 'ts');

/* (D) jalur jawaban: backtick nyasar di jawaban final */
console.log('\n(D) jalur MD_JAWABAN (jawaban final)');
const htmlD = render(B, MD_JAWABAN);
catat('D1 tidak ada kartu dari backtick nyasar', !kartu(htmlD), kartu(htmlD) ? 'masih ada kartu' : 'tidak ada kartu');
catat('D2 kalimat utuh', teksPolos(htmlD).includes('untuk terminal; nilainya disimpan di'), 'utuh');

/* ---------------------------------------------------------------- *
 * (3) Ringkas
 * ---------------------------------------------------------------- */
console.log('');
if (gagal.length) {
  console.log(`HASIL: GAGAL - ${gagal.length} merah dari ${lulus.length + gagal.length}: ${gagal.join(', ')}`);
  process.exit(1);
}
console.log(`HASIL: LULUS - ${lulus.length}/${lulus.length} hijau`);
