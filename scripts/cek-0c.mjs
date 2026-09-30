import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(400);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const msg = {
    id: 'uji-ms',
    role: 'assistant',
    content: 'Selesai. File ' + String.fromCharCode(96) + 'src/lib/types.ts' + String.fromCharCode(96) + ' sudah diubah.',
    tools: [
      { name: 'shell_exec', args: '{"command":"ls -la src"}', result: 'src/', ok: true, at: Date.now(), ms: 837 },
      { name: 'file_read', args: '{"path":"D:/Zephyr/package.json"}', result: '{}', ok: true, at: Date.now(), ms: 1420 },
      { name: 'tanpa_ms', args: '{}', result: 'x', ok: true, at: Date.now() }
    ],
  };
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: x.messages.concat([msg]) }) : x),
  }));
  await wait(1400);

  const ms = qa('[data-testid="ai-toolrun-ms"]');
  out.jumlahBadge = ms.length;
  out.teksBadge = ms.map(e => e.textContent.trim());
  out.jumlahTool = qa('[data-testid="ai-toolrun-toggle"]').length;
  out.inlineAda = qa('.ai-inline').length;
  out.inlineTeks = qa('.ai-inline').map(e => e.textContent.trim());
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
