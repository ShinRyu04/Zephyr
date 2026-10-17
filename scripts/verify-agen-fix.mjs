/*
 * verify-agen-fix.mjs — bukti untuk empat perbaikan yang diminta pembaca.
 *
 * Pakai:  node scripts/verify-agen-fix.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * Yang dibuktikan (semua dari keadaan yang HIDUP, bukan dari membaca kode):
 *
 *   F1  Overlay: child webview DIHIDE saat sebuah overlay (menu `…`) terbuka,
 *       lalu ditampilkan lagi saat menutup. Ini bug yang dilaporkan: menu yang
 *       digambar di atas pane "hilang" di belakang halaman. Fakta yang diukur
 *       adalah `visible` dari `browser_pane_info` (Rust) — bukan efek frontend,
 *       jadi yang diuji adalah keadaannya, bukan niatnya.
 *   F2  Changes: klik satu baris change mengisi diff DAN membuka berkasnya
 *       (dulu tidak terjadi apa-apa — `openDiff` mengisi store, tak ada yang
 *       merender).
 *   F3  Izin situs: menu `…` punya tombol "Allow this site for the agent".
 *   F4  Ikon share tidak lagi kembar: tombol aksi dan pil status memakai glyph
 *       yang BERBEDA (path `d`-nya tidak sama).
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

const PORT = process.argv[2] ?? '9223';
const R = reporter('agen-fix');

async function targets() {
  return (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
    (x) => x.type === 'page',
  );
}

let list = await targets();
let tAg = list.find((x) => isApp(x) && (x.url ?? '').includes('#agents'));
if (!tAg) {
  const tMain = list.find((x) => isApp(x) && !(x.url ?? '').includes('#agents'));
  if (!tMain) {
    R.check('F0', false, 'tidak ada target window utama di :' + PORT);
    R.selesai();
    keluarBersih(1);
  }
  const cm = await Cdp.connect(tMain.webSocketDebuggerUrl);
  await cm.eval(
    `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); return 1; })()`,
  );
  await sleep(7000);
  list = await targets();
  tAg = list.find((x) => isApp(x) && (x.url ?? '').includes('#agents'));
}
if (!tAg) {
  R.check('F0', false, 'window Agents tidak bisa dibuka');
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(tAg.webSocketDebuggerUrl);
R.check('F0', true, 'window Agents tersambung lewat CDP');

/* ── F1: overlay menyembunyikan child webview ────────────────────────────── */
const f1 = await cdp.runAsync(
  [
    "const info = (await import('/src/lib/commands.ts')).browserPaneInfo;",
    /*
     * START CLEAN. The Agents window is shared state: a modal left open by an
     * earlier check (or by the reader) is an overlay, and an overlay correctly
     * hides the pane - so measuring without closing it first reports
     * "awal=false" and fails for a reason that has nothing to do with the fix.
     * Close everything, then establish the baseline the check needs.
     */
    'for (let i = 0; i < 3; i++) {',
    /*
     * A real keypress targets `document.activeElement` and bubbles to
     * `document`. `window.dispatchEvent` targets the window, which is ABOVE
     * document, so no dialog listener ever sees it - the cleanup silently did
     * nothing and left modals standing.
     */
    "  const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });",
    '  (document.activeElement || document.body).dispatchEvent(ev);',
    '  await new Promise(r => setTimeout(r, 250));',
    '}',
    "for (const sel of ['[data-testid$=\"-scrim\"]', '.agc-backdrop', '.agc-scrim', '.ag-modal-backdrop']) {",
    '  const el = document.querySelector(sel);',
    '  if (el) { el.click(); await new Promise(r => setTimeout(r, 350)); }',
    '}',
    'await new Promise(r => setTimeout(r, 700));',
    "const overlayTersisa = [...document.querySelectorAll('[role=\"dialog\"], [role=\"menu\"]')]",
    "  .filter((e) => e.getClientRects().length > 0).length;",
    "const tabBrowser = document.querySelector('[data-testid=\"ag-tab-browser\"]');",
    "if (!tabBrowser) return { galat: 'tab browser tidak ada', overlayTersisa };",
    'tabBrowser.click();',
    'await new Promise(r => setTimeout(r, 1200));',
    "const input = document.querySelector('[data-testid=\"ag-browser-url\"]');",
    'if (!input) return { galat: "input alamat tidak ada" };',
    'const set = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;',
    'set.call(input, "https://example.com/");',
    'input.dispatchEvent(new Event("input", { bubbles: true }));',
    'await new Promise(r => setTimeout(r, 200));',
    'input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));',
    'await new Promise(r => setTimeout(r, 3500));',
    /*
     * The pane is created by the component, so the FIRST `browser_pane_info`
     * right after submit can still be the previous pane (or missing entirely)
     * while the new child webview is being built. Retry until it exists and
     * reports a URL, otherwise the visibility readings below are `undefined`
     * and the check fails for a reason that has nothing to do with overlays.
     */
    'let awal = null;',
    'for (let i = 0; i < 40; i++) {',
    '  try { const x = await info("agents-browser"); if (x && x.url) { awal = x; break; } } catch {}',
    '  await new Promise(r => setTimeout(r, 300));',
    '}',
    'if (!awal) return { galat: "pane browser tidak pernah siap" };',
    "const more = document.querySelector('[data-testid=\"ag-browser-more\"]');",
    'if (!more) return { galat: "tombol … tidak ada" };',
    'more.click();',
    'await new Promise(r => setTimeout(r, 900));',
    'const menuBuka = !!document.querySelector(\'[data-testid="ag-menu-browser"]\');',
    'const saatMenu = await info("agents-browser");',
    'more.click();',
    'await new Promise(r => setTimeout(r, 900));',
    'const sesudah = await info("agents-browser");',
    'return { url: awal.url, menuBuka, awal: awal.visible, saatMenu: saatMenu.visible, sesudah: sesudah.visible, overlayTersisa };',
  ].join('\n'),
  60000,
);
R.check(
  'F1',
  f1.awal === true && f1.menuBuka === true && f1.saatMenu === false && f1.sesudah === true,
  `child webview visible: awal=${f1.awal} -> saat menu buka=${f1.saatMenu} -> sesudah tutup=${f1.sesudah} (menu terbaca=${f1.menuBuka}, url=${f1.url}, overlay tersisa saat awal=${f1.overlayTersisa})`,
);

/* ── F2: baris Changes membuka diff + berkas ─────────────────────────────── */
const f2 = await cdp.runAsync(
  [
    'const Git = window.__ZEPHYR_GIT__;',
    'const St = window.__ZEPHYR__;',
    'await Git.refresh();',
    'await new Promise(r => setTimeout(r, 1500));',
    'const st = Git.status();',
    'const n = st && st.changes ? st.changes.length : 0;',
    /*
     * Open Changes through the PRODUCT path: the `+` menu lists the views, and
     * the tab strip may legitimately hold only Browser (the reader can close
     * every tab). Clicking a tab that is not open was the harness's bug, not
     * the app's.
     */
    "let tab = document.querySelector('[data-testid=\"ag-tab-changes\"]');",
    'if (!tab) {',
    "  const plus = document.querySelector('[data-testid=\"ag-tab-plus\"]');",
    '  plus.click();',
    '  await new Promise(r => setTimeout(r, 600));',
    "  const item = document.querySelector('[data-testid=\"ag-open-changes\"]');",
    '  if (!item) return { galat: "menu + tidak punya Changes" };',
    '  item.click();',
    '  await new Promise(r => setTimeout(r, 1200));',
    "  tab = document.querySelector('[data-testid=\"ag-tab-changes\"]');",
    '}',
    'if (!tab) return { galat: "tab changes tidak ada" };',
    'tab.click();',
    'await new Promise(r => setTimeout(r, 1200));',
    'const sebelum = St.getState().tabs.length;',
    "const row = document.querySelector('.ag-changes-row');",
    'if (!row) return { galat: "tidak ada baris change", n };',
    'const id = row.getAttribute("data-testid");',
    'row.click();',
    'await new Promise(r => setTimeout(r, 2200));',
    'const sesudah = St.getState().tabs.length;',
    'const d = Git.diff();',
    'const el = document.querySelector("[class*=diff]");',
    'return { n, id, sebelum, sesudah, adaDiff: !!d, diffPath: d ? d.path : null, adaViewer: !!el };',
  ].join('\n'),
  60000,
);
R.check(
  'F2',
  /*
   * The click must produce a DIFF and a VISIBLE viewer. It does not have to add
   * a new tab: a file already open keeps its tab (a preview open does not
   * duplicate), so `sesudah > sebelum` was the wrong assertion - it failed on a
   * correctly working app the moment the same file had been opened once.
   */
  !!f2.id && f2.adaDiff === true && f2.adaViewer === true,
  `klik ${f2.id} (dari ${f2.n} change): diff=${f2.adaDiff} path=${f2.diffPath}, tab ${f2.sebelum}->${f2.sesudah}, viewer di DOM=${f2.adaViewer}`,
);

/* ── F3: tombol "Allow this site" ────────────────────────────────────────── */
const f3 = await cdp.runAsync(
  [
    /*
     * Open the Browser view through the PRODUCT path, not by assuming the tab is
     * already there: the reader can close every tab, and a harness that then
     * reads `null.click()` fails for a reason that has nothing to do with the
     * button it is testing.
     */
    "let tab = document.querySelector('[data-testid=\"ag-tab-browser\"]');",
    'if (!tab) {',
    "  const plus = document.querySelector('[data-testid=\"ag-tab-plus\"]');",
    '  if (!plus) return { galat: "tombol + tidak ada" };',
    '  plus.click();',
    '  await new Promise(r => setTimeout(r, 700));',
    "  const item = document.querySelector('[data-testid=\"ag-open-browser\"]');",
    '  if (!item) return { galat: "menu + tidak punya Browser" };',
    '  item.click();',
    '  await new Promise(r => setTimeout(r, 1400));',
    "  tab = document.querySelector('[data-testid=\"ag-tab-browser\"]');",
    '}',
    'if (tab) { tab.click(); await new Promise(r => setTimeout(r, 1200)); }',
    "const more = document.querySelector('[data-testid=\"ag-browser-more\"]');",
    'if (!more) return { galat: "tombol … tidak ada" };',
    'more.click();',
    'await new Promise(r => setTimeout(r, 700));',
    "const btn = document.querySelector('[data-testid=\"ag-browser-allow\"]');",
    'const ada = !!btn;',
    'const label = btn ? btn.textContent.trim() : null;',
    'more.click();',
    'return { ada, label };',
  ].join('\n'),
  40000,
);
R.check(
  'F3',
  f3.ada === true && /allow this site/i.test(f3.label ?? ''),
  `menu … punya tombol izin situs: ada=${f3.ada} label="${f3.label}"`,
);

/* ── F4: ikon share tidak kembar ─────────────────────────────────────────── */
const f4 = await cdp.runAsync(
  [
    'const aksi = document.querySelector(\'[data-testid="ag-browser-share"] svg path\');',
    'const pil = document.querySelector(\'[data-testid="ag-browser-share-status"] svg path\');',
    'const rect = document.querySelector(\'[data-testid="ag-browser-share-status"] svg rect\');',
    'return { aksi: aksi ? aksi.getAttribute("d") : null, pil: pil ? pil.getAttribute("d") : null, pilAdaRect: !!rect };',
  ].join('\n'),
  20000,
);
R.check(
  'F4',
  !!f4.aksi && !!f4.pil && f4.aksi !== f4.pil,
  `ikon tombol aksi dan pil status BERBEDA (aksi="${(f4.aksi ?? '').slice(0, 24)}…", pil="${(f4.pil ?? '').slice(0, 24)}…")`,
);

R.selesai();
keluarBersih();
