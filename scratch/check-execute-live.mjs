import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) { console.log('CDP tidak ada'); keluarBersih(1); }
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { jalankanAgentTool, agentToolSpecs } = await import("/src/lib/agentTools.ts");',
    'out.jumlah = agentToolSpecs().length;',
    'out.nama = agentToolSpecs().map((s) => s.name).sort();',
    'const panggil = async (args) => {',
    '  try { return String(await jalankanAgentTool("execute", args)); }',
    '  catch (e) { return "ERR: " + e.message; }',
    '};',
    '/* 1. Skrip nyata: dua tool dalam satu panggilan. */',
    'out.dua = await panggil({ skrip: \'const a = await call("glob", { pattern: "src/lib/zephyrTools/*.ts" }); const b = await call("read_file", { path: "package.json" }); return "glob:" + a.length + " pkg:" + b.length;\' });',
    '/* 2. Escape yang harus ditolak. */',
    'out.window = await panggil({ skrip: "return window.location.href;" });',
    'out.fetch = await panggil({ skrip: "return await fetch(\\"https://example.com\\");" });',
    'out.import = await panggil({ skrip: "const m = await import(\\"fs\\"); return 1;" });',
    '/* 3. Tool yang tidak ada tetap ditolak dari dalam skrip. */',
    'out.asing = await panggil({ skrip: \'return await call("tool_yang_tidak_ada", {});\' });',
    'return out;',
  ].join('\n'),
  180000,
);
console.log('tool terkirim:', out.jumlah);
console.log('ada execute:', out.nama.includes('execute'), '| ada kotak:', out.nama.includes('kotak'), '| ada peta:', out.nama.includes('peta'));
console.log('--- dua tool satu skrip ---');
console.log(String(out.dua).slice(0, 300));
console.log('--- window ---'); console.log(String(out.window).slice(0, 140));
console.log('--- fetch ---'); console.log(String(out.fetch).slice(0, 140));
console.log('--- import ---'); console.log(String(out.import).slice(0, 140));
console.log('--- tool asing ---'); console.log(String(out.asing).slice(0, 160));
keluarBersih(0);
