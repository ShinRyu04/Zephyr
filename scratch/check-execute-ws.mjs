import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) { console.log('CDP tidak ada'); keluarBersih(1); }
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    '/* Execute needs a workspace for most tools; Zephyr\'s own source is a valid one. */',
    'const { useStore } = await import("/src/lib/store.ts");',
    'const { useWs } = await import("/src/lib/workspaceStore.ts");',
    'await useWs.getState().muat();',
    'await useStore.getState().openWorkspace("D:\\\\Zephyr");',
    'await wait(2500);',
    'out.ws = useStore.getState().workspace;',
    'const panggil = async (args) => {',
    '  try { return String(await jalankanAgentTool("execute", args)); }',
    '  catch (e) { return "ERR: " + e.message; }',
    '};',
    '/* Two real tools, one script. */',
    'out.dua = await panggil({ skrip: \'const a = await call("glob", { pattern: "src/lib/zephyrTools/*.ts" }); const b = await call("grep", { pattern: "export const", path: "src/lib/zephyrTools/catalog.ts" }); return "glob=" + a.length + " grep=" + b.length;\' });',
    '/* A script that calls a disabled tool must stay refused. */',
    'out.asing = await panggil({ skrip: \'return await call("tidak_ada_tool", {});\' });',
    'return out;',
  ].join('\n'),
  240000,
);
console.log('workspace:', out.ws);
console.log('--- dua tool satu skrip ---');
console.log(String(out.dua).slice(0, 400));
console.log('--- tool asing ---');
console.log(String(out.asing).slice(0, 200));
keluarBersih(0);
