// verify-agents-browser.mjs — verifikasi kolom kanan window Agents + jembatan AI.
//
// Pakai:  node scripts/verify-agents-browser.mjs [portCdp]
// Syarat: 1) zephyr.exe berjalan dengan
//            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
//         2) `npm run dev` (vite) hidup di :5173
//
// Prinsip: semuanya diukur dari DOM/keadaan yang hidup, bukan dari membaca kode.
// Halaman uji dilayani server lokal di :8099 (port 8080 TIDAK bisa dipakai di
// mesin ini - WinError 10013), jadi uji ini tidak butuh internet.
//
// Yang dibuktikan:
//   A. Split kolom kanan mengikuti TAB: Changes/Files belah dua, Search/Browser
//      selebar kolom; tombol Toggle Details hanya ada saat memang ada yang
//      bisa disembunyikan.
//   B. Browser di kolom itu benar-benar hidup: alamat dimuat, placeholder
//      hilang, tidak ada "[object Object]".
//   C. Toolbar lengkap dan menu-menu berisi item yang benar.
//   D. Jembatan AI: `browser_open` yang dijalankan DI window Agents mendarat di
//      pane window itu, bukan di panel terminal window utama; `browser_list`
//      melihatnya dan `browser_read` bisa membaca halamannya.
//   E. Toggle "Sharing with Agent" benar-benar berhenti membagikan.

import http from 'node:http';
import { Cdp, sleep, reporter, keluarBersih, tungguBridge } from './lib-cdp.mjs';

const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');

const CDP_PORT = process.argv[2] ?? '9223';
const TEST_PORT = 8099;
const TANDA = 'HALAMAN-UJI-AGENTS-BROWSER';

/* ── server uji lokal ─────────────────────────────────────────────────────── */
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>Halaman Uji</title></head>
    <body><h1>${TANDA}</h1><p>isi halaman uji untuk browser pane</p></body></html>`);
});
await new Promise((r) => server.listen(TEST_PORT, '127.0.0.1', r));

const R = reporter('agents-browser');
const URL_UJI = `http://127.0.0.1:${TEST_PORT}/`;

/* ── dua window, dua target CDP ───────────────────────────────────────────── */
const daftarTarget = async () =>
  (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).filter(
    (t) => t.type === 'page',
  );

let targetAgents = (await daftarTarget()).find((t) => isApp(t) && (t.url ?? '').includes('#agents'));
const targetMain = (await daftarTarget()).find((t) => isApp(t) && !(t.url ?? '').includes('#agents'));
if (!targetMain) {
  console.error('target window utama tidak ada di :' + CDP_PORT);
  server.close();
  keluarBersih(1);
}

const cdpMain = (await Cdp.attach(CDP_PORT, 'Zephyr')).cdp;
await tungguBridge(cdpMain, '__ZEPHYR_CP__', 25000);

/* Buka window Agents lewat jalur resminya kalau belum ada. */
if (!targetAgents) {
  await cdpMain.eval(
    `(() => { window.__ZEPHYR_CP__.store.getState().runCommandById('agents.openWindow'); return 1; })()`,
  );
  await sleep(5000);
  targetAgents = (await daftarTarget()).find((t) => isApp(t) && (t.url ?? '').includes('#agents'));
}
if (!targetAgents) {
  R.check('A0', false, 'window Agents tidak bisa dibuka');
  R.selesai();
  server.close();
  keluarBersih(1);
}
const cdpAg = await Cdp.connect(targetAgents.webSocketDebuggerUrl);
await tungguBridge(cdpAg, '__ZEPHYR_TERM__', 25000);

/*
 * START CLEAN: close any browser pane left in the terminal grid.
 *
 * `browser_open` deliberately prefers the Agents window's browser ONLY when no
 * terminal browser pane exists (`web.ts` checks `adaTerminal`), because a
 * reader may already have one open and asking the agent for a page should not
 * steal it. An earlier run — or the reader — leaving one behind means every
 * `browser_open` in section D silently takes the terminal branch, so the
 * Agents column stays empty and D2/D5 fail for a reason that has nothing to do
 * with the bridge being tested.
 */
await cdpAg.runAsync(
  `const TB = window.__ZEPHYR_TERM__.getState();
   const idsTutup = [];
   for (const tab of TB.terminalTabs) for (const p of tab.panes) if (p.kind === 'browser') idsTutup.push(p.id);
   for (const id of idsTutup) { try { await TB.closePane(id); } catch {} }
   return String(idsTutup.length);`,
  60000,
);
await sleep(1200);
R.check('A0', true, 'window utama + window Agents tersambung lewat CDP');

/* ── helpers ─────────────────────────────────────────────────────────────── */
const qAg = async (expr) => cdpAg.eval(`JSON.stringify((() => { ${expr} })())`);

/** Buka tab view di kolom kanan lewat shortcut resminya (Ctrl+Shift+…). */
const bukaTab = async (id) => {
  const peta = { changes: 'g', files: 'e', search: 'f', browser: 'b' };
  await cdpAg.eval(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', {
    key: ${JSON.stringify(peta[id])}, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); return 1; })()`);
  await sleep(900);
};

const potretKolom = async () =>
  JSON.parse(
    await qAg(`
    const R = (s) => { const e = document.querySelector(s); if (!e) return null;
                       const b = e.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width) }; };
    const body = document.querySelector('.ag-tab-body');
    const detail = document.querySelector('[data-testid="ag-toggle-details"]');
    return {
      aktif: document.querySelector('.ag-tab.is-aktif')?.dataset.testid ?? null,
      belah: body?.classList.contains('is-belah') ?? null,
      ed: R('[data-testid="ag-body-editor"]'),
      list: R('[data-testid="ag-body-list"]'),
      kolom: R('[data-testid="agents-right"]'),
      detailTampil: detail ? getComputedStyle(detail).display !== 'none' : false,
    };`),
  );

/* ── A. Split mengikuti tab ──────────────────────────────────────────────── */
await bukaTab('changes');
const aChanges = await potretKolom();
await bukaTab('files');
const aFiles = await potretKolom();
await bukaTab('search');
const aSearch = await potretKolom();
await bukaTab('browser');
const aBrowser = await potretKolom();

const belahBenar =
  aChanges.belah === true && aChanges.ed !== null && aChanges.detailTampil === true &&
  aFiles.belah === true && aFiles.ed !== null && aFiles.detailTampil === true;
R.check(
  'A1',
  belahBenar,
  `Changes/Files belah dua + Toggle Details tampil (changes=${JSON.stringify(aChanges)} files=${JSON.stringify(aFiles)})`,
);

const penuhBenar =
  aSearch.belah === false && aSearch.ed === null && aSearch.detailTampil === false &&
  aBrowser.belah === false && aBrowser.ed === null && aBrowser.detailTampil === false;
R.check(
  'A2',
  penuhBenar,
  `Search/Browser selebar kolom, tanpa setengah editor (search=${aSearch.list?.w}px browser=${aBrowser.list?.w}px dari kolom ${aBrowser.kolom?.w}px)`,
);

R.check(
  'A3',
  (aSearch.list?.w ?? 0) > (aChanges.list?.w ?? 0) * 2,
  `panel full-width benar-benar lebih lebar dari panel belah (${aSearch.list?.w} vs ${aChanges.list?.w})`,
);

/* ── B/C. Browser hidup + toolbar ────────────────────────────────────────── */
const alat = JSON.parse(await qAg(`
  const punya = (id) => !!document.querySelector('[data-testid="' + id + '"]');
  return {
    url: punya('ag-browser-url'), back: punya('ag-browser-back'), fwd: punya('ag-browser-forward'),
    reload: punya('ag-browser-reload'), share: punya('ag-browser-share'),
    status: punya('ag-browser-share-status'), inspect: punya('ag-browser-inspect'),
    devtools: punya('ag-browser-devtools'), more: punya('ag-browser-more'),
    kosong: punya('ag-browser-empty'), galat: punya('ag-browser-galat'),
  };`));
R.check(
  'B1',
  alat.url && alat.back && alat.fwd && alat.reload && alat.share && alat.status && alat.inspect && alat.devtools && alat.more,
  `toolbar lengkap: ${JSON.stringify(alat)}`,
);
R.check('B2', alat.kosong === true && alat.galat === false, 'placeholder tampil tanpa galat saat belum ada alamat');

/* Izinkan host uji SEMENTARA (dipulihkan di akhir). */
const setAsli = JSON.parse(
  await cdpAg.eval(`JSON.stringify({
    izinIsiWeb: window.__ZEPHYR__.getState().settings.izinIsiWeb ?? null,
    allowlistWeb: window.__ZEPHYR__.getState().settings.allowlistWeb ?? null,
    izinJaringanLokal: window.__ZEPHYR__.getState().settings.izinJaringanLokal ?? null,
    portWeb: window.__ZEPHYR__.getState().settings.portWeb ?? null,
  })`),
);
await cdpAg.runAsync(`await window.__ZEPHYR__.getState().applySettings({
  izinIsiWeb: true,
  allowlistWeb: ['127.0.0.1'],
  izinJaringanLokal: true,
  portWeb: [80, 443, ${TEST_PORT}],
});
return 'ok';`);
await sleep(700);

/* ── D. Jembatan: browser_open dijalankan DI window Agents ───────────────── */
const jalankanTool = (nama, args) =>
  cdpAg.runAsync(
    `const m = await import('/src/lib/agentTools.ts');
     try { return String(await m.jalankanAgentTool(${JSON.stringify(nama)}, ${JSON.stringify(args)})); }
     catch (e) { return 'THROW: ' + String(e && e.message ? e.message : e); }`,
    90000,
  );

const jawabOpen = await jalankanTool('browser_open', { url: URL_UJI });
R.check('D1', /loaded|ready to read|already open/i.test(jawabOpen), `browser_open: ${jawabOpen.slice(0, 150)}`);

await sleep(2500);
const paneAg = JSON.parse(
  await qAg(`
  return {
    url: document.querySelector('[data-testid="ag-browser-url"]')?.value ?? null,
    kosong: !!document.querySelector('[data-testid="ag-browser-empty"]'),
    galat: document.querySelector('[data-testid="ag-browser-galat"]')?.textContent ?? null,
  };`),
);
R.check(
  'D2',
  paneAg.url === URL_UJI && paneAg.kosong === false && paneAg.galat === null,
  `pane window Agents memuat alamatnya: ${JSON.stringify(paneAg)}`,
);

const paneMain = JSON.parse(
  await cdpMain.eval(`JSON.stringify((() => {
    const t = window.__ZEPHYR_TERM__.getState(); const out = [];
    for (const tab of t.terminalTabs) for (const p of tab.panes) if (p.kind === 'browser') out.push(p.id);
    return { jumlah: out.length, ids: out };
  })())`),
);
R.check('D3', paneMain.jumlah === 0, `tidak ada pane browser dibuat di window utama: ${JSON.stringify(paneMain)}`);

const daftar = await jalankanTool('browser_list', {});
R.check('D4', /agents-browser/.test(daftar) && /"window":\s*"agents"/.test(daftar), `browser_list melihat pane Agents: ${daftar.replace(/\s+/g, ' ').slice(0, 150)}`);

const dibaca = await jalankanTool('browser_read', {});
R.check('D5', dibaca.includes(TANDA), `browser_read membaca halaman Agents: ${dibaca.replace(/\s+/g, ' ').slice(0, 140)}`);

/* ── E. Toggle "Sharing with Agent" benar-benar berhenti membagikan ──────── */
const statusAwal = await cdpAg.eval(
  `document.querySelector('[data-testid="ag-browser-share-status"]')?.getAttribute('aria-pressed')`,
);
await cdpAg.eval(`(() => { document.querySelector('[data-testid="ag-browser-share-status"]')?.click(); return 1; })()`);
/* React commits the new state asynchronously and the effect that unpublishes the
   pane runs after that — reading immediately would race both. */
await sleep(2500);
const statusSesudah = await cdpAg.eval(
  `document.querySelector('[data-testid="ag-browser-share-status"]')?.getAttribute('aria-pressed')`,
);
const daftarSesudah = await jalankanTool('browser_list', {});
R.check(
  'E1',
  statusAwal === 'true' && statusSesudah === 'false' && !/agents-browser/.test(daftarSesudah),
  `OFF berhenti membagikan: aria ${statusAwal} -> ${statusSesudah}, daftar=${daftarSesudah.replace(/\s+/g, ' ').slice(0, 80)}`,
);
await cdpAg.eval(`(() => { document.querySelector('[data-testid="ag-browser-share-status"]')?.click(); return 1; })()`);
await sleep(2500);
const daftarBalik = await jalankanTool('browser_list', {});
R.check('E2', /agents-browser/.test(daftarBalik), `ON membagikan lagi: ${daftarBalik.replace(/\s+/g, ' ').slice(0, 90)}`);

/* ── bersih-bersih ───────────────────────────────────────────────────────── */
await jalankanTool('browser_open', { url: '' }).catch(() => {});
/*
 * A terminal browser pane created by an earlier run would flip `adaTerminal`
 * next time and send `browser_open` down the wrong branch again, so close any
 * that is still open here (the same cleanup as the start of the run).
 */
await cdpAg.runAsync(
  `const TB = window.__ZEPHYR_TERM__.getState();
   const idsTutup = [];
   for (const tab of TB.terminalTabs) for (const p of tab.panes) if (p.kind === 'browser') idsTutup.push(p.id);
   for (const id of idsTutup) { try { await TB.closePane(id); } catch {} }
   return String(idsTutup.length);`,
  60000,
).catch(() => {});
await cdpAg.runAsync(`await window.__ZEPHYR__.getState().applySettings({
  izinIsiWeb: ${JSON.stringify(setAsli.izinIsiWeb)},
  allowlistWeb: ${JSON.stringify(setAsli.allowlistWeb)},
  izinJaringanLokal: ${JSON.stringify(setAsli.izinJaringanLokal)},
  portWeb: ${JSON.stringify(setAsli.portWeb)},
});
return 'ok';`);

R.selesai();
cdpAg.close();
await cdpMain.close();
server.close();
keluarBersih(process.exitCode ?? 0);
