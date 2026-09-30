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
  await wait(600);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const msg = {
    id: 'uji-card', role: 'assistant', content: 'Sudah gua jalanin.',
    tools: [{ name: 'shell_exec', args: '{"command":"git status --porcelain"}',
              result: ' M src/App.tsx', ok: true, at: Date.now(), ms: 412 }],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(1500);

  const t = q('[data-testid="ai-toolrun-toggle"]');
  out.toggleAda = !!t;
  if (t) { t.click(); await wait(700); }

  out.inAda = !!q('[data-testid="ai-toolrun-in"]');
  out.outAda = !!q('[data-testid="ai-toolrun-out"]');
  out.label = qa('.ai-toolrun-sec-label').map(e => e.textContent.trim());
  out.btnCopy = !!q('[data-testid="ai-toolrun-copy"]');
  out.btnCopyIn = !!q('[data-testid="ai-toolrun-copy-in"]');
  out.btnOpen = !!q('[data-testid="ai-toolrun-open"]');
  out.isiIn = (q('[data-testid="ai-toolrun-in"]') || {}).textContent || '';
  out.isiOut = (q('[data-testid="ai-toolrun-out"]') || {}).textContent || '';
  const pre = q('[data-testid="ai-toolrun-out"]');
  if (pre) out.bgOut = getComputedStyle(pre).backgroundColor;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-toolcard.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
