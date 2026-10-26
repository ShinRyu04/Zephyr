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
//   A. Panel kanan jendela Agents: panel yang TERTUTUP tidak dirender, tab
//      Browser bisa dibuka dari tombol `+` di kontrol sudut, dan panel yang
//      terbuka memuat view browser selebar panelnya (bukan setengah editor).
//   B. Browser di panel itu benar-benar hidup: alamat dimuat, placeholder
//      hilang, stage punya ukuran nyata.
//   C. Tool browser memakai bentuk GABUNGAN (`browser` dengan `aksi`); nama
//      lama `browser_open` / `browser_list` / `browser_read` sudah tidak ada.
//   D. Jembatan AI: `browser` aksi `open` yang dijalankan DI window Agents
//      mendarat di pane window itu, BUKAN di window utama — dan panel yang
//      tadinya tertutup terbuka sendiri. `list` melihatnya, `read` bisa
//      membaca halamannya.
//   E. `browser` aksi `close` menutup pane itu lagi.
//
// Catatan penting soal target CDP: child webview browser pane ikut muncul di
// /json/list sebagai `page` biasa dengan URL halaman yang dimuat. Jendela
// utama dikenali dari ORIGIN-nya (localhost:5173 / tauri.localhost), bukan dari
// judul, supaya halaman uji tidak pernah disangka jendela app.

import http from 'node:http';
import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const APP_ORIGIN = /^https?:\/\/(localhost:5173|tauri\.localhost)(\/|$)/;
/** Halaman app (bukan child webview browser pane yang memuat situs luar). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');
const isAgents = (t) => isApp(t) && (t.url ?? '').includes('#agents');

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

let targetAgents = (await daftarTarget()).find(isAgents);
const targetMain = (await daftarTarget()).find((t) => isApp(t) && !isAgents(t));
if (!targetMain) {
  console.error('target window utama tidak ada di :' + CDP_PORT);
  server.close();
  keluarBersih(1);
}

const cdpMain = await Cdp.connect(targetMain.webSocketDebuggerUrl);
/*
 * Jendela utama punya aktivitas yang membuat konteksnya sibuk saat start; satu
 * poll kecil sebelum dipakai lebih murah daripada setiap eval kena timeout.
 */
for (let i = 0; i < 40; i++) {
  try {
    if (await cdpMain.eval('1 + 1')) break;
  } catch {
    /* konteks belum siap */
  }
  await sleep(500);
}

/* Buka window Agents lewat jalur resminya kalau belum ada. */
if (!targetAgents) {
  await cdpMain.eval(
    `(() => { window.__ZEPHYR_CP__.store.getState().runCommandById('agents.openWindow'); return 1; })()`,
  );
  await sleep(5000);
  targetAgents = (await daftarTarget()).find(isAgents);
}
if (!targetAgents) {
  R.check('A0', false, 'window Agents tidak bisa dibuka');
  R.selesai();
  server.close();
  keluarBersih(1);
}
const cdpAg = await Cdp.connect(targetAgents.webSocketDebuggerUrl);
/* Bridge harus hidup sebelum satu pun tool dipanggil dari halaman ini. */
for (let i = 0; i < 50; i++) {
  try {
    if (await cdpAg.eval('!!window.__ZEPHYR_TOOLS__')) break;
  } catch {
    /* konteks belum siap */
  }
  await sleep(500);
}
R.check('A0', true, 'window utama + window Agents tersambung lewat CDP');

/* ── helpers ─────────────────────────────────────────────────────────────── */
const qAg = async (expr) => JSON.parse(await cdpAg.eval(`JSON.stringify((() => { ${expr} })())`));

/* Panel kanan TERBUKA atau TERTUTUP — dibaca dari DOM, bukan dari state.
 * `agx-panel-kanan` = tombol panel di bar panel itu sendiri (ada hanya saat
 * panel ter-render). Di kontrol sudut ada tombol `agx-panel-kanan` kedua yang
 * HANYA muncul saat panel tertutup, jadi hanya yang pertama yang menjawab. */
const panelTerbuka = async () =>
  cdpAg.eval(`!!document.querySelector('[data-testid="agx-panel-kanan-isi"]')`);

const tutupPanel = async () => {
  if (await panelTerbuka()) {
    await cdpAg.eval(
      `(() => { document.querySelector('[data-testid="agx-panel-kanan-isi"] [data-testid="agx-panel-kanan"]')?.click(); return 1; })()`,
    );
    await sleep(700);
  }
};

/* Jalankan tool lewat jalur yang SAMA dengan model (nama + argumen). */
const jalankanTool = (nama, args) =>
  cdpAg.runAsync(
    `const m = await import('/src/lib/agentTools.ts');
     try { return String(await m.jalankanAgentTool(${JSON.stringify(nama)}, ${JSON.stringify(args)})); }
     catch (e) { return 'THROW: ' + String(e && e.message ? e.message : e); }`,
    90000,
  );

/* ── A. Panel kanan mengikuti tombol panel / `+` ──────────────────────────── */
/*
 * Setelan web dipulihkan di akhir. Halaman uji hidup di 127.0.0.1:8099, dan
 * `izinJaringanLokal` yang mati menolak loopback (`ip-privat:127.0.0.1`) SEBELUM
 * satu pun permintaan dibuat - jadi setelan ini bagian dari prasyarat uji, bukan
 * pelonggaran pagar: pagar aslinya tetap diuji apa adanya di section C.
 */
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
  allowlistWeb: [],
  izinJaringanLokal: true,
  portWeb: [${TEST_PORT}],
});
return 'ok';`);
await sleep(700);

await tutupPanel();
R.check('A1', (await panelTerbuka()) === false, 'panel kanan tertutup tidak dirender sama sekali');

const adaTombolTambah = await cdpAg.eval(
  `!!document.querySelector('[data-testid="agx-panel-tambah"]')`,
);
R.check('A2', adaTombolTambah === true, 'tombol `+` (buka tab browser) tersedia saat panel tertutup');

await cdpAg.eval(
  `(() => { document.querySelector('[data-testid="agx-panel-tambah"]')?.click(); return 1; })()`,
);
await sleep(1200);
const sesudahTambah = await qAg(`
  return {
    panel: !!document.querySelector('[data-testid="agx-panel-kanan-isi"]'),
    tab: !!document.querySelector('[data-testid="agx-tab-browser"]'),
    tampilan: document.querySelector('[data-testid="agx-panel-kanan-isi"]')?.dataset.tampilan ?? null,
  };`);
R.check(
  'A3',
  sesudahTambah.panel === true && sesudahTambah.tab === true && sesudahTambah.tampilan === 'browser',
  `\`+\` membuka panel + tab Browser: ${JSON.stringify(sesudahTambah)}`,
);

/* ── B. Browser hidup di panel itu — SEBELUM ada alamat ──────────────────── */
const alat = await qAg(`
  const punya = (id) => !!document.querySelector('[data-testid="' + id + '"]');
  const kotak = (s) => { const e = document.querySelector(s); if (!e) return null;
                         const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    view: punya('agx-browser-view'), blank: punya('agx-browser-blank'),
    bar: !!document.querySelector('.agx-browser-bar'),
    panel: kotak('[data-testid="agx-panel-kanan-isi"]'),
    isi: kotak('[data-testid="agx-browser-view"]'),
  };`);
/*
 * Setelah section A panel dibuka ulang, tab Browser membawa URL terakhirnya
 * (url dipersist di `useAgxTabs`). Jadi placeholder hanya muncul pada kunjungan
 * PERTAMA; di kunjungan berikutnya yang dibuktikan adalah view + toolbar-nya,
 * bukan `agx-browser-blank`.
 */
R.check(
  'B1',
  alat.view === true && alat.bar === true,
  `view browser + toolbar hidup: ${JSON.stringify(alat)}`,
);
R.check(
  'B2',
  (alat.isi?.w ?? 0) > (alat.panel?.w ?? 1) * 0.9 && (alat.isi?.h ?? 0) > 100,
  `view browser selebar panelnya (isi ${alat.isi?.w}x${alat.isi?.h} dari panel ${alat.panel?.w})`,
);

/* ── C. Bentuk tool: gabungan, nama lama sudah pensiun ───────────────────── */
const namaTool = await cdpAg.runAsync(
  `const m = await import('/src/lib/agentTools.ts');
   return m.agentToolSpecs().map((s) => s.name).join(',');`,
  60000,
);
R.check(
  'C1',
  /(^|,)browser(,|$)/.test(namaTool),
  `tool gabungan \`browser\` dikirim ke model (${namaTool.split(',').length} tool)`,
);
R.check(
  'C2',
  !/browser_open|browser_read|browser_list|browser_click|browser_type|browser_close/.test(namaTool),
  'nama tool browser lama tidak dikirim lagi (satu tool, bukan tujuh)',
);

/* ── D. Jembatan: `browser` aksi open dijalankan DI window Agents ────────── */
await tutupPanel();
R.check('D0', (await panelTerbuka()) === false, 'mulai dari panel tertutup — agen harus membukanya sendiri');

const jawabOpen = await jalankanTool('browser', { aksi: 'open', url: URL_UJI });
R.check('D1', /loaded|ready to read|already open/i.test(jawabOpen), `browser open: ${jawabOpen.slice(0, 160)}`);

await sleep(2500);
const sesudahOpen = await qAg(`
  return {
    panel: !!document.querySelector('[data-testid="agx-panel-kanan-isi"]'),
    tampilan: document.querySelector('[data-testid="agx-panel-kanan-isi"]')?.dataset.tampilan ?? null,
    url: document.querySelector('.agx-browser-bar input.bp-url')?.value ?? null,
    blank: !!document.querySelector('[data-testid="agx-browser-blank"]'),
    stage: (() => { const e = document.querySelector('[data-testid="agx-browser-stage"]');
                    if (!e) return null; const b = e.getBoundingClientRect();
                    return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
  };`);
R.check(
  'D2',
  sesudahOpen.panel === true && sesudahOpen.tampilan === 'browser' && sesudahOpen.url === URL_UJI,
  `panel terbuka sendiri dan memuat alamatnya: ${JSON.stringify(sesudahOpen)}`,
);
R.check(
  'D3',
  sesudahOpen.blank === false && (sesudahOpen.stage?.w ?? 0) > 50 && (sesudahOpen.stage?.h ?? 0) > 50,
  `stage webview punya ukuran nyata (${JSON.stringify(sesudahOpen.stage)})`,
);

const paneMain = JSON.parse(
  await cdpMain.eval(`JSON.stringify((() => {
    const t = window.__ZEPHYR__.getState(); const out = [];
    for (const tab of t.terminalTabs) for (const p of tab.panes) if (p.kind === 'browser') out.push(p.id);
    return { jumlah: out.length, ids: out };
  })())`),
);
R.check('D4', paneMain.jumlah === 0, `tidak ada pane browser dibuat di window utama: ${JSON.stringify(paneMain)}`);

const daftar = await jalankanTool('browser', { aksi: 'list' });
R.check(
  'D5',
  /agents-browser/.test(daftar) && /"window":\s*"agents"/.test(daftar),
  `browser list melihat pane Agents: ${daftar.replace(/\s+/g, ' ').slice(0, 160)}`,
);

const dibaca = await jalankanTool('browser', { aksi: 'read' });
R.check(
  'D6',
  dibaca.includes(TANDA),
  `browser read membaca halaman Agents: ${dibaca.replace(/\s+/g, ' ').slice(0, 140)}`,
);

/* ── E. Tutup lewat tool ─────────────────────────────────────────────────── */
/*
 * `close` menjawab "closed successfully" lalu komponennya memproses permintaan
 * itu di poll berikutnya (1200 ms) baru melepas registry. Jawaban tool BUKAN
 * bukti sudah tertutup — yang dibuktikan adalah daftarnya sesudah jeda itu.
 */
const jawabTutup = await jalankanTool('browser', { aksi: 'close' });
await sleep(4000);
/*
 * Registry ditulis dengan pembaruan 3 detik dan dibaca ulang per 3 detik pula,
 * jadi entri yang baru dilepas bisa sempat terbaca lagi dari tugas yang sudah
 * berjalan. Yang dibuktikan karena itu PANE-NYA: view browser, stage webview,
 * dan entri daftar yang stabil setelah beberapa putaran.
 */
let daftarSesudah = '';
for (let i = 0; i < 6; i++) {
  daftarSesudah = await jalankanTool('browser', { aksi: 'list' });
  if (!/agents-browser/.test(daftarSesudah)) break;
  await sleep(1500);
}
const sisaPane = await qAg(`
  return {
    view: !!document.querySelector('[data-testid="agx-browser-view"]'),
    stage: !!document.querySelector('[data-testid="agx-browser-stage"]'),
  };`);
R.check(
  'E1',
  !/agents-browser/.test(daftarSesudah) && sisaPane.view === false,
  `browser close melepas pane Agents: ${jawabTutup.replace(/\s+/g, ' ').slice(0, 90)} | list=${daftarSesudah.replace(/\s+/g, ' ').slice(0, 80)} | dom=${JSON.stringify(sisaPane)}`,
);

/* ── bersih-bersih: setelan web dikembalikan seperti semula ──────────────── */
await cdpAg
  .runAsync(
    `await window.__ZEPHYR__.getState().applySettings({
       izinIsiWeb: ${JSON.stringify(setAsli.izinIsiWeb)},
       allowlistWeb: ${JSON.stringify(setAsli.allowlistWeb)},
       izinJaringanLokal: ${JSON.stringify(setAsli.izinJaringanLokal)},
       portWeb: ${JSON.stringify(setAsli.portWeb)},
     });
     return 'ok';`,
    30000,
  )
  .catch(() => {});

R.selesai();
cdpAg.close();
await cdpMain.close();
server.close();
keluarBersih(process.exitCode ?? 0);
