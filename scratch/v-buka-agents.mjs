import * as Cdp from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.Cdp.attach(9223, ['Zephyr']);
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentsWindow.ts');
  await m.bukaAgentsWindow();
  return { ok: true };
})())`);
console.log(JSON.stringify(r));
await new Promise((x) => setTimeout(x, 4000));
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log(targets.filter((t) => t.type === 'page').map((t) => `${t.title} :: ${t.url}`).join('\n'));
cdp.close();
