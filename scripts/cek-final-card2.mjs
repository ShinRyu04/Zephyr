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
    id: 'uji-final', role: 'assistant', content: 'Oke, sudah gua cek.',
    tools: [{ name: 'shell_exec', args: '{"command":"git status --porcelain"}',
              result: ' M src/App.tsx', ok: true, at: Date.now(), ms: 412 }],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(1500);
  out.labelHeader = qa('.ai-toolrun-args').map(e => e.textContent.trim());
  const t = q('[data-testid="ai-toolrun-toggle"]');
  if (t) { t.click(); await wait(700); }
  out.label = qa('.ai-toolrun-sec-label').map(e => e.textContent.trim());

  // apakah tombol aksi bisa diklik (tidak ketimun composer)?
  const btn = q('[data-testid="ai-toolrun-copy"]');
  out.btnAda = !!btn;
  if (btn) {
    const rc = btn.getBoundingClientRect();
    const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    out.btnBisaDiklik = !!(el && (el === btn || btn.contains(el)));
    out.btnY = Math.round(rc.top);
    out.panelH = Math.round((q('[data-testid="ai-panel"]') || {getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-toolcard2.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
