// cek-aserr13.mjs — what does the thrown value actually look like?
//
// The bridge exposes asErr and verify13 now calls it, yet the message is still
// "null". Inspect the raw rejection so the conversion can be matched to it.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const XX = window.__ZEPHYR_EXT19__;
  const out = { adaAsErr: typeof XX.asErr };

  // Pastikan ekstensi besar terdaftar dulu.
  try { await XX.refresh(); } catch (e) { out.refreshErr = String(e).slice(0, 80); }

  const daftar = XX.terpasang().map((e) => e.id);
  out.terdaftar = daftar;

  try {
    await XX.rusak('zephyr-kebesaran-test');
    out.sukses = true;
  } catch (e) {
    out.errTipe = typeof e;
    out.errNull = e === null;
    out.errUndefined = e === undefined;
    if (e && typeof e === 'object') out.errKunci = Object.keys(e);
    out.errString = String(e).slice(0, 160);
    out.errJSON = (() => { try { return JSON.stringify(e); } catch { return 'tidak bisa di-JSON'; } })();
    try {
      const konv = XX.asErr(e);
      out.konv = { code: konv?.code, message: konv?.message?.slice(0, 160) };
    } catch (err) {
      out.konvErr = String(err).slice(0, 120);
    }
  }
  return JSON.stringify(out);
`,
  90000,
);
console.log(r);
await cdp.close();
