import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(600);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const msg = {
    id: 'uji-final', role: 'assistant', content: 'Oke, sudah gua cek.',
    tools: [{ name: 'shell_exec', args: '{"command":"git status --porcelain"}',
              result: ' M src/App.tsx' + BS + 'n M src/index.css', ok: true, at: Date.now(), ms: 412 }],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(800);

  // paksa panel AI terlihat + tab AI aktif
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  await wait(500);
  window.__ZEPHYR_PANEL__.focusTab('ai');
  await wait(1200);

  out.panelAda = !!q('[data-testid="ai-panel"]');
  out.tabAktif = (q('[data-testid="panel-tab"][aria-selected="true"]') || {}).textContent || null;
  out.kartuAda = qa('[data-testid="ai-toolrun-toggle"]').length;

  const t = q('[data-testid="ai-toolrun-toggle"]');
  if (t) { t.click(); await wait(800); }

  out.labelHeader = qa('.ai-toolrun-args').map(e => e.textContent.trim());
  out.label = qa('.ai-toolrun-sec-label').map(e => e.textContent.trim());
  out.inAda = !!q('[data-testid="ai-toolrun-in"]');
  out.outAda = !!q('[data-testid="ai-toolrun-out"]');

  const btn = q('[data-testid="ai-toolrun-copy"]');
  out.btnAda = !!btn;
  if (btn) {
    const rc = btn.getBoundingClientRect();
    const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    out.btnBisaDiklik = !!(el && (el === btn || btn.contains(el)));
    out.btnY = Math.round(rc.top);
  }
  const p = q('[data-testid="ai-panel"]');
  if (p) {
    const pr = p.getBoundingClientRect();
    out.panel = Math.round(pr.width) + 'x' + Math.round(pr.height) + ' @' + Math.round(pr.left);
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync('D:/Zephyr/shot-toolcard3.png', Buffer.from(sh.result.data, 'base64'));
cdp.close();
