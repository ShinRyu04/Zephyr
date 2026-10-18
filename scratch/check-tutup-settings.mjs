import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const PORT = '9223';
const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    '/* What actually closes Settings? Look for every plausible control. */',
    'const kandidat = Array.from(document.querySelectorAll("button, [role=\\"button\\"]"))',
    '  .map((b) => ({ testid: b.getAttribute("data-testid"), aria: b.getAttribute("aria-label"), txt: (b.textContent || "").trim().slice(0, 24) }))',
    '  .filter((b) => b.testid || b.aria);',
    'out.jumlahTombol = kandidat.length;',
    'out.tombolSettings = kandidat.filter((b) => /setting/i.test((b.testid || "") + (b.aria || "")));',
    'out.adaPanel = !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    '/* Try Escape, the usual way to close a modal. */',
    'document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
    'window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
    'await wait(700);',
    'out.setelahEscape = !!document.querySelector("[data-testid=\\"settings-page\\"]");',
    'return out;',
  ].join('\n'),
  120000,
);
console.log(JSON.stringify(out, null, 2));
keluarBersih(0);
