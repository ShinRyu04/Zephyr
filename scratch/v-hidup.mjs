import * as Cdp from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.Cdp.attach(9223, 'Zephyr');
console.log('judul   :', await cdp.eval('document.title', 10000));
console.log('root    :', await cdp.eval(`!!document.querySelector('[data-testid="activity-bar"]') + '|' + (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 120)`, 15000));
console.log('galat   :', await cdp.eval(`(window.__ZEPHYR_GALAT__ || []).join(' | ').slice(0, 200) || 'tidak ada'`, 15000));
await cdp.close();
