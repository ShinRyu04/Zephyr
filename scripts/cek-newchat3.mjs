import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  st.setActivity('ai');
  await wait(1800);

  const b = q('[data-testid="ai-new-chat"]');
  out.ada = !!b;
  if (b) {
    const cs = getComputedStyle(b);
    out.btn = {
      color: cs.color,
      bg: cs.backgroundColor,
      border: cs.borderColor,
      fontSize: cs.fontSize,
      w: Math.round(b.getBoundingClientRect().width),
      text: b.textContent.trim(),
    };
    out.anak = [...b.children].map((c) => {
      const c2 = getComputedStyle(c);
      return {
        tag: c.tagName,
        cls: String(c.className).slice(0, 30),
        color: c2.color,
        w: Math.round(c.getBoundingClientRect().width),
      };
    });
  }
  // tombol lain di sidebar yang mungkin tidak terlihat
  out.semuaBtn = [...document.querySelectorAll('.side-panel button')].slice(0, 8).map((e) => {
    const cs = getComputedStyle(e);
    return {
      testid: e.getAttribute('data-testid'),
      text: e.textContent.trim().slice(0, 18),
      color: cs.color,
      bg: cs.backgroundColor,
    };
  });
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-sidebar-newchat.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
