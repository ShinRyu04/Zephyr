import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) {
  console.log('CDP target tidak ada');
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { agentToolSpecs } = await import("/src/lib/agentTools.ts");',
    'const specs = agentToolSpecs();',
    'out.jumlah = specs.length;',
    'out.nama = specs.map((s) => s.name).sort();',
    '/* The consolidated names must be present; the old ones must not. */',
    'out.adaBrowser = out.nama.includes("browser");',
    'out.adaWeb = out.nama.includes("web");',
    'out.adaLsp = out.nama.includes("lsp");',
    'out.adaApplyPatch = out.nama.includes("apply_patch");',
    'out.adaTunjuk = out.nama.includes("tunjuk");',
    'out.lamaTersisa = out.nama.filter((n) => /^(browser_|web_search$|web_fetch$|lsp_)/.test(n));',
    '/* Unknown action must be refused, not silently accepted. */',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'try { await jalankanAgentTool("browser", { aksi: "melayang" }); out.aksiAsing = "(diterima - SALAH)"; }',
    'catch (e) { out.aksiAsing = e.message.slice(0, 80); }',
    'return out;',
  ].join('\n'),
  120000,
);
console.log('jumlah tool terkirim:', out.jumlah);
console.log('browser:', out.adaBrowser, '| web:', out.adaWeb, '| lsp:', out.adaLsp, '| apply_patch:', out.adaApplyPatch, '| tunjuk:', out.adaTunjuk);
console.log('nama lama tersisa:', JSON.stringify(out.lamaTersisa));
console.log('aksi asing:', out.aksiAsing);
console.log('semua nama:', out.nama.join(', '));
keluarBersih(0);
