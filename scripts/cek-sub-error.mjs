import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SUB__;
  S.store.getState().bersihkan();
  await S.store.getState().jalankan(['Balas satu kata: TES']);
  const a = S.store.getState().agents[0];
  return { status: a?.status, error: a?.error, hasil: a?.hasil, nTool: a?.nTool, langkah: a?.langkah?.length };
})())`, 120000);
console.log(JSON.stringify(r, null, 1));
await cdp.close();
