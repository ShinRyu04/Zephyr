/*
 * verify-bahasa-ui.mjs — with the UI language set to EN, do any UI LABELS still
 * read Indonesian?
 *
 * Pakai:  node scripts/verify-bahasa-ui.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223.
 *
 * Kenapa harness ini ada. Dua gerbang kunci i18n
 * (`cek-kunci-i18n-10-kamus.mjs`, `cek-kunci-i18n-extra.mjs`) sudah hijau, dan
 * `cek-i18n-10-bahasa.mjs` melaporkan 0 kunci jatuh ke Indonesia - TETAPI layar
 * masih bisa Indonesia. Tiga sebab yang ketiganya tidak terlihat oleh gerbang
 * itu, dan semuanya ditemukan di sini:
 *
 *   1. Kunci berbahasa Indonesia yang TIDAK ADA di kamus
 *      (`tx('Disalin ke clipboard')`) -> jatuh ke teks kunci = Indonesia.
 *   2. Teks yang tidak lewat t()/tx() sama sekali (hint JSX, label pil, dan
 *      deskripsi katalog).
 *   3. Isi berkas di luar aplikasi (frontmatter `description:` pada setiap
 *      SKILL.md di folder skills workspace) yang dirender panel apa adanya.
 *
 * Gerbang ini memeriksa LABEL UI saja, dari akar tiap permukaan - bukan seluruh
 * <body>. Isi percakapan (yang diketik pembaca) dan isi halaman web di pane
 * browser memang bisa Indonesia dan bukan kebocoran terjemahan; menghitungnya
 * akan menenggelamkan yang asli.
 *
 *   B1  Settings > Theme : 0 label Indonesia
 *   B2  Chat Settings    : 0 label Indonesia
 *   B3  Marketplace      : 0 label Indonesia
 *   B4  Skills (panel Agent Customizations): 0 label Indonesia
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

const PORT = process.argv[2] ?? '9223';
const R = reporter('bahasa-ui');
/*
 * Indonesian tokens that do NOT occur in English. Deliberately excludes words
 * that are also English ("dan", "ini", "di", "ke", "isi", "baru", "kolom") -
 * a false positive costs more than a miss, because it makes the gate noisy and
 * a noisy gate gets ignored.
 */
const KATA = [
  'tidak', 'yang', 'untuk', 'dengan', 'berkas', 'pengguna', 'pengaturan', 'jendela',
  'halaman', 'tautan', 'perintah', 'perubahan', 'warna', 'kunci', 'pintasan', 'simpan',
  'buka', 'tutup', 'hapus', 'tambah', 'ubah', 'jalankan', 'muat', 'pratinjau',
  'perbesar', 'perkecil', 'salin', 'disalin', 'tempel', 'pilih', 'lihat', 'tampilkan',
  'sembunyikan', 'kirim', 'tunggu', 'selesai', 'gagal', 'berhasil', 'coba', 'ulangi',
  'lanjut', 'kembali', 'sekarang', 'nama', 'alamat', 'pesan', 'galat', 'hasil',
  'sumber', 'daftar', 'baris', 'teks', 'angka', 'tanggal', 'waktu', 'ukuran', 'wajib',
  'kosong', 'lama', 'cepat', 'mudah', 'penting', 'aman', 'bahaya', 'benar', 'salah',
  'lain', 'kurang', 'sangat', 'paling', 'sedang', 'masih', 'selalu', 'sering',
  'mungkin', 'pasti', 'jelas', 'silakan', 'tolong', 'maaf', 'perlu', 'butuh', 'ingin',
  'suka', 'tahu', 'paham', 'bikin', 'cari', 'pakai', 'ganti', 'awal', 'akhir',
  'kiri', 'kanan', 'setiap', 'semua', 'beberapa', 'banyak', 'sedikit', 'pertama',
  'kedua', 'terakhir', 'berikut', 'sebelumnya', 'selanjutnya', 'bagaimana', 'mengapa',
  'kapan', 'siapa', 'tanpa', 'oleh', 'bila', 'jika', 'agar', 'supaya', 'periksa',
  'atur', 'setel', 'unduh', 'unggah', 'sambung', 'putus', 'hentikan', 'mulai',
  'riwayat', 'catatan', 'laporan', 'kesalahan', 'peringatan', 'petunjuk', 'bantuan',
  'tentang', 'versi', 'lisensi', 'ekstensi', 'pasang', 'lepas', 'nyala', 'layar',
  'tombol', 'pilihan', 'nilai', 'berlaku', 'tersedia', 'bawaan', 'dipicu', 'dipakai',
  'menyala', 'menggali', 'memverifikasi', 'melaporkan', 'menyusun', 'menjalankan',
  'menemukan', 'mengusulkan', 'memperbaiki', 'menulis', 'mengubah', 'menetapkan',
  'diringkas', 'dipadatkan', 'dicatat', 'disimpan', 'dihapus', 'ditampilkan',
];

/*
 * The lookbehind is built from a STRING, not written as a literal: this file is
 * loaded as ESM by a Node build whose regex parser rejects a lookbehind literal
 * in some positions, and the page-side regex has to be assembled anyway (the
 * word list is injected). Same regex either way.
 */
const SUMBER_RE = '(?<![a-z])(' + KATA.join('|') + ')(?![a-z])';

/*
 * The page-side scanner, built by CONCATENATION rather than a template literal.
 *
 * WHY: the injected source has to contain a JS regex, and inside a template
 * literal those braces and dollar signs collide with the interpolation syntax -
 * Node's parser rejected every arrangement of the escapes. Plain string joins
 * have no such ambiguity and produce byte-identical page-side source.
 */
const PEMINDAI = (root) =>
  'JSON.stringify((() => {' +
  '  const re = new RegExp(' + JSON.stringify(SUMBER_RE) + ", 'i');" +
  '  const root = document.querySelector(' + JSON.stringify(root) + ');' +
  "  if (!root) return { galat: 'root tidak ada', bocor: [] };" +
  '  const out = [];' +
  '  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);' +
  '  let n;' +
  '  while ((n = walk.nextNode())) {' +
  "    const s = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();" +
  '    if (s.length < 3 || s.length > 300) continue;' +
  '    if (!re.test(s)) continue;' +
  '    const el = n.parentElement;' +
  '    if (!el) continue;' +
  '    const cs = getComputedStyle(el);' +
  "    if (cs.display === 'none' || cs.visibility === 'hidden') continue;" +
  '    if (el.getBoundingClientRect().width < 2) continue;' +
  '    let p = el, tag = null;' +
  '    for (let i = 0; i < 7 && p; i++, p = p.parentElement) {' +
  '      if (p.dataset && p.dataset.testid) { tag = p.dataset.testid; break; }' +
  '    }' +
  "    out.push({ di: tag || el.tagName.toLowerCase(), teks: s.slice(0, 140) });" +
  '  }' +
  '  return { root: ' + JSON.stringify(root) + ', bocor: out };' +
  '})())';


async function targets() {
  const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
  return (await r.json()).filter((x) => x.type === 'page');
}

/**
 * The MAIN app window: the app origin, and NOT the `#agents` window.
 *
 * WHY the URL is checked and not just "not #agents": other harnesses leave
 * their own test server pages on the debug port, and one of those is listed
 * first. Picking it attaches to a document with no `__ZEPHYR__`, and the failure
 * reads as "the app is broken" instead of "the wrong tab was chosen".
 */
function pilihMain(daftar) {
  const app = daftar.filter((x) => isApp(x));
  return app.find((x) => !(x.url ?? '').includes('#agents')) ?? null;
}

let list = await targets();
const tMain = pilihMain(list);
if (!tMain) {
  R.check('B0', false, 'window utama tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(tMain.webSocketDebuggerUrl);

/* Force EN through the product setting, then let the extra dictionary arrive. */
const lang = await cdp.runAsync(
  [
    'const St = window.__ZEPHYR__;',
    'await St.getState().applySettings({ general: { uiLang: "en" } });',
    'await new Promise(r => setTimeout(r, 1800));',
    'return St.getState().settings.general.uiLang;',
  ].join('\n'),
  40000,
);
await sleep(2500);
R.check('B0', lang === 'en', `bahasa UI diset ke "${lang}" lewat applySettings`);

const ringkas = (v) =>
  (v.bocor ?? []).map((b) => `${b.di}: ${JSON.stringify(b.teks)}`).join(' | ') || 'bersih';

/* ── B1: Settings > Theme ────────────────────────────────────────────────── */
await cdp.runAsync(
  [
    'const St = window.__ZEPHYR__;',
    'if (window.__ZEPHYR_TERM__.getState().visible) window.__ZEPHYR_TERM__.getState().setVisible(false);',
    'St.getState().setActivity("settings");',
    'St.getState().setSettingsOpen(true);',
    'window.__ZEPHYR_SETUI__.setSection("theme");',
    'await new Promise(r => setTimeout(r, 1500));',
    'return 1;',
  ].join('\n'),
  30000,
);
const b1 = JSON.parse(await cdp.eval(PEMINDAI('[data-testid="settings-page"]')));
R.check('B1', (b1.bocor ?? []).length === 0, `Settings > Theme: ${ringkas(b1)}`);

/* ── B2: Chat Settings — EVERY section, not just the default one ────────── */
/*
 * WHY every section: the first version measured only the section the page opens
 * on. "Appearance" alone carried five Indonesian rows and was never looked at,
 * so the gate was green while the screen was not. A gate that samples one page
 * out of eleven is not a gate.
 */
const SEKSI = ['mode', 'agent', 'context', 'subagent', 'tools', 'web', 'rules', 'models', 'appearance', 'session', 'advanced'];
const bocorSeksi = {};
for (const s of SEKSI) {
  await cdp.runAsync(
    [
      'const St = window.__ZEPHYR__;',
      'if (window.__ZEPHYR_TERM__.getState().visible) window.__ZEPHYR_TERM__.getState().setVisible(false);',
      `window.__ZEPHYR_CSET__.bukaDi(${JSON.stringify(s)});`,
      'await new Promise(r => setTimeout(r, 1300));',
      'return 1;',
    ].join('\n'),
    40000,
  );
  await sleep(420);
  const v = JSON.parse(await cdp.eval(PEMINDAI('[data-testid="cset-pop"]')));
  if ((v.bocor ?? []).length) bocorSeksi[s] = v.bocor;
}
R.check(
  'B2',
  Object.keys(bocorSeksi).length === 0,
  Object.keys(bocorSeksi).length === 0
    ? `Chat Settings: ${SEKSI.length} section bersih`
    : `Chat Settings bocor di ${Object.keys(bocorSeksi).length} section: ` +
        Object.entries(bocorSeksi)
          .map(([k, v]) => `${k} -> ${v.map((b) => b.teks).join(' / ')}`)
          .join(' | '),
);

/* ── B3: Marketplace — every tab, including the MCP shelf ────────────────── */
/*
 * WHY every tab: the MCP tab carries its own catalog with its own descriptions
 * and notes, and it was never scanned. Measured before the fix: 18 Indonesian
 * strings across 10 cards while the other three tabs were clean.
 */
await cdp.eval('(() => { window.__ZEPHYR_CSET__.tutup(); return 1; })()');
await sleep(600);
const TABS = ['installed', 'recommended', 'marketplace', 'mcp'];
const bocorTab = {};
for (const tb of TABS) {
  await cdp.runAsync(
    [
      'const St = window.__ZEPHYR__;',
      'const cs = window.__ZEPHYR_EXT19__.store();',
      'St.getState().setSettingsOpen(false);',
      'St.getState().setActivity("extensions");',
      'await new Promise(r => setTimeout(r, 900));',
      `cs.getState().setTab(${JSON.stringify(tb)});`,
      'await new Promise(r => setTimeout(r, 1700));',
      'return 1;',
    ].join('\n'),
    40000,
  );
  await sleep(450);
  const v = JSON.parse(await cdp.eval(PEMINDAI('[data-testid="extensions-view"]')));
  if ((v.bocor ?? []).length) bocorTab[tb] = v.bocor;
}
R.check(
  'B3',
  Object.keys(bocorTab).length === 0,
  Object.keys(bocorTab).length === 0
    ? `Marketplace: ${TABS.length} tab bersih`
    : `Marketplace bocor di ${Object.keys(bocorTab).length} tab: ` +
        Object.entries(bocorTab)
          .map(([k, v]) => `${k} -> ${v.map((b) => b.teks).join(' / ')}`)
          .join(' | '),
);

/* ── B4: Skills (panel Agent Customizations, window Agents) ──────────────── */
list = await targets();
let tAg = list.find((x) => isApp(x) && (x.url ?? '').includes('#agents'));
if (!tAg) {
  await cdp.eval(
    `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); return 1; })()`,
  );
  await sleep(7000);
  list = await targets();
  tAg = list.find((x) => isApp(x) && (x.url ?? '').includes('#agents'));
}if (!tAg) {
  R.check('B4', false, 'window Agents tidak bisa dibuka, panel Skills tidak terukur');
} else {
  const cdpAg = await Cdp.connect(tAg.webSocketDebuggerUrl);
  await cdpAg.runAsync(
    [
      'const St = window.__ZEPHYR__;',
      'await St.getState().applySettings({ general: { uiLang: "en" } });',
      'await new Promise(r => setTimeout(r, 1800));',
      "const row = document.querySelector('[data-testid=\"ag-cust-skills\"]');",
      'if (row) { row.click(); await new Promise(r => setTimeout(r, 1800)); }',
      'return !!row;',
    ].join('\n'),
    40000,
  );
  const b4 = JSON.parse(await cdpAg.eval(PEMINDAI('[role="dialog"]')));
  R.check('B4', (b4.bocor ?? []).length === 0, `Skills: ${ringkas(b4)}`);
}

R.selesai();
keluarBersih();
