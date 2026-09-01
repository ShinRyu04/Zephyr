// soak.mjs — uji stabilitas (V11 fase 04): app harus tetap hidup dan bebas
// error konsol selama N detik sambil dipakai (expand/collapse, buka file,
// search, watcher aktif). Default 180 detik.
//
// node scripts/soak.mjs [port] [detik]

import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.argv[2] ?? '9223';
const SECONDS = Number(process.argv[3] ?? 180);
const ROOT = String.raw`D:\Zephyr`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
if (!page) {
  console.error('app tidak berjalan');
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));

let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  const p = pending.get(m.id);
  if (p) {
    pending.delete(m.id);
    p(m);
  }
});
const ev = async (expr) => {
  const i = ++id;
  const res = await new Promise((r) => {
    pending.set(i, r);
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true },
      }),
    );
  });
  if (res.error) throw new Error(JSON.stringify(res.error));
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.exception?.description ?? 'exception');
  }
  return res.result?.result?.value;
};

await ev(`(() => {
  const s = window.__ZEPHYR__.getState();
  s.tabs.slice().forEach(t => s.forceCloseTab(t.id));
  window.__ZEPHYR_ERRORS__.length = 0;
  s.openWorkspace(${JSON.stringify(ROOT)});
  return 'siap';
})()`);
await sleep(1500);

const dirs = ['src', 'src-tauri', 'scripts', 'testfiles', 'src\\components', 'src\\lib'].map((d) =>
  path.join(ROOT, d),
);
const files = ['package.json', 'AGENTS.md', 'vite.config.ts', 'src\\App.tsx', 'src\\index.css'].map(
  (f) => path.join(ROOT, f),
);

const start = Date.now();
let cycles = 0;
const ramSamples = [];
const tmpFiles = [];

console.log(`# soak ${SECONDS}s dimulai`);

while ((Date.now() - start) / 1000 < SECONDS) {
  cycles++;

  // expand & collapse
  for (const d of dirs) {
    await ev(`(() => { window.__ZEPHYR_EX__.getState().toggleExpand(${JSON.stringify(d)}); return 1; })()`);
    await sleep(90);
  }
  await ev("(() => { window.__ZEPHYR_EX__.getState().collapseAll(); return 1; })()");

  // buka beberapa file lalu tutup
  for (const f of files) {
    await ev(`(() => { window.__ZEPHYR__.getState().openPath(${JSON.stringify(f)}); return 1; })()`);
    await sleep(160);
  }
  await ev(`(() => {
    const s = window.__ZEPHYR__.getState();
    s.tabs.slice(0, 3).forEach(t => s.forceCloseTab(t.id));
    return 1;
  })()`);

  // search
  await ev(`(() => {
    const ex = window.__ZEPHYR_EX__.getState();
    window.__ZEPHYR_EX__.setState({ query: ${JSON.stringify(['import', 'function', 'const', 'export'][cycles % 4])}, glob: '' });
    ex.runSearch();
    return 1;
  })()`);
  await sleep(1200);

  // aktivitas file dari luar (memicu watcher)
  const tmp = path.join(ROOT, 'testfiles', `soak-${cycles}.txt`);
  fs.writeFileSync(tmp, `siklus ${cycles}\n`);
  tmpFiles.push(tmp);
  await sleep(400);
  fs.rmSync(tmp, { force: true });

  const ram = await ev('window.__ZEPHYR__.getState().ramBytes');
  if (ram > 0) ramSamples.push(ram);

  const errs = JSON.parse(await ev('JSON.stringify(window.__ZEPHYR_ERRORS__)'));
  if (errs.length) {
    console.error(`GAGAL siklus ${cycles}: ${errs.slice(0, 3).join(' | ')}`);
    ws.close();
    process.exit(1);
  }

  const el = Math.round((Date.now() - start) / 1000);
  process.stdout.write(
    `\r  siklus ${cycles} | ${el}s | RAM ${(ram / 1048576).toFixed(0)} MB | tab ${await ev('window.__ZEPHYR__.getState().tabs.length')} | hasil ${await ev('window.__ZEPHYR_EX__.getState().hits.length')}   `,
  );
}

console.log('');
const final = JSON.parse(
  await ev(`JSON.stringify({
    errors: window.__ZEPHYR_ERRORS__,
    tabs: window.__ZEPHYR__.getState().tabs.length,
    ram: window.__ZEPHYR__.getState().ramBytes,
    rows: document.querySelectorAll('.tree-row').length,
    alive: !!document.querySelector('.app-root'),
  })`),
);
for (const f of tmpFiles) fs.rmSync(f, { force: true });
ws.close();

const min = Math.min(...ramSamples) / 1048576;
const max = Math.max(...ramSamples) / 1048576;
console.log(
  `hasil: ${cycles} siklus, RAM ${min.toFixed(0)}–${max.toFixed(0)} MB (akhir ${(final.ram / 1048576).toFixed(0)} MB), ` +
    `tab=${final.tabs}, baris tree=${final.rows}, DOM hidup=${final.alive}, error=${final.errors.length}`,
);
if (final.errors.length || !final.alive) process.exit(1);
console.log('SOAK LULUS');
