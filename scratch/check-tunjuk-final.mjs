import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* Toggle through the activity bar button - the app\'s own control. */',
    'const gear = document.querySelector("[data-testid=\\"ab-settings\\"]");',
    'out.adaGear = !!gear;',
    'const tampak = () => !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    'out.awal = tampak();',
    'gear.click();',
    'await wait(800);',
    'out.setelahKlik1 = tampak();',
    'gear.click();',
    'await wait(800);',
    'out.setelahKlik2 = tampak();',
    '/* Now: closed state -> run the tool -> did it open? */',
    'if (tampak()) { gear.click(); await wait(800); }',
    'out.sebelumTool = tampak();',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    'await wait(1000);',
    'out.setelahToolTema = tampak();',
    '/* And the unknown complaint must leave it CLOSED. */',
    'if (tampak()) { gear.click(); await wait(800); }',
    'out.sebelumAsing = tampak();',
    'await jalankanAgentTool("tunjuk", { niat: "harga bitcoin hari ini" });',
    'await wait(1000);',
    'out.setelahToolAsing = tampak();',
    'return out;',
  ].join('\n'),
  180000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
