import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const settingsTampak = () => !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    'const tutup = () => { const x = document.querySelector("[data-testid=\\"settings-close\\"]"); if (x) x.click(); };',
    '',
    '/* Which nav item looks selected? Inspect the real attributes. */',
    'const navItems = Array.from(document.querySelectorAll("[data-testid^=\\"settings-nav-\\"]"));',
    'out.jumlahNav = navItems.length;',
    'out.contohNav = navItems.slice(0, 3).map((n) => ({ id: n.getAttribute("data-testid"), cls: n.className, cur: n.getAttribute("aria-current") }));',
    '',
    '/* Run each complaint and read the selected nav afterwards. */',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'const uji = async (niat) => {',
    '  tutup();',
    '  await wait(500);',
    '  await jalankanAgentTool("tunjuk", { niat });',
    '  await wait(900);',
    '  const on = Array.from(document.querySelectorAll("[data-testid^=\\"settings-nav-\\"]"))',
    '    .filter((n) => /is-active|is-on|active/.test(n.className) || n.getAttribute("aria-current") === "true")',
    '    .map((n) => n.getAttribute("data-testid"));',
    '  return { tampak: settingsTampak(), terpilih: on };',
    '};',
    'out.tema = await uji("cara ganti tema");',
    'out.agen = await uji("biar AI nggak boros token");',
    'out.mcp = await uji("di mana atur server mcp");',
    'out.asing = await uji("harga bitcoin hari ini");',
    'return out;',
  ].join('\n'),
  180000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
