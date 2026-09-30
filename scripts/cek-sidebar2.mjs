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
  window.__ZEPHYR_AI__.store.getState().newChat();
  await wait(500);

  // pindah activity bar ke AI supaya sidebar-nya tampil
  window.__ZEPHYR__.getState().setActivity('ai');
  await wait(1200);

  out.sidebarAda = !!q('[data-testid="ai-side-list"]');
  out.baris = qa('[data-testid^="ai-del-"]').length;

  const d = q('[data-testid^="ai-del-"]');
  out.isSvg = d ? d.querySelector('svg') !== null : null;
  out.opacityDefault = d ? getComputedStyle(d).opacity : null;
  out.teksHapus = d ? d.textContent.trim() : null;

  out.meta = qa('.ai-side-meta').map(e => e.textContent.trim()).slice(0, 3);

  const nc = q('[data-testid="ai-new-chat"]');
  out.newChatIkon = nc ? !!nc.querySelector('svg') : null;
  out.newChatTeks = nc ? nc.textContent.trim() : null;

  // prompt preview: judul dari pesan pertama
  out.judul = qa('.ai-side-title').map(e => e.textContent.trim()).slice(0, 3);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-sidebar.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
