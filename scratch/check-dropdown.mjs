import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const btn = document.querySelector("[data-testid=\\"term-picker\\"]");',
    'if (btn) btn.click();',
    'await wait(500);',
    'const items = Array.from(document.querySelectorAll("[data-agent]")).map(el => ({',
    '  agent: el.getAttribute("data-agent"),',
    '  text: el.textContent.trim(),',
    '  hasSvg: !!el.querySelector("svg"),',
    '}));',
    'out.dropdownAgents = items;',
    'return out;',
  ].join('\n'),
  60000,
);
console.log('TERMINAL DROPDOWN AGENTS:');
console.log(JSON.stringify(out.dropdownAgents, null, 2));
keluarBersih(0);
