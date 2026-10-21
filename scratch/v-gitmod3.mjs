import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && !t.url.includes('#'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const nilai = await cdp.eval(
  `import('/src/lib/commands.ts')
     .then(m => m.gitStatus())
     .then(r => 'OK ' + JSON.stringify(r).slice(0, 120))
     .catch(e => 'ERR ' + (e && (e.message || e.code) ? (e.message || e.code) : JSON.stringify(e)))`,
  40000,
);
console.log('async=' + JSON.stringify(nilai));
const sinkron = await cdp.eval(
  `JSON.stringify(window.__ZEPHYR_GIT__.status())`,
  20000,
);
console.log('sinkron=' + sinkron);
cdp.close();
