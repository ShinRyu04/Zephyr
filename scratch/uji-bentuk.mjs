import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
/* Uji setiap bentuk yang dipakai skrip, satu per satu. */
const kasus = [
  ['objek', '({ nilai: 1 })'],
  ['iife', "(() => 'ok')()"],
  ['async', "await (async () => 'ok')()"],
  ['objek-nested', '({ a: window.__ZEPHYR__ ? 1 : 0 })'],
];
for (const [nama, expr] of kasus) {
  try {
    const r = await cdp.runAsync('return JSON.stringify(await (' + expr + '))', 20000);
    console.log('OK   ', nama, '=>', String(r).slice(0, 60));
  } catch (e) {
    console.log('GAGAL', nama, '=>', String(e).slice(0, 160));
  }
}
process.exit(0);
