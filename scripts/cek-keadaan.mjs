// cek-keadaan.mjs — intip keadaan app (workspace, model, provider, approval).
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
cdp.snapshot = null;
const info = await cdp.json(`return JSON.stringify((() => {
  const z = window.__ZEPHYR__?.getState?.() ?? null;
  const A = window.__ZEPHYR_AI__?.store?.getState?.() ?? null;
  return {
    workspace: z?.workspace ?? null,
    model: A?.model ?? null,
    provider: A?.provider ?? null,
    approvalMode: A?.approvalMode ?? null,
    modelKeys: A ? Object.keys(A).filter(k => /model|provider|approv/i.test(k)) : null,
  };
})())`);
console.log(JSON.stringify(info, null, 2));
await cdp.close();
