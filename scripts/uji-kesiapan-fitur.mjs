#!/usr/bin/env node
/**
 * uji-kesiapan-fitur.mjs - periksa KESIAPAN rancangan SPIKE (fitur 150/175/176/169).
 *
 * Sifat: READ-ONLY. Tidak mengubah apa pun; membaca berkas sumber sebagai TEKS.
 * Keluaran: semua ANGKA + daftar "SIAP DIKERJAKAN / BELUM" per fitur.
 * Exit 0 bila prasyarat struktural bersih, exit 1 bila ada yang hilang/melewati batas.
 *
 * Cara hitung "tool per giliran" SENGAJA diport dari scripts/audit-katalog-tool.mjs
 * (bagian C) supaya angka di sini konsisten dengan audit - sumber kebenaran tetap kode.
 *
 * Pakai: node scripts/uji-kesiapan-fitur.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');
const adaBerkas = (p) => {
  try {
    readFileSync(join(AKAR, p));
    return true;
  } catch {
    return false;
  }
};
const adaDir = (p) => {
  try {
    return statSync(join(AKAR, p)).isDirectory();
  } catch {
    return false;
  }
};
/** Kumpulkan berkas sumber di bawah `rel` (untuk pencarian teks lintas berkas). */
function daftarBerkas(rel, exts = ['.ts', '.tsx', '.rs']) {
  const out = [];
  if (!adaDir(rel)) return out;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'target', '.git', 'dist'].includes(e.name)) continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  };
  walk(join(AKAR, rel));
  return out;
}
/** Hitung kemunculan `re` di semua berkas, kecuali path yang di-skip. */
function hitungLintas(berkas, re, skipSuffix = []) {
  let n = 0;
  const rumah = [];
  const relatif = (f) => f.replace(AKAR + sep, '').replace(/\\/g, '/');
  for (const f of berkas) {
    const rel = relatif(f); // normalkan ke '/' SEBELUM dibandingkan (Windows pakai '\')
    if (skipSuffix.some((s) => rel.endsWith(s))) continue;
    const isi = baca(rel);
    const m = isi.match(re);
    if (m) {
      n += m.length;
      rumah.push(rel);
    }
  }
  return { n, rumah };
}

const masalah = []; // fatal: prasyarat rancangan hilang -> exit 1
const peringatan = []; // bukan fatal: ditempel sebagai catatan

/* ================================================================== */
/* A. Penyaring tool per giliran (port audit-katalog-tool.mjs bagian C) */
/* ================================================================== */

const tanpaBlokKomentar = (ts) => ts.replace(/\/\*[\s\S]*?\*\//g, '');
const katalogTs = tanpaBlokKomentar(baca('src/lib/zephyrTools/catalog.ts'));
const blokArray = (ts, nama) => {
  const m = ts.match(new RegExp(`const\\s+${nama}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\n\\];`));
  return m ? m[1] : '';
};
const reEntri =
  /\['([a-z_][a-z0-9_]*)',\s*'([^']*)',\s*'(read|net|netWrite|appWrite|fsWrite|exec)',\s*(true|false),\s*'([\s\S]*?)'\]/g;
const entriBlok = (isi, source) => {
  const out = [];
  let m;
  while ((m = reEntri.exec(isi))) out.push({ name: m[1], source, effect: m[3] });
  return out;
};
const BUILTIN = entriBlok(blokArray(katalogTs, 'BUILTIN'), 'builtin');
const MCP = entriBlok(blokArray(katalogTs, 'MCP'), 'mcp');
const WEB = entriBlok(blokArray(katalogTs, 'WEB'), 'web');
const KATALOG = [...BUILTIN, ...MCP, ...WEB];

const WEB_MATI = (() => {
  const m = katalogTs.match(/const\s+WEB_MATI\b[\s\S]*?=\s*\[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((x) => x[1]) : [];
})();
const WEB_AKTIF_AWAL = WEB.filter((t) => !WEB_MATI.includes(t.name)).map((t) => t.name);
const AKTIF_AWAL = [...KATALOG.filter((t) => t.source !== 'web').map((t) => t.name), ...WEB_AKTIF_AWAL];

const NAMA_KATALOG = new Set(KATALOG.map((t) => t.name));
const DIKIRIM_SELALU = (() => {
  const m = katalogTs.match(/TOOL_DIKIRIM_SELALU\b[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_][a-z0-9_]*|mcp__[a-z_]+__[a-z0-9_]+)'/g)]
    .map((x) => x[1])
    .filter((n) => NAMA_KATALOG.has(n));
})();

const subsetTs = baca('src/lib/subsetAlat.ts');
const daftarDari = (ts, nama) => {
  const m = ts.match(new RegExp(`const\\s+${nama}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
const NAMA_WEB = daftarDari(subsetTs, 'NAMA_WEB');
const AWALAN_WEB = daftarDari(subsetTs, 'AWALAN_WEB');
const ALAT_BUTUH_FOLDER = daftarDari(subsetTs, 'ALAT_BUTUH_FOLDER');
const TOOL_RENCANA_PERTAMA = daftarDari(subsetTs, 'TOOL_RENCANA_PERTAMA');
const butuhAlatWeb = (n) => NAMA_WEB.includes(n) || AWALAN_WEB.some((p) => n.startsWith(p));
const butuhFolder = (n) => ALAT_BUTUH_FOLDER.includes(n);
const TOOL_TULIS_BERKAS = KATALOG.filter((t) => t.effect === 'fsWrite').map((t) => t.name);

function alatTerkirim({ web, folder, baca: b }) {
  let hasil = web ? [...AKTIF_AWAL] : AKTIF_AWAL.filter((n) => !butuhAlatWeb(n));
  if (!folder) hasil = hasil.filter((n) => !butuhFolder(n));
  if (b || !folder) hasil = hasil.filter((n) => !TOOL_TULIS_BERKAS.includes(n));
  if (hasil.length === 0) {
    const cad = folder ? [...AKTIF_AWAL] : AKTIF_AWAL.filter((n) => !butuhFolder(n));
    hasil = cad.length > 0 ? cad : [...AKTIF_AWAL];
  }
  return hasil.filter((n) => DIKIRIM_SELALU.includes(n));
}
const KELAS = [
  { nama: 'WEB, ada folder', args: { web: true, folder: true, baca: false } },
  { nama: 'WEB, tanpa folder', args: { web: true, folder: false, baca: false } },
  { nama: 'tulis berkas, tanpa web, ada folder', args: { web: false, folder: true, baca: false } },
  { nama: 'tulis berkas, tanpa web, tanpa folder', args: { web: false, folder: false, baca: false } },
  { nama: 'tanya/baca, tanpa web, ada folder', args: { web: false, folder: true, baca: true } },
  { nama: 'tanya/baca, tanpa web, tanpa folder', args: { web: false, folder: false, baca: true } },
];
const TARGET_MAKS = 20;
const MAKS = Math.max(...KELAS.map((k) => alatTerkirim(k.args).length));
const capLulus = MAKS <= TARGET_MAKS;
// Overage ini KONDISI YANG SUDAH ADA (scripts/audit-katalog-tool.mjs melaporkan angka yang sama
// dan sudah exit 1 karenanya). Karena itu diperlakukan sebagai peringatan, bukan fatal di sini -
// kalau dijadikan fatal, harness ini akan selalu merah dan tidak lagi berguna sebagai gerbang.
if (!capLulus)
  peringatan.push(
    `langit-langit per giliran ${MAKS} > target ${TARGET_MAKS} (kondisi yang sudah ada; sama di scripts/audit-katalog-tool.mjs)`,
  );

/* ================================================================== */
/* B. Jalur dekorasi inline editor                                    */
/* ================================================================== */

const CM = 'src/components/editor/CodeMirrorEditor.tsx';
const cmTs = adaBerkas(CM) ? baca(CM) : '';
const DEKORASI = ['ghostText', 'inlayHints', 'gitBars', 'diagnosticsGutter'].filter((n) =>
  new RegExp(`\\b${n}\\b`).test(cmTs),
);
const jalurDekorasiAda = DEKORASI.length >= 1;
if (!jalurDekorasiAda) masalah.push('editor tidak punya jalur dekorasi inline (ghostText/inlayHints/gitBars)');

/* ================================================================== */
/* C. Sinyal per fitur                                                */
/* ================================================================== */

const srcBerkas = daftarBerkas('src');
const rustBerkas = daftarBerkas('src-tauri/src', ['.rs']);

const perintahBrowserPane = adaBerkas('src-tauri/src/browser_pane.rs')
  ? (baca('src-tauri/src/browser_pane.rs').match(/pub (?:async )?fn (browser_pane_\w+)/g) || []).length
  : 0;
const toolBrowserWeb = adaBerkas('src/lib/zephyrTools/web.ts')
  ? [...new Set([...baca('src/lib/zephyrTools/web.ts').matchAll(/name:\s*'(browser_\w+)'/g)].map((m) => m[1]))]
  : [];
const adaPick = toolBrowserWeb.includes('browser_pick');

const ghostTs = adaBerkas('src/lib/ghostText.ts') ? baca('src/lib/ghostText.ts') : '';
const adaKeymapGhost = /ghostTextKeymap/.test(ghostTs);
const adaSeamPemasok = /PemasokSaran|setPemasokSaran/.test(ghostTs);
const pemakaianLepasListener = hitungLintas(srcBerkas, /lepasListenerGhost/g, ['lib/ghostText.ts', 'lib/zephyrIndeks.ts']);

const simpleDiffTs = adaBerkas('src/lib/simpleDiff.ts') ? baca('src/lib/simpleDiff.ts') : '';
const eksporSimpleDiff = ['bagiHunk', 'terapkanHunk', 'barisDiff'].filter((n) =>
  new RegExp(`export function ${n}\\b`).test(simpleDiffTs),
);
const diffViewerPakaiSimple = adaBerkas('src/components/scm/DiffViewer.tsx')
  ? /simpleDiff/.test(baca('src/components/scm/DiffViewer.tsx'))
  : false;

const perintahSsh = adaBerkas('src-tauri/src/ssh.rs')
  ? (baca('src-tauri/src/ssh.rs').match(/pub (?:async )?fn (ssh_\w+)/g) || []).length
  : 0;
const adaSshExecTool = hitungLintas([...srcBerkas, ...rustBerkas], /ssh_exec/g).n > 0;
const adaRedaksiLog = adaBerkas('src-tauri/src/logging.rs') ? /redact/i.test(baca('src-tauri/src/logging.rs')) : false;

/* ================================================================== */
/* D. Definisi fitur + penilaian kesiapan                             */
/* ================================================================== */

const FITUR = [
  {
    id: '150',
    nama: 'TAB BROWSER bawaan + otomasi',
    reuse: [
      'src-tauri/src/browser_pane.rs',
      'src-tauri/src/browser.rs',
      'src/components/editor/BrowserTab.tsx',
      'src/lib/zephyrTools/web.ts',
      'src/lib/commands.ts',
    ],
    berkasBaru: [],
    celah: `${adaPick ? '' : 'browser_pick (selektor) TIDAK ADA; '}screenshot sengaja tidak didukung`,
    catat: [
      `perintah browser_pane_* = ${perintahBrowserPane}`,
      `tool browser_* di web.ts = ${toolBrowserWeb.length} -> ${toolBrowserWeb.join(', ') || '(0)'}`,
      `anggaran per giliran maks ${MAKS} (target 20) -> menambah tool WEB butuh keputusan Ryu`,
    ],
  },
  {
    id: '175',
    nama: 'Autocomplete inline (ghost text)',
    reuse: [
      'src/lib/ghostText.ts',
      'src/components/editor/CodeMirrorEditor.tsx',
      'src/components/settings/SectionsBasic.tsx',
      'src/lib/types.ts',
    ],
    berkasBaru: ['src/lib/ghostPemasok.ts'],
    celah: `${adaSeamPemasok ? '' : 'seam pemasok saran TIDAK ADA; '}${
      pemakaianLepasListener.n === 0 ? 'lepasListenerGhost tidak dipanggil (listener bocor)' : ''
    }`.trim() || '(tidak ada)',
    catat: [
      `ghostTextKeymap (Terima/Tolak) = ${adaKeymapGhost ? 'ADA' : 'TIDAK'}`,
      `seam pemasok (PemasokSaran/setPemasokSaran) = ${adaSeamPemasok ? 'ADA' : 'TIDAK'}`,
      `pemakaian lepasListenerGhost di luar definisi = ${pemakaianLepasListener.n}`,
    ],
    butuhDekorasiInline: true,
  },
  {
    id: '176',
    nama: 'Review diff per-hunk',
    reuse: [
      'src/lib/simpleDiff.ts',
      'src/components/scm/DiffViewer.tsx',
      'src/lib/gitStore.ts',
      'src/lib/commands.ts',
    ],
    berkasBaru: ['src/lib/hunkUnified.ts'],
    celah: `${diffViewerPakaiSimple ? '' : 'DiffViewer BELUM pakai simpleDiff (tak ada UI per-hunk); '}adaptor unified->rows belum ada`,
    catat: [
      `ekspor simpleDiff dipakai rancangan = ${eksporSimpleDiff.length}/3 -> ${eksporSimpleDiff.join(', ') || '(0)'}`,
      `DiffViewer impor simpleDiff = ${diffViewerPakaiSimple ? 'YA' : 'TIDAK'}`,
    ],
  },
  {
    id: '169',
    nama: 'Jalur SSH (aman)',
    reuse: [
      'src-tauri/src/ssh.rs',
      'src-tauri/src/sftp.rs',
      'src/lib/zephyrTools/mcp.ts',
      'src-tauri/src/logging.rs',
      'src-tauri/src/secrets.rs',
    ],
    berkasBaru: ['src/lib/sshArgv.ts'],
    celah: `${adaSshExecTool ? '' : 'tidak ada ssh_exec (agen tak bisa jalankan perintah); '}${
      adaRedaksiLog ? '' : 'tidak ada redaksi log; '
    }`.trim() || '(tidak ada)',
    catat: [
      `perintah ssh_* di ssh.rs = ${perintahSsh}`,
      `ssh_exec di src/src-tauri = ${adaSshExecTool ? 'ADA' : 'TIDAK'}`,
      `redaksi di logging.rs = ${adaRedaksiLog ? 'ADA' : 'TIDAK'}`,
    ],
  },
];

const garis = (t) => console.log(`\n== ${t} ==`);
console.log('UJI KESIAPAN FITUR ZEPHYR (read-only, dari sumber)');
console.log(`akar repo: ${AKAR}`);

garis('A. PENYARING TOOL PER GILIRAN (target <= 20)');
for (const k of KELAS) {
  const n = alatTerkirim(k.args).length;
  console.log(`  ${String(n).padStart(2)}  ${(n <= TARGET_MAKS ? 'OK' : 'LEWAT').padEnd(5)}  ${k.nama}`);
}
console.log(`  MAKS per giliran : ${MAKS}  (target ${TARGET_MAKS}) -> ${capLulus ? 'LULUS' : 'MELEWATI TARGET (sudah ada sebelum spike)'}`);
console.log(`  katalog total    : ${KATALOG.length} (builtin ${BUILTIN.length} + mcp ${MCP.length} + web ${WEB.length})`);
console.log(`  DIKIRIM_SELALU   : ${DIKIRIM_SELALU.length}`);

garis('B. JALUR DEKORASI INLINE EDITOR');
console.log(`  ${CM}: ${DEKORASI.length ? DEKORASI.join(', ') : '(tidak ada)'} -> ${jalurDekorasiAda ? 'ADA' : 'TIDAK'}`);

garis('C. KESIAPAN PER FITUR');
let siap = 0;
for (const f of FITUR) {
  const reuseAda = f.reuse.filter(adaBerkas);
  const reuseHilang = f.reuse.filter((p) => !adaBerkas(p));
  // Kesiapan fitur = prasyarat RANCANGAN-nya sendiri (berkas pakai-ulang + jalur dekorasi),
  // TIDAK digerbangi overage katalog yang sudah ada (itu urusan lain, dicatat sebagai peringatan).
  const prasyarat = reuseHilang.length === 0 && (f.butuhDekorasiInline ? jalurDekorasiAda : true);
  if (prasyarat) siap += 1;
  console.log(`\n  [${f.id}] ${f.nama}`);
  console.log(`     pakai-ulang : ${reuseAda.length}/${f.reuse.length} ada${reuseHilang.length ? ' | HILANG: ' + reuseHilang.join(', ') : ''}`);
  for (const c of f.catat) console.log(`     ${c}`);
  console.log(`     celah       : ${f.celah}`);
  console.log(`     berkas baru : ${f.berkasBaru.length ? f.berkasBaru.join(', ') : '(tidak ada - mengubah berkas yang ada)'}`);
  console.log(`     -> ${prasyarat ? 'SIAP DIKERJAKAN' : 'BELUM (prasyarat kurang)'}`);
  if (reuseHilang.length) masalah.push(`fitur ${f.id}: berkas pakai-ulang hilang: ${reuseHilang.join(', ')}`);
}

garis('RINGKASAN');
console.log(`fitur SIAP dikerjakan : ${siap}/${FITUR.length}`);
console.log(`fitur BELUM           : ${FITUR.length - siap}/${FITUR.length}`);
console.log('gerbang prasyarat rancangan:');
console.log(`  berkas pakai-ulang ada         : ${masalah.some((m) => m.includes('pakai-ulang')) ? 'TIDAK' : 'YA'}`);
console.log(`  jalur dekorasi inline editor   : ${jalurDekorasiAda ? 'ADA' : 'TIDAK'}`);
console.log(`  penyaring tool <= ${TARGET_MAKS}             : ${capLulus ? 'YA' : `TIDAK (maks ${MAKS})`}`);
console.log(`masalah fatal         : ${masalah.length}`);
for (const m of masalah) console.log(`  ! ${m}`);
console.log(`peringatan (tidak fatal): ${peringatan.length}`);
for (const p of peringatan) console.log(`  ~ ${p}`);

const gagal = masalah.length > 0;
console.log(`\n${gagal ? '== GAGAL ==' : '== LULUS =='} (exit ${gagal ? 1 : 0})`);
process.exit(gagal ? 1 : 0);
