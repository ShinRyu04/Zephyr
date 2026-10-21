import { Cdp } from './lib-cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('TIDAK BERLAKU: tidak ada halaman app.');
  process.exit(2);
}
const { cdp } = await Cdp.attach('9223', page.title);

if (process.argv.includes('--reload')) {
  await cdp.eval(`location.href = 'http://localhost:5173/'`);
  await new Promise((r) => setTimeout(r, 8000));
}

console.log('HREF:', await cdp.eval('location.href'));
console.log('BRIDGE:', await cdp.eval(`typeof window.__ZEPHYR_RUN__`));

cdp.close();
