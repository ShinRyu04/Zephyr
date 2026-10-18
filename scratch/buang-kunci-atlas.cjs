/*
 * Buang kunci i18n milik Atlas dari sepuluh kamus.
 *
 * Kunci yatim tidak merusak apa pun, tapi mereka adalah beban terjemahan: orang
 * berikutnya yang membaca kamus akan mengira fiturnya masih ada, dan akan
 * menerjemahkan teks yang tidak pernah tampil.
 */
const fs = require('fs');
const path = 'src/lib/i18n.ts';

const KUNCI = [
  'Atlas',
  'Map',
  'Cards',
  'generated',
  'Search the Map',
  'Search Cards',
  'Map (for you) and Cards (for agents) are generated and updated together from your codebase.',
  'Generate Your Atlas',
  'Generated {n} Map pages and {m} Cards',
  'Nothing generated yet. Press Generate in the editor to build the Map and the Cards.',
  'Open a folder first — Atlas describes a workspace, and there is none open.',
  'Use the /knowledge-plan command to generate Atlas conversations',
  'Document this codebase as pages you can read and as cards your agent can cite.',
  'Regenerate when a new commit lands.',
  'Write the pages into .zephyr/ in this folder.',
  'Let the agent cite these pages when it answers.',
  'Exported {ok} pages to .zephyr/',
  'Exported {ok} pages, {gagal} failed',
  'Imported {ok} pages from .zephyr/',
  'Imported {ok} pages, {gagal} failed',
  'Nothing to export yet - generate first.',
  'Nothing to import yet - export to .zephyr/ first.',
  'Last generated',
];

const baris = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const eol = fs.readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pola = KUNCI.map((k) => new RegExp("^\\s*'" + esc(k) + "':"));

let buang = 0;
const sisa = baris.filter((b) => {
  if (pola.some((p) => p.test(b))) {
    buang++;
    return false;
  }
  return true;
});

fs.writeFileSync(path, sisa.join(eol), 'utf8');
console.log(`baris kunci Atlas dibuang: ${buang}`);
console.log(`dari ${KUNCI.length} kunci x 10 kamus = ${KUNCI.length * 10} kemungkinan`);
