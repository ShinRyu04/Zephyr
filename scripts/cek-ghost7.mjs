import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  // cek updateListener terpasang: hitung facet
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');
  const CPS = await import('/node_modules/.vite/deps/@codemirror_state.js?v=d1ad1012');
  out.updateListenerCount = v.state.facet(CV.EditorView.updateListener).length;
  out.domEventHandlerCount = v.state.facet(CV.EditorView.domEventHandlers).length;
  out.decorationCount = v.state.facet(CV.EditorView.decorations).length;

  // cek state field ghost ada?
  out.fields = "skip";
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
