import { Cdp } from './lib-cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('TIDAK BERLAKU: tidak ada halaman app.');
  process.exit(2);
}
const { cdp } = await Cdp.attach('9223', page.title);

const ev = (expr) => cdp.eval(expr);
const js = (body, ms = 120000) => cdp.json(body, ms);

if (process.argv.includes('--reload')) {
  await ev(`location.href = 'http://localhost:5173/'`);
  await new Promise((r) => setTimeout(r, 9000));
}

console.log(
  'TOOLS:',
  await js(`return JSON.stringify(await window.__ZEPHYR_RUN__.tools(['g++','gcc','java','go','rustc','python','dart']))`),
);

/** Open the file in the editor so the store's active tab points at it. */
async function buka(path) {
  await js(`await window.__ZEPHYR__.getState().openPath(${JSON.stringify(path)}); return 1`);
}

/** Start a run and wait for a terminal status. */
async function jalankan(label) {
  const r = await js(`return JSON.stringify(await (async () => {
    const R = window.__ZEPHYR_RUN__;
    const ok = await R.jalankan();
    if (!ok) return { ok: false, status: R.state().status, error: R.state().error };
    const batas = Date.now() + 90000;
    while (Date.now() < batas) {
      const s = R.state();
      if (s.status !== 'running') {
        return {
          ok: true,
          status: s.status,
          exitCode: s.exitCode,
          error: s.error,
          path: s.path,
          recipe: s.recipe && s.recipe.label,
          jumlahBaris: s.lines,
          output: s.runId ? window.__ZEPHYR_RUN__.output() : null,
        };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: true, status: 'TIMEOUT', output: window.__ZEPHYR_RUN__.output() };
  })())`, 120000);
  console.log(`RUN ${label}:`, r);
  return r;
}

const target = process.argv.find((a) => a.startsWith('--file='))?.slice(7);
if (target) {
  await buka(target);
  await jalankan(target);
}

cdp.close();
