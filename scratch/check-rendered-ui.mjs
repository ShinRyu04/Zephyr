import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const tabs = Array.from(document.querySelectorAll(".ai-host-tab")).map(el => el.textContent.trim());',
    'out.aiHostTabs = tabs;',
    'const sideAgents = Array.from(document.querySelectorAll(".tp-agent-name")).map(el => el.textContent.trim());',
    'out.sideAgents = sideAgents;',
    'return out;',
  ].join('\n'),
  60000,
);
console.log('AI HOST TABS DI KANAN:');
console.log(out.aiHostTabs);
console.log('SIDEBAR AGENTS:');
console.log(out.sideAgents);
keluarBersih(0);
