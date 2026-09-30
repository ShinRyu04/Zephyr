import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');

// Measure the real cost of opening the panel: how many backend calls fire, and
// how long each takes. "Laggy when clicking" is almost always this.
const r = await cdp.runAsync(
  `
  const STZ = window.__ZEPHYR__;
  const DV = window.__ZEPHYR_DEVENV__;
  const ukur = async (nama, fn) => {
    const t0 = Date.now();
    try { await fn(); return { nama, ms: Date.now() - t0, ok: true }; }
    catch (e) { return { nama, ms: Date.now() - t0, ok: false }; }
  };

  const hasil = [];
  for (let i = 0; i < 3; i++) {
    hasil.push(await ukur('detect #' + (i + 1), () => DV.detect({})));
  }
  for (let i = 0; i < 2; i++) {
    hasil.push(await ukur('services #' + (i + 1), () => DV.services('D:\\\\DevEnv')));
    hasil.push(await ukur('projects #' + (i + 1), () => DV.projects('D:\\\\DevEnv', '.test')));
  }

  // And what a full open costs, start to finish.
  const t0 = Date.now();
  STZ.getState().setActivity('explorer');
  await wait(400);
  STZ.getState().setActivity('devenv');
  for (let i = 0; i < 40; i++) {
    await wait(100);
    if (document.querySelector('[data-testid="dv-runtimes"]')) break;
  }
  const bukaMs = Date.now() - t0;

  return JSON.stringify({ hasil, bukaMs }, null, 1);
`,
  240000,
);

console.log(r);
await cdp.close();
