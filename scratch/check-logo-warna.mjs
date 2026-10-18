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
    'await wait(600);',
    'out.warna = Array.from(document.querySelectorAll("[data-agent]")).map((el) => {',
    '  const svg = el.querySelector("svg");',
    '  const path = el.querySelector("svg path");',
    '  return {',
    '    agent: el.getAttribute("data-agent"),',
    '    fill: path ? path.getAttribute("fill") : null,',
    '    resolved: path ? getComputedStyle(path).fill : null,',
    '    aria: svg ? svg.getAttribute("aria-label") : null,',
    '  };',
    '});',
    'return out;',
  ].join('\n'),
  60000,
);
console.log(JSON.stringify(out.warna, null, 2));
keluarBersih(0);
