import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');

  try { out.updateListener = v.state.facet(CV.EditorView.updateListener).length; }
  catch (e) { out.updateListenerErr = String(e).slice(0, 60); }

  try { out.decorations = v.state.facet(CV.EditorView.decorations).length; }
  catch (e) { out.decorationsErr = String(e).slice(0, 60); }

  try { out.domHandlers = v.state.facet(CV.EditorView.domEventHandlers).length; }
  catch (e) { out.domHandlersErr = String(e).slice(0, 60); }

  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
