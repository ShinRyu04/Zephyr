import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  await wait(700);
  window.__ZEPHYR_PANEL__.focusTab('ai');
  await wait(1500);

  // tombol judul (chat name)
  const judul = q('[data-testid="ai-chat-name"]');
  if (judul) {
    const cs = getComputedStyle(judul);
    out.judul = {
      tag: judul.tagName,
      color: cs.color,
      text: judul.textContent.trim().slice(0, 30),
    };
  }
  // cari semua elemen bertuliskan "New chat"
  out.newChat = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && /new chat/i.test(e.textContent || ''))
    .map((e) => {
      const cs = getComputedStyle(e);
      const rc = e.getBoundingClientRect();
      return {
        tag: e.tagName,
        cls: String(e.className).slice(0, 40),
        testid: e.getAttribute('data-testid'),
        color: cs.color,
        opacity: cs.opacity,
        w: Math.round(rc.width),
        h: Math.round(rc.height),
        visible: rc.width > 0 && rc.height > 0,
      };
    });
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-newchat.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
