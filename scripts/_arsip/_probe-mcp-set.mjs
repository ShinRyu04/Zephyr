
import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify({
  setelan: window.__ZEPHYR__.getState().settings.mcp,
  batas: window.__ZEPHYR_AI__.mcpBatas(),
  bawaan: window.__ZEPHYR_AI__.batasToolPerServer(),
  ringkas: window.__ZEPHYR_AI__.mcpRingkas().length,
})`);
console.log(JSON.stringify(r));
await cdp.close();
