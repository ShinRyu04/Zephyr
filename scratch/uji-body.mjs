import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

const kasus = [
  ['polos', 'return JSON.stringify(1+1)'],
  ['await-iife', "return JSON.stringify(await (async () => 'ok')())"],
  ['await-di-dalam-iife', "return JSON.stringify((() => 'ok')())"],
  ['await-nested', "return JSON.stringify(await (async () => (await (async () => 'x')()))())"],
];

for (const [nama, body] of kasus) {
  try {
    const r = await cdp.runAsync(body, 15000);
    console.log('OK   ', nama, '=>', String(r).slice(0, 50));
  } catch (e) {
    console.log('GAGAL', nama, '=>', String(e).slice(0, 110));
  }
}
process.exit(0);
