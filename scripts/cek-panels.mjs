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
  window.__ZEPHYR__.getState().setVisible(true);
  await wait(600);

  // --- TERMINAL ---
  st.setActivity('terminal');
  await wait(1400);
  out.term = {
    shell: !!q('[data-testid="tp-new-shell"]'),
    private: !!q('[data-testid="tp-new-private"]'),
    toggle: !!q('[data-testid="tp-toggle-panel"]'),
    shellIkon: !!q('[data-testid="tp-new-shell"] svg'),
    agents: qa('[data-testid^="tp-agent-"]').length,
    subtitle: qa('.tp-subtitle').map(e => e.textContent.trim()),
    summary: (q('[data-testid="tp-summary"]') || {}).textContent || null,
  };
  const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('D:/Zephyr/shot-panel-term.png', Buffer.from(sh.result.data, 'base64'));
  cdp.close();
`, 90000);
console.log(JSON.stringify(r, null, 1));
