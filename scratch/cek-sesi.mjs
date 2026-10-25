import { Cdp } from '../scripts/lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && !(t.url ?? '').includes('#'));
const { cdp } = await Cdp.attach('9223', page.title);
console.log(await cdp.eval(`JSON.stringify((window.__ZEPHYR_AI__ ? 'ada-bridge' : 'tanpa-bridge'))`));
console.log(await cdp.eval(`JSON.stringify((() => {
  const st = window.__ZEPHYR_AI__?.store?.getState?.();
  if (!st) return { err: 'no ai bridge' };
  return {
    aktif: st.activeIds,
    sesi: st.sessions.map(s => ({ id: s.id, judul: s.title, n: s.messages.length })),
  };
})())`));
