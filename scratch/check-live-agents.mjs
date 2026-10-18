import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'for (let i = 0; i < 30; i++) {',
    '  if (typeof PTY !== "undefined" && PTY && typeof PTY.agents === "function") break;',
    '  await wait(300);',
    '}',
    'out.agents = await PTY.agents();',
    'return out;',
  ].join('\n'),
  60000,
);
console.log('LIVE AGENTS DI ZEPHYR:');
console.log(JSON.stringify(out.agents, null, 2));
keluarBersih(0);
