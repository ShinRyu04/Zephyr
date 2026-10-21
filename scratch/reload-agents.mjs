import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
await a.eval(`location.reload()`);
a.close();
await new Promise((r) => setTimeout(r, 6000));
console.log('reloaded');
process.exit(0);
