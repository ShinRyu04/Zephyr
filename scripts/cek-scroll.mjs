import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(
  `
  const st = window.__ZEPHYR__.getState();
  const BS = String.fromCharCode(92);
  if (st.workspace !== 'D:' + BS + 'Zephyr') {
    st.openWorkspace('D:' + BS + 'Zephyr'); await wait(4000);
  }
  st.setActivity('extensions'); await wait(1600);
  const t = q('[data-testid="ext-tab-marketplace"]');
  if (t) { t.click(); await wait(1800); }

  // cari semua elemen yang punya scrollbar aktif
  const out = [];
  for (const el of qa('*')) {
    if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 40) {
      const cs = getComputedStyle(el);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
        const rc = el.getBoundingClientRect();
        out.push({
          cls: el.className.toString().slice(0, 40),
          w: Math.round(rc.width),
          sch: el.scrollHeight,
          clh: el.clientHeight,
          warna: cs.scrollbarColor,
          sw: cs.scrollbarWidth,
          bg: getComputedStyle(el, '::-webkit-scrollbar').backgroundColor,
        });
      }
    }
  }
  // tab overflow?
  const tabs = q('.xv-tabs');
  const tb = tabs ? tabs.getBoundingClientRect() : null;
  const tk = [...qa('.xv-tab')].map(e => {
    const r = e.getBoundingClientRect();
    return { teks: e.textContent.trim().slice(0, 22), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
  });
  return { scroll: out.slice(0, 6), tabsBox: tb ? { l: Math.round(tb.left), r: Math.round(tb.right) } : null, tk };
`,
  90000,
);
console.log(JSON.stringify(r, null, 1));
cdp.close();
