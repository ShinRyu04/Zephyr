import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

/*
 * The APP's own store, reached the way the app itself reaches it.
 *
 * Importing `store.ts` from CDP creates a SECOND module instance with its own
 * zustand state - measured: writing `setActivity` there left the real UI at
 * "explorer". So this probe drives the DOM instead, which is the only surface
 * that cannot lie.
 */
const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* 1. Close Settings through the real UI first. */',
    'const tutup = document.querySelector("[data-testid=\\"settings-close\\"]") ||',
    '  Array.from(document.querySelectorAll("button")).find((b) => /close|tutup/i.test(b.getAttribute("aria-label") || ""));',
    'out.adaTombolTutup = !!tutup;',
    'if (tutup) tutup.click();',
    'await wait(500);',
    'out.settingsTerlihatSetelahTutup = !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    '',
    '/* 2. Open it again by clicking the activity bar item, like a reader would. */',
    'const gear = Array.from(document.querySelectorAll("button, [role=\\"tab\\"]")).find((b) =>',
    '  /settings|setelan/i.test((b.getAttribute("aria-label") || "") + (b.getAttribute("title") || "")),',
    ');',
    'out.adaGear = !!gear;',
    'if (gear) gear.click();',
    'await wait(700);',
    'out.settingsTerlihatSetelahGear = !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
