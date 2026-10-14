/**
 * uji-pane-dingin.mjs — uji "start dingin": buka 3 halaman lewat browser_open
 * tepat setelah aplikasi dinyalakan, dan pastikan pane browser tetap SATU
 * (id sama) serta setiap halaman benar-benar bisa dibaca.
 *
 * Kenapa uji ini ada: pada run nyata (agen disuruh cari kurs lewat Google tepat
 * setelah aplikasi di-restart) `browser_open` melaporkan "page loaded, ready to
 * read" padahal webview-nya belum terdaftar - `browser_read` berikutnya gagal
 * "browser pane not found", lalu browser_open berikutnya membuang pane lama dan
 * membuat pane BARU (id berubah). Uji ini menirukan kondisi itu.
 *
 *   node scripts/uji-pane-dingin.mjs [port]      (default 9223)
 * Launcher: scripts/_run-dingin.bat
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';
import { spawnSync } from 'child_process';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('pane browser start DINGIN: 3 halaman, tetap 1 pane');

/* 1. Nyalakan ulang aplikasi supaya benar-benar start dingin. */
console.log('     restart zephyr...');
spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Process zephyr -ErrorAction SilentlyContinue | Stop-Process -Force'], { stdio: 'ignore' });
await sleep(2500);
spawnSync('cmd', ['/c', 'start', '', 'D:\\Zephyr\\scripts\\_dev-zephyr.vbs'], { stdio: 'ignore' });

let siap = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const r = spawnSync('curl', ['-s', '--max-time', '2', `http://127.0.0.1:${PORT}/json/version`], { encoding: 'utf8' });
  if (r.stdout && r.stdout.includes('Browser')) { siap = true; console.log(`     9223 siap setelah ${i + 1}s`); break; }
}
if (!siap) { console.log('     GAGAL: CDP tidak pernah siap'); process.exit(2); }

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/* 2. Tunggu tool bridge muncul, TANPA memberi jeda tambahan: justru kondisi
      "baru bangun" inilah yang diuji. */
for (let i = 0; i < 60; i++) {
  const ada = await cdp.json(`return JSON.stringify(String(typeof window.__ZEPHYR_TOOLS__))`).catch(() => null);
  if (ada === 'object') break;
  await sleep(500);
}
console.log('     bridge siap, langsung mulai');

const paneList = `JSON.stringify((() => {
  const out = [];
  for (const t of window.__ZEPHYR_TERM__.getState().terminalTabs) for (const p of t.panes) if (p.kind === 'browser') out.push(p.id);
  return out;
})())`;

/* 3. Bersihkan pane browser sisa (menutup pane tidak diuji di sini). */
const awal = await cdp.json(`return ${paneList}`);
for (const id of awal) {
  await cdp.json(`return JSON.stringify(await (async () => { await window.__ZEPHYR_TERM__.getState().closePane(${JSON.stringify(id)}); return 'ok'; })())`);
}

const URLA = [
  'https://example.com',
  'https://www.wikipedia.org',
  'https://developer.mozilla.org/en-US/',
];
const ids = new Set();
let maksPane = 0;
const balasan = [];
const panjangBaca = [];

for (const [i, url] of URLA.entries()) {
  const balas = await cdp.json(
    `return JSON.stringify(await (async () => {
      const T = window.__ZEPHYR_TOOLS__;
      const r = await T.jalankan('browser_open', { url: ${JSON.stringify(url)} });
      return String(r && r.content !== undefined ? r.content : r);
    })())`,
    60000,
  );
  balasan.push(String(balas).slice(0, 200));

  const sekarang = await cdp.json(`return ${paneList}`);
  maksPane = Math.max(maksPane, sekarang.length);
  for (const id of sekarang) ids.add(id);

  const teks = await cdp.json(
    `return JSON.stringify(await (async () => {
      const T = window.__ZEPHYR_TOOLS__;
      const r = await T.jalankan('browser_read', {});
      return String(r && r.content !== undefined ? r.content : r);
    })())`,
    60000,
  );
  panjangBaca.push(String(teks).length);
  console.log(`     [${i + 1}] ${url}`);
  console.log(`         open : ${balasan[i]}`);
  console.log(`         read : ${panjangBaca[i]} char, pane=${sekarang.length} ${sekarang.join(',')}`);
}

const akhir = await cdp.json(`return ${paneList}`);
console.log(`     pane: maksimum ${maksPane}, id unik ${ids.size} (${[...ids].join(', ')}), akhir ${akhir.length}`);

R.check('D1', maksPane <= 1, `pane browser tidak pernah > 1 (maksimum ${maksPane})`);
R.check('D2', ids.size === 1, `selalu satu id pane (${ids.size} id: ${[...ids].join(', ')})`);
R.check('D3', balasan.slice(1).every((b) => /reused|already open/i.test(b)), `buka ke-2 & ke-3 memakai ulang pane: ${balasan.slice(1).map((b) => (/reused/i.test(b) ? 'reused' : /already open/i.test(b) ? 'already' : 'PANEBARU')).join(', ')}`);
R.check('D4', panjangBaca.every((n) => n > 300), `setiap halaman benar-benar terbaca (char: ${panjangBaca.join(', ')})`);
R.check('D5', akhir.length === 1, `tepat satu pane tersisa di akhir (${akhir.length})`);

await cdp.close();
R.selesai();
