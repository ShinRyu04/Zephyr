import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agents');
await c.eval(`location.hash = '#panel=agent-custom&s=conversations'`);
await new Promise((r) => setTimeout(r, 2500));
console.log(await c.eval(`location.href`));
c.close();
process.exit(0);
