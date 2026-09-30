import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  out.viteErr = !!q('#vite-error-overlay');
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(500);
  A.newChat();
  await wait(500);
  // buka sidebar AI lewat activity bar
  const sb = q('[data-testid="ai-side-list"]');
  out.sidebarAda = !!sb;
  out.baris = qa('[data-testid^="ai-del-"]').length;

  // tombol hapus = ikon trash, opacity 0 default
  const d = q('[data-testid^="ai-del-"]');
  out.isSvg = d ? d.querySelector('svg') !== null : null;
  out.opacityDefault = d ? getComputedStyle(d).opacity : null;

  // meta berlabel
  const m = qa('.ai-side-meta').map(e => e.textContent.trim());
  out.meta = m.slice(0, 3);

  // tombol New chat pakai ikon?
  const nc = q('[data-testid="ai-new-chat"]');
  out.newChatIkon = nc ? !!nc.querySelector('svg') : null;
  out.newChatTeks = nc ? nc.textContent.trim() : null;

  // logo provider size
  const lg = q('.ai-side-btn svg, .ai-side-btn img');
  out.logoTag = lg ? lg.tagName : null;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-sidebar.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
