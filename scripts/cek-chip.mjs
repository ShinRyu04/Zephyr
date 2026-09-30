import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(400);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const msg = {
    id: 'uji-chip',
    role: 'assistant',
    content: 'Sudah gua ubah.',
    tools: [
      { name: 'editor_write', args: '{"path":"src/lib/types.ts","content":"x"}', result: 'ok', ok: true, at: Date.now(), ms: 210 },
      { name: 'shell_exec', args: '{"command":"cargo test"}', result: 'ok', ok: true, at: Date.now(), ms: 4210 },
      { name: 'file_read', args: '{"path":"src/App.tsx"}', result: 'x', ok: true, at: Date.now(), ms: 88 }
    ],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(1500);
  const chip = qa('[data-testid="ai-file-chip"]');
  out.chipAda = chip.length;
  out.chipTeks = chip.map(e => e.textContent.trim());
  out.gripAda = qa('.ai-file-chip-grip').length;
  out.label = qa('.ai-toolrun-name').map(e => e.textContent.trim());
  out.ikonWarna = qa('.ai-toolrun-ikon').map(e => getComputedStyle(e).color);
  out.ikonIsi = qa('.ai-toolrun-ikon').map(e => e.textContent.trim());
  out.badge = qa('[data-testid="ai-toolrun-ms"]').map(e => e.textContent.trim());
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
