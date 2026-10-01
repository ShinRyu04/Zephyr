// cek-aserr13b.mjs — test asErr on the bridge verify13 actually uses.
//
// verify13 reads window.__ZEPHYR_EXT__, not __ZEPHYR_EXT19__. Check that the
// conversion exists there and what it returns for a real invoke rejection.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const XX = window.__ZEPHYR_EXT__;
  const out = { adaAsErr: typeof XX.asErr, kunci: Object.keys(XX).slice(0, 12) };

  // Panggil command Rust langsung supaya error asli terlihat.
  try {
    const hasil = await XX.loadRaw('zephyr-kebesaran-test');
    out.sukses = true;
    out.hasilTipe = typeof hasil;
  } catch (e) {
    out.errTipe = typeof e;
    out.errNull = e === null;
    out.errString = String(e).slice(0, 160);
    if (e && typeof e === 'object') out.errKunci = Object.keys(e);
    out.errJSON = (() => { try { return JSON.stringify(e).slice(0, 160); } catch { return 'gagal JSON'; } })();
    try {
      const k = XX.asErr(e);
      out.konvCode = k?.code ?? null;
      out.konvMsg = k?.message?.slice(0, 160) ?? null;
    } catch (err) {
      out.konvErr = String(err).slice(0, 100);
    }
  }
  return JSON.stringify(out);
`,
  90000,
);
console.log(r);
await cdp.close();
