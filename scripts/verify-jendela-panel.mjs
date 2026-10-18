#!/usr/bin/env node
/*
 * verify-jendela-panel.mjs — are the six panels really WINDOWS, and only windows?
 *
 * WHAT THIS CHECKS, and why each check exists:
 *
 * The panels used to be popups inside the app. They are now their own OS
 * windows. That is a structural change, and the failure mode is not a crash: it
 * is a HALF-migration, where the window opens AND the old popup still renders,
 * so the reader sees two of everything. That is exactly what was reported
 * ("pas buka settings dia ada 2"), and no type checker can catch it - both code
 * paths compile.
 *
 * So this harness asserts the three things that must be true together:
 *
 *   1. ONE DOOR. Every panel id is reachable through `bukaPanel`, and the opener
 *      never sets a popup flag that something still renders.
 *   2. NO POPUP LEFT. The old frames are gone from the source - not merely
 *      unrendered - so they cannot come back by accident.
 *   3. ONE TITLE BAR, SIX WINDOWS. Every panel window renders `PanelTitleBar`,
 *      and the bar carries the three window controls with ICONS (not text) and
 *      no product name or logo in the title.
 *
 * Static only: no CDP, no app, no network. It reads the repo.
 *
 * Usage:
 *   node scripts/verify-jendela-panel.mjs
 *   node scripts/verify-jendela-panel.mjs --verbose
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

let lulus = 0;
let gagal = 0;
const kegagalan = [];

function cek(nama, fn) {
  try {
    const catatan = fn();
    lulus++;
    console.log(`[LULUS] ${nama}`);
    if (verbose && catatan) console.log(`        ${catatan}`);
  } catch (e) {
    gagal++;
    const pesan = e instanceof Error ? e.message : String(e);
    kegagalan.push({ nama, pesan });
    console.log(`[GAGAL] ${nama}`);
    console.log(`        ${pesan}`);
  }
}

function baca(rel) {
  const p = join(AKAR, rel);
  if (!existsSync(p)) throw new Error(`berkas tidak ada: ${rel}`);
  return readFileSync(p, 'utf8');
}

/** Every `.tsx`/`.ts` under src, so a deleted frame cannot hide in a subfolder. */
function semuaSumber() {
  const hasil = [];
  const telusuri = (dir) => {
    for (const e of readdirSync(join(AKAR, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) telusuri(rel);
      else if (/\.tsx?$/.test(e.name)) hasil.push(rel);
    }
  };
  telusuri('src');
  return hasil;
}

/**
 * Strip comments from a source file.
 *
 * Needed because the deleted classes are still NAMED in the comments that
 * explain why they were deleted - and a naive `includes('.mpop-scrim')` matches
 * that prose and reports a bug that does not exist. The check has to look at
 * rules, not at explanations.
 */
function tanpaKomentar(isi) {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const PANEL = [
  'settings',
  'extensions',
  'tools',
  'models',
  'chat-settings',
  'agent-custom',
];

console.log('=== verify-jendela-panel ===\n');

/* ── 1. The six ids exist and are parsed from the hash ──────────────────── */

const panelWindowTs = baca('src/lib/panelWindow.ts');

cek('enam id panel terdaftar di PanelId', () => {
  for (const id of PANEL) {
    if (!panelWindowTs.includes(`'${id}'`)) throw new Error(`id "${id}" tidak ada di panelWindow.ts`);
  }
  return `${PANEL.length} id`;
});

cek('panelDariHash menolak id tak dikenal (himpunan tertutup)', () => {
  if (!/SEMUA_PANEL\.includes\(id\)/.test(panelWindowTs)) {
    throw new Error('panelDariHash tidak memvalidasi terhadap daftar tertutup');
  }
  return 'divalidasi SEMUA_PANEL';
});

cek('jendela panel FRAMELESS (decorations: false)', () => {
  if (!/decorations:\s*false/.test(panelWindowTs)) {
    throw new Error('decorations bukan false: title bar OS akan menimpa warna tema');
  }
  return 'decorations: false';
});

cek('judul TANPA nama produk', () => {
  /* The titles are plain: `Settings`, not `Zephyr — Settings`. A regression here
     is exactly what the reader reported seeing in the OS title bar. */
  const judul = panelWindowTs.match(/JUDUL[^{]*\{([\s\S]*?)\n\};/);
  if (!judul) throw new Error('tabel JUDUL tidak ditemukan');
  if (/Zephyr/.test(judul[1])) {
    throw new Error('tabel JUDUL masih memuat "Zephyr" - judul harus polos');
  }
  for (const id of PANEL) {
    /* Quoted keys are needed for the hyphenated ids, so both spellings count. */
    const kunci = id.includes('-') ? `'${id}'` : id;
    if (!judul[1].includes(`${kunci}:`)) throw new Error(`judul untuk "${id}" tidak ada`);
  }
  return 'enam judul polos';
});

/* ── 2. The old popup frames are GONE, not just unrendered ──────────────── */

cek('berkas popup lama sudah dihapus', () => {
  const mati = [
    'src/components/shell/ModalPopup.tsx',
    'src/components/shell/ShellPopups.tsx',
    'src/components/settings/AgentCustomModal.tsx',
    'src/components/settings/AiModelsModal.tsx',
    'src/components/ai/ChatSettingsPopup.tsx',
  ];
  const masihAda = mati.filter((f) => existsSync(join(AKAR, f)));
  if (masihAda.length) {
    throw new Error(`masih ada: ${masihAda.join(', ')} - popup dan window akan tampil bersamaan`);
  }
  return `${mati.length} berkas dihapus`;
});

cek('tidak ada impor ke berkas popup yang dihapus', () => {
  const pola = /from\s+['"][^'"]*(ModalPopup|ShellPopups|AgentCustomModal|AiModelsModal|ChatSettingsPopup)['"]/;
  const kena = [];
  for (const f of semuaSumber()) {
    const isi = readFileSync(join(AKAR, f), 'utf8');
    if (pola.test(isi)) kena.push(f);
  }
  if (kena.length) throw new Error(`masih mengimpor: ${kena.join(', ')}`);
  return 'nol impor';
});

cek('CSS popup lama (.mpop-scrim/.mpop-dock/.cset-pop) sudah hilang', () => {
  const css = tanpaKomentar(baca('src/styles/modal-popup.css'));
  for (const kelas of ['.mpop-scrim', '.mpop-dock', '.mpop.is-max']) {
    if (css.includes(kelas)) {
      throw new Error(`${kelas} masih ada di modal-popup.css - popup bisa dirender lagi`);
    }
  }
  const cset = tanpaKomentar(baca('src/styles/chat-settings.css'));
  if (/^\.cset-pop\s*\{/m.test(cset)) {
    throw new Error('.cset-pop masih punya aturan sendiri di chat-settings.css');
  }
  return 'bersih';
});

/* ── 3. One door: every opener goes to a window ─────────────────────────── */

cek('bukaPanel ada dan menutup flag popup yang mati', () => {
  const bp = baca('src/lib/bukaPanel.ts');
  if (!/export function bukaPanel/.test(bp)) throw new Error('bukaPanel tidak diekspor');
  if (!/FLAG\[id\]\?\.\(false\)/.test(bp)) {
    throw new Error('bukaPanel tidak membersihkan flag popup - pembaca bisa dapat dua salinan');
  }
  return 'satu pintu';
});

cek('store panel membuka JENDELA, bukan menyalakan flag', () => {
  const pasangan = [
    ['src/lib/aiModelsStore.ts', /bukaPanel\('models'\)/],
    ['src/lib/agentCustomStore.ts', /bukaPanel\('agent-custom'/],
    ['src/lib/chatSettingsStore.ts', /bukaPanel\('chat-settings'/],
  ];
  for (const [berkas, pola] of pasangan) {
    const isi = baca(berkas);
    if (!pola.test(isi)) throw new Error(`${berkas} tidak memanggil bukaPanel - pintu lama jadi mati`);
    if (/set\(\{\s*open:\s*true\s*\}\)/.test(isi) || /set\(\{\s*buka:\s*true/.test(isi)) {
      throw new Error(`${berkas} masih menyalakan flag tampil - itu jalur popup lama`);
    }
  }
  return '3 store -> jendela';
});

cek('setActivity("settings") membuka jendela', () => {
  const store = baca('src/lib/store.ts');
  const blok = store.match(/setActivity:\s*\(a\)\s*=>\s*\{[\s\S]*?\n {2}\},/);
  if (!blok) throw new Error('setActivity tidak berbentuk blok (mungkin masih satu baris)');
  if (!/bukaPanel\('settings'\)/.test(blok[0])) {
    throw new Error('setActivity tidak memanggil bukaPanel - 10 pemanggil lama akan membuka apa-apa');
  }
  if (/settingsOpen:\s*true/.test(blok[0])) {
    throw new Error('setActivity masih menyalakan settingsOpen - itu flag popup mati');
  }
  return '10 pemanggil lama tetap jalan';
});

cek('setter flag lama meneruskan ke jendela, tidak menyalakan flag', () => {
  const store = baca('src/lib/store.ts');
  /* The three legacy setters are kept for their call sites, but `true` must open
     a window and the flag must stay false. A `true` written here is the exact
     half-migration that produced "ada 2". */
  for (const [nama, panel] of [
    ['setSettingsOpen', 'settings'],
    ['setExtensionsOpen', 'extensions'],
    ['setToolsOpen', 'tools'],
  ]) {
    const re = new RegExp(`${nama}:\\s*\\(open\\)\\s*=>\\s*\\{[\\s\\S]*?\\n {2}\\},`);
    const m = store.match(re);
    if (!m) throw new Error(`${nama} tidak berbentuk blok`);
    if (!new RegExp(`bukaPanel\\('${panel}'\\)`).test(m[0])) {
      throw new Error(`${nama}(true) tidak membuka jendela - pemanggil lama jadi mati`);
    }
    if (new RegExp(`${panel === 'settings' ? 'settingsOpen' : panel === 'extensions' ? 'extensionsOpen' : 'toolsOpen'}:\\s*open\\b`).test(m[0])) {
      throw new Error(`${nama} masih menyalakan flag tampil`);
    }
  }
  return '3 setter -> jendela';
});

/* ── 4. Every panel window has the bar, and the bar has the controls ────── */

cek('PanelWindow merender PanelTitleBar untuk SETIAP panel', () => {
  const pw = baca('src/PanelWindow.tsx');
  if (!/<PanelTitleBar/.test(pw)) throw new Error('PanelWindow tidak merender PanelTitleBar');
  /* One bar outside the switch: that is what makes it impossible for one panel
     to be built without window controls. A bar per branch would drift. */
  const jumlahBar = (pw.match(/<PanelTitleBar/g) ?? []).length;
  if (jumlahBar !== 1) {
    throw new Error(`PanelTitleBar dirender ${jumlahBar}x - harus 1x di luar percabangan`);
  }
  return 'satu bar, enam panel';
});

cek('title bar punya minimize / maximize / close', () => {
  const tb = baca('src/components/shell/PanelTitleBar.tsx');
  for (const t of ['panel-win-min', 'panel-win-max', 'panel-win-close']) {
    if (!tb.includes(t)) throw new Error(`kontrol "${t}" tidak ada`);
  }
  /* Icon buttons, not words: the reader asked for `— □ ✕`, and a text button in
     a title bar reads as a toolbar. */
  if (!/<svg/.test(tb)) throw new Error('kontrol tidak memakai svg - itu tombol teks');
  for (const kata of ['>Minimize<', '>Maximize<', '>Close<']) {
    if (tb.includes(kata)) throw new Error(`tombol teks "${kata}" muncul lagi di title bar`);
  }
  return '3 ikon';
});

cek('title bar TIDAK memuat logo atau nama produk', () => {
  const tb = tanpaKomentar(baca('src/components/shell/PanelTitleBar.tsx'));
  /* The Z glyph is a 4-point path in a 488x424 viewBox (see AgentsTitlebar).
     Any svg that is not one of the three 10x10 control glyphs is suspect. */
  const viewBox = [...tb.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]);
  for (const vb of viewBox) {
    if (vb !== '0 0 10 10') throw new Error(`viewBox "${vb}" bukan glyph kontrol - kemungkinan logo`);
  }
  if (/\bZephyr\b/.test(tb)) throw new Error('title bar menyebut "Zephyr"');
  return 'polos';
});

cek('title bar bisa di-drag dan di-resize (frameless butuh keduanya)', () => {
  const tb = baca('src/components/shell/PanelTitleBar.tsx');
  if (!/data-tauri-drag-region/.test(tb)) throw new Error('tidak ada drag region - jendela tak bisa digeser');
  if (!/startResizeDragging/.test(tb)) {
    throw new Error('tidak ada startResizeDragging - jendela frameless tak bisa diubah ukurannya');
  }
  const delapan = (tb.match(/dir:\s*'(North|South|East|West|NorthEast|NorthWest|SouthEast|SouthWest)'/g) ?? [])
    .length;
  if (delapan !== 8) throw new Error(`hanya ${delapan} tepi resize, harus 8`);
  return 'drag + 8 tepi';
});

cek('izin resize-dragging ada di capability Tauri', () => {
  const cap = baca('src-tauri/capabilities/default.json');
  if (!cap.includes('core:window:allow-start-resize-dragging')) {
    throw new Error('permission start-resize-dragging tidak ada - resize akan gagal senyap');
  }
  return 'diizinkan';
});

/* ── 5. Cross-window sync: without it, a theme change stays in one window ── */

cek('settings-changed didengarkan di frontend', () => {
  const store = baca('src/lib/store.ts');
  if (!/onSettingsChanged/.test(store)) {
    throw new Error('tidak ada listener settings-changed - ganti tema tidak sampai ke jendela lain');
  }
  if (!/pasangSinkronSetelan/.test(store)) throw new Error('pasangSinkronSetelan tidak diekspor');
  const app = baca('src/App.tsx');
  const panel = baca('src/PanelWindow.tsx');
  for (const [nama, isi] of [
    ['App.tsx', app],
    ['PanelWindow.tsx', panel],
  ]) {
    if (!/pasangSinkronSetelan\(\)/.test(isi)) {
      throw new Error(`${nama} tidak memasang sinkronisasi setelan`);
    }
  }
  return 'dipasang di kedua root';
});

/* ── 5b. One bar per window: no page may draw a second header ───────────── */

cek('Chat Settings TIDAK menggambar header kedua', () => {
  const page = tanpaKomentar(baca('src/components/ai/ChatSettingsPage.tsx'));
  /* The page used to render `.cset-topbar` with the title "Chat Settings" and a
     Save button. In its own window that sat under the title bar, so the reader
     saw the name twice and two rows of chrome - the "ada 2" report. The bar must
     now be conditional on a host that no longer exists. */
  const bar = page.match(/\.cset-topbar"/);
  if (bar && !/\(onDragStart \|\| onClose\) && \(/.test(page)) {
    throw new Error('.cset-topbar dirender tanpa syarat - judul akan muncul dua kali di jendela');
  }
  if (!/cset-page/.test(page)) throw new Error('halaman Chat Settings tidak ditemukan');
  return 'header bersyarat';
});

cek('Save Chat Settings dirender di title bar', () => {
  const pw = baca('src/PanelWindow.tsx');
  if (!/AksiChatSettings/.test(pw)) {
    throw new Error('PanelWindow tidak merender aksi Save di title bar - tombolnya hilang');
  }
  if (!/actions=\{id === 'chat-settings'/.test(pw)) {
    throw new Error('aksi Save tidak dipasang khusus untuk chat-settings');
  }
  const store = baca('src/lib/chatSettingsStore.ts');
  for (const k of ['kotor', 'setKotor', 'simpan', 'setSimpan']) {
    if (!store.includes(k)) throw new Error(`store tidak mengekspos "${k}" - bar tidak bisa menghitung`);
  }
  return 'Save di bar';
});

cek('setiap jendela panel memasang overlay yang bisa dibukanya', () => {
  const pw = baca('src/PanelWindow.tsx');
  /* Chat Settings has rows that open the tool-set picker and the clear-chats
     dialog. Both render from a flag, and the copies in App.tsx are in a
     different WebView - so without these mounts the buttons flip a flag nothing
     in this window renders, which reads as a dead button. */
  for (const komponen of ['ToolGatePanel', 'ClearChatsDialog']) {
    if (!new RegExp(`<${komponen}`).test(pw)) {
      throw new Error(`${komponen} tidak dipasang di PanelWindow - tombolnya akan mati`);
    }
  }
  return '2 overlay';
});

cek('ikon nav Agent Customizations unik per baris', () => {
  const page = baca('src/components/settings/AgentCustomPage.tsx');
  const blok = page.match(/const NAV: NavItem\[\] = \[([\s\S]*?)\n\];/);
  if (!blok) throw new Error('tabel NAV tidak ditemukan');
  /* Overview and Agents both drew `robot`, so two rows in the rail carried the
     identical glyph. Two sections that look the same in the rail is a defect the
     reader reports as "ikonnya sama", and it is invisible to tsc. */
  const ikon = [...blok[1].matchAll(/id: '([a-z]+)'[\s\S]*?icon: '([a-z-]+)'/g)].map((m) => ({
    id: m[1],
    ikon: m[2],
  }));
  if (ikon.length < 5) throw new Error(`hanya ${ikon.length} baris nav terbaca`);
  const perIkon = new Map();
  for (const { id, ikon: ik } of ikon) {
    if (perIkon.has(ik)) {
      throw new Error(`"${id}" dan "${perIkon.get(ik)}" memakai ikon yang sama ("${ik}")`);
    }
    perIkon.set(ik, id);
  }
  return `${ikon.length} ikon unik`;
});

/* ── 6. The window roots bootstrap their own state ──────────────────────── */
cek('PanelWindow memanggil bootstrap() (WebView terpisah, store kosong)', () => {
  const pw = baca('src/PanelWindow.tsx');
  if (!/bootstrap\(\)/.test(pw)) {
    throw new Error('PanelWindow tidak bootstrap - setiap kontrol akan menampilkan nilai bawaan');
  }
  return 'bootstrap di module load';
});

cek('main.tsx merutekan #panel= ke PanelWindow', () => {
  const main = baca('src/main.tsx');
  if (!/panelDariHash/.test(main)) throw new Error('main.tsx tidak memakai panelDariHash');
  if (!/PanelWindow/.test(main)) throw new Error('main.tsx tidak mengimpor PanelWindow');
  return 'rute ada';
});

/* ── Hasil ──────────────────────────────────────────────────────────────── */

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
if (gagal) {
  console.log('\nKegagalan:');
  for (const k of kegagalan) console.log(`  - ${k.nama}: ${k.pesan}`);
}
process.exit(gagal ? 1 : 0);
