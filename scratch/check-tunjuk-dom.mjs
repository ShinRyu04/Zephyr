import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

/*
 * `tunjuk` must be judged by the DOM, not by a store.
 *
 * Importing `store.ts` from CDP creates a SECOND module instance with its own
 * zustand state. An earlier probe read that copy, saw `settingsOpen: false`, and
 * reported the tool broken - while the real UI was fine. The reverse is equally
 * possible: a write to that copy succeeds and the UI never moves. So the only
 * trustworthy evidence is what is on screen.
 */
const out = await cdp.runAsync(
  [
    'const out = {};',
    'const settingsTampak = () => !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    '',
    '/* Start from a closed Settings: click the close control if it is open. */',
    'out.awal = settingsTampak();',
    'if (out.awal) {',
    '  const x = document.querySelector("[data-testid=\\"settings-close\\"]");',
    '  if (x) x.click();',
    '  await wait(600);',
    '}',
    'out.setelahTutup = settingsTampak();',
    '',
    '/* Run the tool through the agent table - the same entry the model calls. */',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'try {',
    '  out.balas = await jalankanAgentTool("tunjuk", { niat: "cara ganti tema" });',
    '} catch (e) { out.balas = "ERR " + e.message; }',
    'await wait(900);',
    '',
    'out.setelahTool = settingsTampak();',
    '/* Which section is on screen? Read the selected nav item, not the store. */',
    'const aktif = document.querySelector("[data-testid^=\\"settings-nav-\\"][aria-current=\\"true\\"], .settings-nav-item.is-active, .set-nav-item.is-on");',
    'out.seksiTampak = aktif ? (aktif.getAttribute("data-testid") || aktif.textContent.trim()) : null;',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
