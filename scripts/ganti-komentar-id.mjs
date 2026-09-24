// ganti-komentar-id.mjs — replace the remaining Indonesian code comments with
// English equivalents.
//
// KENAPA a mapping table instead of machine translation: these comments explain
// WHY a decision was made. A translator that rewrites the reasoning invents
// facts the original author never wrote. Each entry below is a hand-written
// English version of the exact same reasoning, and the script fails loudly if
// a target string is not found, so nothing is silently skipped.

import fs from 'node:fs';

const TULIS = process.argv.includes('--tulis');

/** [file, exact Indonesian text, English replacement] */
const GANTI = [
  // --- src/App.tsx ---
  ['src/App.tsx',
   '/* Rust tidak tersedia (mode browser) — biarkan */',
   '/* Rust not available (browser mode), leave it */'],
  ['src/App.tsx',
   '{/* Resizer kolom AI: bisa di-drag seperti sidebar. Sebelumnya lebar',
   '{/* AI column resizer: draggable like the sidebar. Previously the width'],

  // --- src/components ---
  ['src/components/ai/SubAgentBar.tsx',
   '// Form tetap terbuka supaya user bisa langsung menyusun batch berikutnya —',
   '// The form stays open so the next batch can be queued right away,'],
  ['src/components/debug/DebugView.tsx',
   '{/* Adapter yang belum terpasang: instruksi install, bukan diam (brief V5). */}',
   '{/* Adapter not installed yet: show install instructions instead of silence. */}'],
  ['src/components/editor/FindBar.tsx',
   '// tapi harus terbuka supaya state pencarian aktif.',
   '// but it must be open for the search state to be active.'],
  ['src/components/editor/FindBar.tsx',
   '/* query regex tidak valid — ditandai lewat `invalid` */',
   '/* invalid regex query, flagged through `invalid` */'],
  ['src/components/settings/McpPanel.tsx',
   '{/* Satu klik untuk semua CLI yang config-nya ADA di mesin ini.',
   '{/* One click for every CLI whose config EXISTS on this machine.'],
  ['src/components/settings/PromptSection.tsx',
   '{/* Apa yang dijawab AI kalau ditanya "kamu model apa". Blok ini TIDAK',
   '{/* What the AI answers when asked "what model are you". This block is NOT'],
  ['src/components/shell/EditorArea.tsx',
   '{/* fase 24.1: <Breadcrumbs /> versi shell DIHAPUS dari sini.',
   '{/* The shell version of <Breadcrumbs /> was REMOVED from here:'],
  ['src/components/shell/PortsView.tsx',
   ' * 5 detik: cukup cepat untuk menangkap dev server yang baru naik, cukup jarang',
   ' * 5 seconds: fast enough to catch a dev server that just came up, rare enough'],
  ['src/components/shell/PortsView.tsx',
   ' * untuk tidak memanggil tabel socket sistem terus-menerus.',
   ' * that it does not hammer the system socket table.'],
  ['src/components/terminal/BrowserPane.tsx',
   ' * bisa dimuat karena tidak ada iframe yang terlibat.',
   ' * can load because no iframe is involved.'],
  ['src/components/terminal/BrowserPane.tsx',
   '   * Posisi awal diambil dari elemen penampung supaya webview langsung muncul di',
   '   * The initial position comes from the container element so the webview appears'],
  ['src/components/terminal/BrowserPane.tsx',
   '   * tempat yang benar; loop sinkronisasi di bawah yang menjaga sesudahnya.',
   '   * in the right place; the sync loop below keeps it there afterwards.'],
  ['src/components/terminal/BrowserPane.tsx',
   '   * sidebar di-toggle) dan ResizeObserver tidak melihat pergeseran.',
   '   * sidebar toggled), and ResizeObserver does not see a shift.'],
  ['src/components/terminal/BrowserPane.tsx',
   '       * yang seharusnya menutupinya. Tanpa pemeriksaan ini, dialog Command',
   '       * that should cover it. Without this check, the Command Palette dialog'],
];

let berubah = 0;
let gagal = [];

for (const [rel, cari, ganti] of GANTI) {
  const p = rel;
  if (!fs.existsSync(p)) {
    gagal.push(`${rel}: file not found`);
    continue;
  }
  const isi = fs.readFileSync(p, 'utf8');
  if (!isi.includes(cari)) {
    gagal.push(`${rel}: not found -> ${cari.slice(0, 60)}`);
    continue;
  }
  const baru = isi.replace(cari, ganti);
  if (TULIS) fs.writeFileSync(p, baru);
  berubah++;
}

console.log(TULIS ? '== APPLIED ==' : '== DRY RUN ==');
console.log(`  replaced: ${berubah}/${GANTI.length}`);
if (gagal.length) {
  console.log('  MISSING:');
  for (const g of gagal) console.log(`    ${g}`);
  process.exitCode = 1;
}
