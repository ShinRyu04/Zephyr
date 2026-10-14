// Probe: kenapa toggle ekstensi menulis disk tapi UI tidak berubah?
//
// V11 di verify08.mjs mematikan lang-rust: settings di disk benar (7 tersisa),
// tapi aria-checked tombol switch-nya tetap "true". Di sini kita jalankan
// toggle yang sama lewat store, catat galatnya, lalu refresh() KEDUA KALI untuk
// memisahkan dua kemungkinan: (a) balapan/urutan (refresh pertama jalan sebelum
// tulis selesai -> refresh kedua membaik), atau (b) extensions_list memang
// mengembalikan daftar basi (refresh kedua pun tak berubah).
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const { cdp } = await Cdp.attach(PORT, 'Zephyr');

const R = [];

const j = (expr) => cdp.json(`return JSON.stringify(await (async () => { ${expr} })())`);

const ringkas = (list) => {
  const b = list.filter((e) => e.builtin).map((e) => `${e.id}=${e.enabled}`);
  return b.join(' ');
};
const ariaRust = () =>
  `(document.querySelector('[data-testid="ext-lang-rust"]')?.getAttribute('aria-checked') ?? 'TIDAK-ADA')`;

// 0) keadaan awal
const awal = await j(`
  const E = window.__ZEPHYR_EXT__;
  await E.refresh();
  return {
    list: E.list().filter(e => e.builtin).map(e => [e.id, e.enabled]),
    aria: ${ariaRust()},
    enabled: window.__ZEPHYR__.getState().settings?.extensions?.enabled ?? null,
  };
`);
R.push(`AWAL    enabled-dari-store=[${awal.enabled}] aria=${awal.aria}`);
R.push(`        list: ${ringkas(awal.list.map(([id, en]) => ({ builtin: true, id, enabled: en })))}`);

// 1) toggle lewat store, tangkap galat apa adanya (jangan ditelan void)
const t1 = await j(`
  const E = window.__ZEPHYR_EXT__;
  let err = null;
  try { await E.toggle('lang-rust', false); } catch (e) { err = E.asErr(e)?.message ?? String(e); }
  return { err, info: E.info(), extErr: E.error(), aria: ${ariaRust()} };
`);
R.push(`TOGGLE  err=${t1.err} info="${t1.info}" extErr=${t1.extErr}`);
R.push(`        list sesudah toggle: ${ringkas(await j(`return { list: window.__ZEPHYR_EXT__.list() }`).then((r) => r.list))}`);
R.push(`        aria sesudah toggle: ${t1.aria}`);

// 2) refresh manual (kedua kalinya) TANPA menyentuh settings lagi
const t2 = await j(`
  const E = window.__ZEPHYR_EXT__;
  let err = null;
  try { await E.refresh(); } catch (e) { err = E.asErr(e)?.message ?? String(e); }
  return {
    err,
    list: E.list().filter(e => e.builtin).map(e => [e.id, e.enabled]),
    aria: ${ariaRust()},
    enabled: window.__ZEPHYR__.getState().settings?.extensions?.enabled ?? null,
  };
`);
R.push(`REFRESH2 err=${t2.err} enabled-dari-store=[${t2.enabled}] aria=${t2.aria}`);
R.push(`        list: ${ringkas(t2.list.map(([id, en]) => ({ builtin: true, id, enabled: en })))}`);

// 3) kembalikan ke semula (semua aktif) supaya probe tidak meninggalkan app termodifikasi
const t3 = await j(`
  const E = window.__ZEPHYR_EXT__;
  let err = null;
  try { await E.toggle('lang-rust', true); } catch (e) { err = E.asErr(e)?.message ?? String(e); }
  return { err, aria: ${ariaRust()} };
`);
R.push(`PULIH   err=${t3.err} aria=${t3.aria}`);

console.log(R.join('\n'));
await cdp.close();
process.exit(0);
