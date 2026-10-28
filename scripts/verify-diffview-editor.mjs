/*
 * Bukti: DiffView di area editor (jendela utama) mengisi editor dan BISA discroll.
 *
 *   D1  tab diff-view setinggi area editor (bukan setinggi isi)
 *   D2  `.dv` mengisi tab dan tidak meluber keluar host
 *   D3  daftar berkas + pane diff tampil berdampingan
 *   D4  isi diff punya penggulir sendiri dan benar-benar bisa digulir
 *
 * Dijalankan terhadap diff sintetis 200 baris yang dibuat lalu dibuang lagi
 * (tidak menyentuh berkas user).
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const list = async () => (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter((t) => t.type === 'page');
const main = (await list()).find((t) => !(t.url ?? '').includes('from=') && !(t.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(main.webSocketDebuggerUrl);

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const hasil = await J(`await (async () => {
  const st = window.__ZEPHYR_DIFF__.store.getState();
  const path = 'D:/uji/verify-diffview-demo-' + Date.now().toString(36) + '.ts';
  const lama = Array.from({ length: 200 }, (_, i) => 'baris lama ' + i);
  const baru = lama.map((t, i) => (i % 7 === 0 ? t + '  // diubah AI' : t));
  baru.splice(50, 0, 'baris tambahan dari AI');
  st.catatSebelum(path, lama.join('\\n'));
  st.catatSesudah(path, baru.join('\\n'), false);
  S.getState().bukaViewAi('diff-view');
  await wait(1500);
  const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), bottom: Math.round(b.bottom) }; };
  const host = rect('.editor-host');
  const tab = rect('[data-testid="ai-view-tab-diff-view"]');
  const dv = rect('[data-testid="diffview"]');
  const isi = document.querySelector('[data-testid="diffview-isi"]');
  const out = {
    host, tab, dv,
    daftar: rect('[data-testid="diffview-daftar"]'),
    pane: rect('[data-testid="diffview-pane"]'),
    berkas: document.querySelectorAll('[data-testid="diffview-berkas"]').length,
    baris: document.querySelectorAll('.dv-baris').length,
    meluber: !!(dv && host && dv.bottom > host.bottom + 1),
    scroll: isi ? {
      bisaScroll: isi.scrollHeight > isi.clientHeight + 8,
      overflowY: getComputedStyle(isi).overflowY,
      clientH: isi.clientHeight,
    } : null,
  };
  if (isi) { isi.scrollTop = 99999; await wait(250); out.scroll.setelah = Math.round(isi.scrollTop); out.scroll.tinggiMaks = Math.max(0, isi.scrollHeight - isi.clientHeight); }
  /* bersihkan */
  st.buang(path);
  S.getState().bukaViewAi(null);
  await wait(400);
  return out;
})()`);

cdp.close();
console.log(JSON.stringify(hasil, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek(
  'D1 tab diff-view setinggi area editor',
  !!hasil.host && !!hasil.tab && Math.abs(hasil.tab.h - hasil.host.h) <= 2,
  `tab=${hasil.tab?.h} host=${hasil.host?.h}`,
);
cek(
  'D2 .dv mengisi tab dan tidak meluber',
  !!hasil.dv && Math.abs(hasil.dv.h - hasil.tab.h) <= 2 && hasil.meluber === false,
  `dv=${hasil.dv?.h} tab=${hasil.tab?.h} meluber=${hasil.meluber}`,
);
cek(
  'D3 daftar berkas + pane diff tampil berdampingan',
  (hasil.berkas ?? 0) >= 1 && !!hasil.daftar && !!hasil.pane && hasil.daftar.x < hasil.pane.x,
  `berkas=${hasil.berkas} baris=${hasil.baris}`,
);
cek(
  'D4 isi diff bisa digulir sampai bawah',
  hasil.scroll?.bisaScroll === true && hasil.scroll?.overflowY === 'auto' && (hasil.scroll?.setelah ?? 0) >= (hasil.scroll?.tinggiMaks ?? 1) - 2,
  `clientH=${hasil.scroll?.clientH} scrollTop=${hasil.scroll?.setelah}/${hasil.scroll?.tinggiMaks}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);