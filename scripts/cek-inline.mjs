import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BT = String.fromCharCode(96);
  const A = window.__ZEPHYR_AI__.store.getState();
  A.newChat();
  await wait(400);
  const id = window.__ZEPHYR_AI__.store.getState().activeId;
  const isi = 'Pakai ' + BT + 'useMemo' + BT + ' biar ga recompute. File ' + BT + 'src/lib/aiStore.ts:42' + BT + ' sudah diubah.';
  window.__ZEPHYR_AI__.store.setState((s) => ({
    sessions: s.sessions.map(x => x.id === id ? Object.assign({}, x, { messages: [{ id: 'uji-inline', role: 'assistant', content: isi }] }) : x),
  }));
  await wait(1400);
  const i = qa('.ai-inline');
  out.inlineAda = i.length;
  out.inlineTeks = i.map(e => e.textContent.trim());
  const ref = qa('[data-testid="ai-file-ref"]');
  out.fileRefAda = ref.length;
  out.fileRefTeks = ref.map(e => e.textContent.trim());
  if (i[0]) {
    const c = getComputedStyle(i[0]);
    out.inlineBg = c.backgroundColor;
    out.inlineFont = c.fontFamily.slice(0, 24);
    out.inlineBorder = c.borderTopWidth;
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
