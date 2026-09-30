import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('extensions'); await wait(1500);
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1500); }
  return qa('[data-ext-card]').slice(0, 30).map(c => {
    const el = c.querySelector('[data-ikon]');
    if (!el) return { tanpaIkon: true };
    const svg = el.querySelector('svg');
    return {
      id: el.getAttribute('data-ikon'),
      dari: el.getAttribute('data-dari'),
      style: el.getAttribute('style') || '',
      adaSvg: !!svg,
      isi: svg ? svg.innerHTML.slice(0, 90) : null,
    };
  });
`);
console.log(JSON.stringify(r, null, 1));
