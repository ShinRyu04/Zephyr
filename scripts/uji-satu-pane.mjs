/*
 * UJI SATU PANE BROWSER — keluhan: "dia selalu buka terminal pane baru tiap kali
 * buka, kalau bisa tetap satu".
 *
 * Tiga URL BERBEDA dibuka berturut-turut lewat tool `browser_open`. Lulus hanya
 * kalau:
 *   P1 jumlah pane browser tidak pernah lebih dari 1;
 *   P2 id pane yang dipakai SELALU sama (dipakai ulang, bukan dibuang-buat);
 *   P3 pane benar-benar PINDAH halaman (url di state = url terakhir);
 *   P4 `browser_read` tanpa pane_id membaca halaman TERAKHIR;
 *   P5 hanya satu pane tersisa di akhir.
 *
 * Jalankan: node scripts/uji-satu-pane.mjs 9223
 */
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const URLS = ['https://example.com', 'https://www.wikipedia.org', 'https://developer.mozilla.org/en-US/'];

const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
const hasil = [];
const gagal = [];
function cek(nama, lulus, detail) {
  hasil.push({ nama, lulus });
  if (!lulus) gagal.push(nama);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  — ' + detail : ''}`);
}

/** Snapshot pane browser dari store (bukan dari balasan tool). */
const snap = () =>
  cdp.json(`return JSON.stringify(await (async () => {
    const s = window.__ZEPHYR_TERM__.getState();
    const out = [];
    for (const t of s.terminalTabs) for (const p of t.panes) if (p.kind === 'browser') out.push({ id: p.id, url: p.url });
    return { jumlah: out.length, pane: out };
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
for (const p of awal.pane) {
  await cdp.json(
    `return JSON.stringify(await (async () => { await window.__ZEPHYR_TERM__.getState().closePane(${JSON.stringify(p.id)}); return 'ok'; })())`,
    30000,
  );
}
await sleep(1500);
const bersih = await snap();
console.log(`pane awal dibersihkan: ${awal.jumlah} -> ${bersih.jumlah}`);

const idsPakai = new Set();
let maksJumlah = 0;

for (const url of URLS) {
  const r = await jalankan('browser_open', { url });
  await sleep(2500);
  const s = await snap();
  maksJumlah = Math.max(maksJumlah, s.jumlah);
  for (const p of s.pane) idsPakai.add(p.id);
  console.log(`  ${url}\n    ok=${r.ok} balasan: ${String(r.hasil).slice(0, 180)}\n    pane: ${s.jumlah} ${JSON.stringify(s.pane)}`);
}

cek('P1 pane browser tidak pernah > 1', maksJumlah <= 1, `maksimum ${maksJumlah}`);
cek('P2 id pane selalu sama (dipakai ulang)', idsPakai.size === 1, `${idsPakai.size} id: ${[...idsPakai].join(', ')}`);

const akhir = await snap();
const urlTerakhir = akhir.pane[0]?.url ?? '';
cek('P3 pane pindah ke halaman terakhir', urlTerakhir.includes('developer.mozilla.org'), `url di state: ${urlTerakhir}`);

const baca = await jalankan('browser_read', {});
const teks = String(baca.hasil).toLowerCase();
const cocokAkhir = teks.includes('developer') || teks.includes('mozilla') || teks.includes('mdn');
cek('P4 browser_read tanpa pane_id membaca halaman terakhir', cocokAkhir, String(baca.hasil).replace(/\n/g, ' ').slice(0, 140));
cek('P5 hanya satu pane tersisa di akhir', akhir.jumlah === 1, `${akhir.jumlah}`);

console.log(`\nRINGKAS: ${hasil.length - gagal.length}/${hasil.length} lulus` + (gagal.length ? ` — gagal: ${gagal.join(', ')}` : ''));
await cdp.close();
process.exit(gagal.length ? 1 : 0);
