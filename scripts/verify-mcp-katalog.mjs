/*
 * verify-mcp-katalog.mjs — the MCP catalog must produce a WORKING server, not
 * just a written settings entry.
 *
 * Pakai:  node scripts/verify-mcp-katalog.mjs [portCdp]
 *
 * Kenapa: permintaan pembaca menyebut "termasuk MCP server" untuk aturan
 * "ekstensi harus benar-benar bisa dipakai". Yang mudah salah di sini adalah
 * memasang entri yang tidak pernah dijalankan: kartunya berubah jadi
 * "Uninstall" dan tidak ada satu pun tool yang muncul ke agen.
 *
 * Semua store dibaca dari JEMBATAN DEV (`__ZEPHYR_EXT19__`, `__ZEPHYR_MCP__`),
 * bukan dari `import()`: di Vite dev, `import('/src/lib/x')` membangun instance
 * modul KEDUA dengan store zustand-nya sendiri, jadi `setTab` di sana mengubah
 * store yang tidak pernah dibaca komponen — kartunya tetap nol dan ujinya
 * berbohong. Data katalog murni (`KATALOG_MCP_SERVER`) aman diimpor karena ia
 * konstanta tanpa keadaan.
 *
 *   M1  katalog memuat 10 server, DAN semua entri bisa dipasang (tidak ada
 *       "Unavailable" karena transport stdio belum tersambung).
 *   M2  memasang satu server http benar-benar menuliskannya ke daftar server
 *       yang dipakai panel (bukan hanya ke settings.json).
 *   M3  sesudah dipasang, kartunya menawarkan Uninstall (bukan Install lagi).
 *   M4  membersihkan lagi mengembalikan keadaan semula (idempoten).
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

const PORT = process.argv[2] ?? '9223';
const R = reporter('mcp-katalog');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(
  (x) => x.type === 'page',
);
const t = list.find((x) => isApp(x) && !(x.url ?? '').includes('#agents'));
if (!t) {
  R.check('M0', false, 'window utama tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const katalog = await cdp.runAsync(
  [
    "const K = await import('/src/lib/katalogMcpServer.ts');",
    'return {',
    '  jumlah: K.KATALOG_MCP_SERVER.length,',
    '  tidakBisa: K.KATALOG_MCP_SERVER.filter((e) => !K.bisaDipasang(e)).map((e) => e.id),',
    '  http: K.KATALOG_MCP_SERVER.filter((e) => e.transport === "http").map((e) => e.id),',
    '  stdio: K.KATALOG_MCP_SERVER.filter((e) => e.transport === "stdio").map((e) => e.id),',
    '};',
  ].join('\n'),
  30000,
);
R.check(
  'M1',
  katalog.jumlah >= 10 && katalog.tidakBisa.length === 0,
  `katalog ${katalog.jumlah} server (http: ${katalog.http.join(',')} | stdio: ${katalog.stdio.join(',')}); ` +
    `tidak bisa dipasang: ${katalog.tidakBisa.length ? katalog.tidakBisa.join(',') : '-'}`,
);

/* M2-M4: install the first http server, then remove it. */
const alur = await cdp.runAsync(
  [
    "const K = await import('/src/lib/katalogMcpServer.ts');",
    'const Ex = window.__ZEPHYR_EXT19__.store();',
    'const Mc = window.__ZEPHYR_MCP__;',
    'await Mc.refreshServers();',
    'const id = K.KATALOG_MCP_SERVER.find((e) => e.transport === "http").id;',
    'const sebelum = Mc.store.getState().servers.map((s) => s.id);',
    /*
     * Put the app on the Extensions view first, THEN open the MCP tab. The card
     * only exists while that view is mounted, and the view is chosen by the
     * activity bar — a harness that assumes it is already there fails on a
     * perfectly working app.
     */
    'window.__ZEPHYR__.getState().setActivity("extensions");',
    'await new Promise(r => setTimeout(r, 1200));',
    'Ex.getState().setTab("mcp");',
    'await new Promise(r => setTimeout(r, 1400));',
    'const kartu = document.querySelector(`[data-mcp-card="${id}"]`);',
    'const adaKartu = !!kartu;',
    'const tombol = document.querySelector(`[data-testid="xc-mcp-install-${id}"]`);',
    'const tombolAda = !!tombol;',
    'if (tombol) { tombol.click(); await new Promise(r => setTimeout(r, 2000)); }',
    'await Mc.refreshServers();',
    'const sesudah = Mc.store.getState().servers.map((s) => s.id);',
    /*
     * Let the VIEW's own `refreshServers` effect (it runs on mount) and the
     * install round-trip settle before reading the card. The card's installed
     * state comes from the view's `servers` list, which is refreshed by the
     * component itself, not by our call — so reading too early sees the
     * pre-install render.
     */
    'await new Promise(r => setTimeout(r, 1200));',
    'await Mc.refreshServers();',
    'await new Promise(r => setTimeout(r, 900));',
    /*
     * Poll for the re-rendered card instead of reading once. The install
     * round-trips through Rust and then the panel re-renders, so a single read
     * can land before React commits and report an empty string on a card that is
     * in fact correct.
     */
    'let terpasang = null;',
    'let tujuanTeks = null;',
    'for (let i = 0; i < 30; i++) {',
    '  const k = document.querySelector(`[data-mcp-card="${id}"]`);',
    '  const t = document.querySelector(`[data-testid="xc-mcp-tujuan-teks-${id}"]`);',
    '  if (k) terpasang = k.getAttribute("data-mcp-terpasang");',
    '  if (t && t.textContent.trim()) { tujuanTeks = t.textContent.trim(); break; }',
    /* Re-ask the store every few rounds: the view reads `servers`, and its own
       refresh may still be in flight when the first read happens. */
    '  if (i % 5 === 4) { await Mc.refreshServers(); }',
    '  await new Promise(r => setTimeout(r, 250));',
    '}',
    'const tawaran = document.querySelector(`[data-testid="xc-mcp-install-${id}"]`) ? "install" : "uninstall";',
    /* Clean up through the same store action the panel uses. */
    'await Mc.store.getState().removeServer(id).catch(() => {});',
    'await Mc.refreshServers();',
    'await new Promise(r => setTimeout(r, 500));',
    'const akhir = Mc.store.getState().servers.map((s) => s.id);',
    'return { id, adaKartu, tombolAda, sebelum, sesudah, terpasang, tawaran, akhir, tujuanTeks };',
  ].join('\n'),
  90000,
);

R.check(
  'M2',
  alur.adaKartu === true && alur.tombolAda === true && alur.sesudah.includes(alur.id),
  `memasang "${alur.id}" dari kartunya menuliskan server ke daftar: ${JSON.stringify(alur.sebelum)} -> ${JSON.stringify(alur.sesudah)}`,
);
R.check(
  'M3',
  alur.terpasang === '1' && alur.tawaran === 'uninstall',
  `kartu "${alur.id}" jadi terpasang=${alur.terpasang}, tombolnya sekarang "${alur.tawaran}"`,
);
R.check(
  'M5',
  !!alur.tujuanTeks && /settings\.json/i.test(alur.tujuanTeks) && /mcp\.servers/i.test(alur.tujuanTeks),
  `kartu terpasang menyebut tujuannya: ${JSON.stringify((alur.tujuanTeks ?? '').slice(0, 130))}`,
);
R.check(
  'M4',
  !alur.akhir.includes(alur.id),
  `membersihkan mengembalikan daftar: ${JSON.stringify(alur.akhir)}`,
);

R.selesai();
keluarBersih();
