import { Cdp } from './lib-cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

console.log('  url           :', await cdp.eval('String(location.href)'));
console.log('  root children :', await cdp.eval('String(document.getElementById("root")?.children.length ?? -1)'));

await cdp.eval('window.__ZEPHYR__.getState().setActivity("tools")');
await new Promise((r) => setTimeout(r, 1200));
console.log('  setelah set   :', await cdp.eval('String(window.__ZEPHYR__.getState().activity)'));

await new Promise((r) => setTimeout(r, 3000));
console.log('  3s kemudian   :', await cdp.eval('String(window.__ZEPHYR__.getState().activity)'));
console.log('  tools-view    :', await cdp.eval('String(!!document.querySelector("[data-testid=\\"tools-view\\"]"))'));
console.log('  sidebar       :', await cdp.eval('String(!!document.querySelector("aside.sidebar"))'));

cdp.close();
