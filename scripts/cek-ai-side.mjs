import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Side chat: move the AI panel to the right column, then read the header back
 * off the DOM. Confirms the compact shape actually landed (icon buttons, no
 * wrapped rows) rather than only that the file compiled.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

console.log('  mount :', await cdp.eval('String(document.getElementById("root")?.children.length ?? -1)'));

const r = await cdp.runAsync(`
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await wait(1600);

  const zzPanel = q('[data-testid="ai-panel"]');
  const zzHead = q('.ai-head');
  const zzRight = q('.ai-head-right');
  const zzIkon = qa('.ai-ikon');

  return {
    pos: zzPanel?.getAttribute('data-pos') ?? null,
    headHeight: zzHead?.offsetHeight ?? -1,
    headRows: zzHead ? Math.round(zzHead.offsetHeight / 24) : -1,
    ikonJumlah: zzIkon.length,
    ikonLabel: zzIkon.map((b) => b.getAttribute('aria-label') ?? b.getAttribute('title') ?? '?'),
    ikonKotak: zzIkon.every((b) => b.offsetWidth === 24 && b.offsetHeight === 24),
    tombolTeks: qa('.ai-export').length,
    rightWidth: zzRight?.offsetWidth ?? -1,
    inputAda: !!q('[data-testid="ai-input"]'),
    sendAda: !!q('[data-testid="ai-send"]'),
    attachIkon: qa('.ai-attach svg, .ai-photo svg').length,
    panelWidth: zzPanel?.offsetWidth ?? -1,
  };
`, 40000);

console.log('  side chat:', JSON.stringify(r, null, 2));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-ai-side.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-ai-side.png');
}

cdp.close();
