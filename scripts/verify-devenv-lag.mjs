// verify-devenv-lag.mjs — A2 check: opening the DevEnv panel twice must run the
// backend scan ONCE. The store bridge reports the scan count, so this is not a
// timing guess.
//
// Usage: node scripts/verify-devenv-lag.mjs [port]
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const { cdp } = await Cdp.attach(PORT);

// Wrap the three IPC calls the store makes, so we count real scans.
const wrap = `
  const DV = window.__ZEPHYR_DEVENV__;
  if (!DV) return JSON.stringify({ err: 'no devenv bridge' });
  if (!window.__DV_COUNT__) {
    window.__DV_COUNT__ = { detect: 0, services: 0, projects: 0 };
    for (const k of ['detect', 'services', 'projects']) {
      const asli = DV[k];
      window['__DV_ASLI_' + k] = asli;
      DV[k] = (...a) => { window.__DV_COUNT__[k]++; return asli(...a); };
    }
  }
  window.__DV_COUNT__.detect = 0; window.__DV_COUNT__.services = 0; window.__DV_COUNT__.projects = 0;
  return JSON.stringify({ ok: true, sudahMuat: DV.state().sudahMuat });
`;
const w = await cdp.runAsync(wrap, 20000);
console.log('wrap:', w);

// 1) Force a cold scan (paksa) and count what it costs.
const cold = await cdp.runAsync(`
  const DV = window.__ZEPHYR_DEVENV__;
  window.__DV_COUNT__ = { detect: 0, services: 0, projects: 0 };
  const t = Date.now();
  await DV.muat(true);
  return JSON.stringify({ ms: Date.now() - t, calls: { ...window.__DV_COUNT__ } });
`, 120000);
console.log('cold scan:', cold);

// 2) Call muat() again with no change — must be a cache hit (0 calls).
const warm = await cdp.runAsync(`
  const DV = window.__ZEPHYR_DEVENV__;
  window.__DV_COUNT__ = { detect: 0, services: 0, projects: 0 };
  const t = Date.now();
  await DV.muat();
  return JSON.stringify({ ms: Date.now() - t, calls: { ...window.__DV_COUNT__ } });
`, 30000);
console.log('warm muat:', warm);

const w1 = JSON.parse(warm);
const total = w1.calls.detect + w1.calls.services + w1.calls.projects;
const lulus = total === 0 && w1.ms < 200;
console.log(`\nA2 cache: re-open cost ${w1.ms}ms, backend calls ${total} -> ${lulus ? 'LULUS' : 'GAGAL'}`);
await cdp.close();
process.exitCode = lulus ? 0 : 1;
