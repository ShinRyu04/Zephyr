import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const uji = ['1+1', "(() => 'ok')()", "await (async () => 'ok')()", 'JSON.stringify({a:1})'];
for (const e of uji) {
  try {
    const r = await cdp.runAsync('return JSON.stringify(await (' + e + '))', 20000);
    console.log('OK   ', e.slice(0, 40), '=>', r);
  } catch (err) {
    console.log('GAGAL', e.slice(0, 40), '=>', String(err).slice(0, 140));
  }
}
process.exit(0);
