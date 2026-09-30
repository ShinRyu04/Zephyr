import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
import { writeFileSync } from 'node:fs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  if (st.workspace !== 'D:' + String.fromCharCode(92) + 'Zephyr') {
    st.openWorkspace('D:' + String.fromCharCode(92) + 'Zephyr');
    await wait(3500);
  }
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  await wait(700);

  st.setActivity('terminal');
  await wait(1500);
  out.term = {
    shell: !!q('[data-testid="tp-new-shell"]'),
    private: !!q('[data-testid="tp-new-private"]'),
    shellIkon: !!q('[data-testid="tp-new-shell"] svg'),
    agents: qa('[data-testid^="tp-agent-"]').length,
    subtitle: qa('.tp-subtitle').map((e) => e.textContent.trim()),
    summary: (q('[data-testid="tp-summary"]') || {}).textContent || null,
  };
  return out;
`, 90000);
console.log('TERMINAL:', JSON.stringify(r, null, 1));
let sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-panel-term.png', Buffer.from(sh.result.data, 'base64'));

const r2 = await cdp.runAsync(`
  const out = {};
  window.__ZEPHYR__.getState().setActivity('debug');
  await wait(1500);
  out.dbg = {
    view: !!q('[data-testid="debug-view"]'),
    section: qa('[data-testid^="dbg-sec-"]').map((e) => e.dataset.dbgSec),
    judul: qa('.dbg-sec-judul, .dbg-sec-head').map((e) => e.textContent.trim()).slice(0, 6),
    config: !!q('[data-testid="dbg-config"]'),
    start: !!q('[data-testid="dbg-start"]'),
    status: (q('[data-testid="dbg-status"]') || {}).textContent || null,
  };
  return out;
`, 90000);
console.log('DEBUG:', JSON.stringify(r2, null, 1));
sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-panel-debug.png', Buffer.from(sh.result.data, 'base64'));

const r3 = await cdp.runAsync(`
  const out = {};
  window.__ZEPHYR__.getState().setActivity('extensions');
  await wait(2000);
  out.ext = {
    view: !!q('[data-testid^="xv-"]'),
    tabs: qa('[role="tab"]').map((e) => e.textContent.trim()),
    aktif: qa('[role="tab"][aria-selected="true"]').map((e) => e.textContent.trim()),
    kartu: qa('[data-testid^="xv-card"], .xv-card').length,
    search: !!q('input[placeholder*="Search" i]'),
  };
  return out;
`, 90000);
console.log('EXT:', JSON.stringify(r3, null, 1));
sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-panel-ext.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
