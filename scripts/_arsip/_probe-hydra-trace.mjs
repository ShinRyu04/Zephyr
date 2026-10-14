/* dump jejak diagnostik hydra (framing waktu) */
import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223');
const out = await cdp.json(`
  const tr = (globalThis.__HYDRA_TRACE__ ?? []).slice(-40);
  return JSON.stringify({ jumlah: (globalThis.__HYDRA_TRACE__ ?? []).length, tr });
`, 60000);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
