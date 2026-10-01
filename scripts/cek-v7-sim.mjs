// cek-v7-sim.mjs — reproduce V7's exact sequence.
//
// asErr works on the bridge and returns the right message, yet V7 still prints
// "null". Run the same statements in order to find which one produces it.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const X = window.__ZEPHYR_EXT__;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};

  await X.refresh();
  await wait(500);
  const info = X.list().find(e => e.id === 'zephyr-kebesaran-test');
  out.infoAda = !!info;
  out.infoErr = info?.error ?? null;

  let pesan = null;
  try {
    await X.loadRaw('zephyr-kebesaran-test');
    out.loadSukses = true;
  } catch (e) {
    out.errTipe = typeof e;
    out.errNull = e === null;
    out.errString = String(e).slice(0, 120);
    pesan = X.asErr(e)?.message ?? String(e);
  }
  out.pesan = pesan;

  await X.toggle('zephyr-kebesaran-test', true);
  await wait(600);
  const setelah = X.list().find(e => e.id === 'zephyr-kebesaran-test');
  out.enabledSetelah = setelah?.enabled ?? null;
  out.errorSetelah = setelah?.error ?? null;
  out.bytes = setelah?.mainBytes ?? null;
  return JSON.stringify(out);
`,
  90000,
);
console.log(r);
await cdp.close();
