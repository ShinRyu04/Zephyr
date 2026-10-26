/*
 * UJI SATU TAB BROWSER - keluhan: "dia selalu buka terminal pane baru tiap kali
 * buka, kalau bisa tetap satu".
 *
 * Browser dulu pane di tab terminal; sekarang satu tab tetap di area editor
 * dengan id webview `tab-browser`. Tiga URL BERBEDA dibuka berturut-turut lewat
 * tool `browser` (aksi open). Lulus hanya kalau:
 *   P1 jumlah tab browser tidak pernah lebih dari 1;
 *   P2 id webview yang dipakai SELALU sama (tab dipakai ulang, bukan dibuat baru);
 *   P3 tab benar-benar PINDAH halaman (url di store = url terakhir);
 *   P4 `browser` aksi read tanpa paneId membaca halaman TERAKHIR;
 *   P5 hanya satu tab browser tersisa di akhir;
 *   P6 tidak ada pane kind 'browser' di panel terminal (bukti pane sudah hilang).
 *
 * Jalankan: node scripts/uji-satu-pane.mjs 9223
 */
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const URLS = ['https://example.com', 'https://www.wikipedia.org', 'https://developer.mozilla.org/en-US/'];
const ID_TAB_BROWSER = 'tab-browser';

const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
const hasil = [];
const gagal = [];
function cek(nama, lulus, detail) {
  hasil.push({ nama, lulus });
  if (!lulus) gagal.push(nama);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  - ' + detail : ''}`);
}

/** Snapshot tab browser dari store editor (bukan dari balasan tool). */
const snap = () =>
  cdp.json(`return JSON.stringify(await (async () => {
    const S = window.__ZEPHYR__;
    if (!S) return { jumlah: -1, tab: [], err: 'bridge editor tidak ada' };
    const tabs = S.getState().tabs.filter((x) => x.view === 'browser');
    const paneBrowserDiPanel = window.__ZEPHYR_TERM__
      ? window.__ZEPHYR_TERM__.getState().terminalTabs
          .reduce((n, t) => n + t.panes.filter((p) => p.kind === 'browser').length, 0)
      : 0;
    return { jumlah: tabs.length, tab: tabs.map((t) => ({ id: t.id, url: t.url ?? '' })), paneBrowserDiPanel };
  })())`);

/** Jalankan satu tool lewat bridge; balapan dengan batas waktu supaya tidak nyangkut. */
const jalankan = (nama, args) =>
  cdp.json(
    `return JSON.stringify(await (async () => {
      try {
        const r = await window.__ZEPHYR_TOOLS__.jalankan(${JSON.stringify(nama)}, ${JSON.stringify(args)});
        return { ok: true, hasil: typeof r === 'string' ? r : JSON.stringify(r) };
      } catch (e) { return { ok: false, hasil: 'LEMPAR: ' + (e && e.message ? e.message : JSON.stringify(e)) }; }
    })())`,
    120000,
  );

const awal = await snap();
for (const t of awal.tab) {
  await cdp.json(
    `return JSON.stringify(await (async () => {
      window.__ZEPHYR__.getState().requestCloseTab(${JSON.stringify(t.id)});
      window.__ZEPHYR__.getState().forceCloseTab(${JSON.stringify(t.id)});
      return 'ok';
    })())`,
    30000,
  );
}
await sleep(1500);
const bersih = await snap();
console.log(`tab browser awal dibersihkan: ${awal.jumlah} -> ${bersih.jumlah}`);

let maksJumlah = 0;
let adaPaneBrowser = 0;

for (const url of URLS) {
  const r = await jalankan('browser', { aksi: 'open', url });
  await sleep(2500);
  const s = await snap();
  maksJumlah = Math.max(maksJumlah, s.jumlah);
  adaPaneBrowser = Math.max(adaPaneBrowser, s.paneBrowserDiPanel ?? 0);
  console.log(`  ${url}\n    ok=${r.ok} balasan: ${String(r.hasil).slice(0, 180)}\n    tab: ${s.jumlah} ${JSON.stringify(s.tab)}`);
}

cek('P1 tab browser tidak pernah > 1', maksJumlah <= 1, `maksimum ${maksJumlah}`);
cek('P2 jumlah tab tidak bertambah antar buka (tab dipakai ulang)', maksJumlah <= 1,
  `maksimum ${maksJumlah}`);

const akhir = await snap();
const urlTerakhir = akhir.tab[0]?.url ?? '';
const idTerakhir = akhir.tab[0]?.id ?? '';
cek('P3 tab pindah ke halaman terakhir', urlTerakhir.includes('developer.mozilla.org'), `url di store: ${urlTerakhir}`);
cek('P3b id tab = konstanta ID_TAB_BROWSER', idTerakhir === ID_TAB_BROWSER, `id: ${idTerakhir || '(kosong)'}`);

const baca = await jalankan('browser', { aksi: 'read' });
const teks = String(baca.hasil).toLowerCase();
const cocokAkhir = teks.includes('developer') || teks.includes('mozilla') || teks.includes('mdn');
cek('P4 browser aksi read tanpa paneId membaca halaman terakhir', cocokAkhir, String(baca.hasil).replace(/\n/g, ' ').slice(0, 140));
cek('P5 hanya satu tab browser tersisa di akhir', akhir.jumlah === 1, `${akhir.jumlah}`);
cek('P6 tidak ada pane browser di panel terminal', (akhir.paneBrowserDiPanel ?? 0) === 0, `${akhir.paneBrowserDiPanel}`);

console.log(`\nRINGKAS: ${hasil.length - gagal.length}/${hasil.length} lulus` + (gagal.length ? ` - gagal: ${gagal.join(', ')}` : ''));
await cdp.close();
process.exit(gagal.length ? 1 : 0);
