/*
 * Bersihkan komentar yang masih menyebut nama lama.
 *
 * Komentar bukan kode, tapi komentar yang menyebut "Repo Wiki" saat UI-nya
 * sudah "Atlas" adalah kebohongan kecil yang menyesatkan pembaca berikutnya.
 * Yang diganti HANYA teks komentar; nama fungsi/berkas (WikiPanel, wikiStore)
 * sengaja dipertahankan supaya tidak ada rename mekanis yang menyentuh 20 berkas
 * dan memicu regresi tanpa manfaat.
 */
const fs = require('fs');

const BERKAS = [
  'src/components/wiki/WikiPanel.tsx',
  'src/components/wiki/WikiPage.tsx',
  'src/styles/wiki.css',
  'src/App.tsx',
  'src/lib/devBridge.ts',
  'scripts/verify-wiki-eksplorer.mjs',
  'scripts/verify-wiki-live.mjs',
  'scripts/verify-wiki-generate.mjs',
];

const GANTI = [
  ['"Generate Your Repo Wiki" - the editor-area page for the Repo Wiki.',
   '"Generate Your Atlas" - the editor-area page for Atlas.'],
  ['The Repo Wiki sidebar: two tabs, a search box, and the entry list.',
   'The Atlas sidebar: two tabs (Map / Cards), a search box, and the entry list.'],
  [' * wiki is prose a person reads; the knowledge cards are compact facts a model is',
   ' * Map pages are prose a person reads; the Cards are compact facts a model is'],
  [' * Repo Wiki — the sidebar pane and the editor-area page.',
   ' * Atlas — the sidebar pane (Map / Cards) and the editor-area page.'],
  [' * Repo Wiki: the sidebar pane and the editor-area generator page.',
   ' * Atlas: the sidebar pane (Map / Cards) and the editor-area generator page.'],
  [' * Repo Wiki.', ' * Atlas.'],
  ['verify-wiki-eksplorer.mjs - Repo Wiki + Outline/Timeline di Explorer.',
   'verify-wiki-eksplorer.mjs - Atlas (Map/Cards) + Outline/Timeline di Explorer.'],
  [' * 2. REPO WIKI: DUA ARTEFAK, DUA PEMBACA.',
   ' * 2. ATLAS: DUA ARTEFAK, DUA PEMBACA (Map untuk manusia, Cards untuk agen).'],
  [' *    Wiki untuk manusia, Knowledge Card untuk agen. Yang diuji:',
   ' *    Map untuk manusia, Cards untuk agen. Yang diuji:'],
  ["console.log('\\nLapis 2 - Repo Wiki\\n');",
   "console.log('\\nLapis 2 - Atlas\\n');"],
  ['// Probe live: jalankan generator Repo Wiki sungguhan, ukur hasilnya.',
   '// Probe live: jalankan generator Atlas sungguhan, ukur hasilnya.'],
  ["console.log('=== probe live: generator Repo Wiki ===\\n');",
   "console.log('=== probe live: generator Atlas ===\\n');"],
];

let total = 0;
for (const f of BERKAS) {
  if (!fs.existsSync(f)) {
    console.log('  tidak ada:', f);
    continue;
  }
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const [dari, ke] of GANTI) {
    if (s.includes(dari)) {
      s = s.split(dari).join(ke);
      n++;
    }
  }
  if (n) {
    fs.writeFileSync(f, s, 'utf8');
    console.log(`  ${f}: ${n} komentar`);
    total += n;
  }
}
console.log(`total: ${total}`);
