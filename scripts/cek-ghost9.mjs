import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  /*
   * Exercise the ghost pipeline through the module's own public surface:
   * dispatch setGhost via a keymap-free path is not exported, so instead
   * simulate what mintaSaran does — dispatch the effect and see if the
   * decoration lands in the DOM.
   */
  const CV = await import('/node_modules/.vite/deps/@codemirror_view.js?v=d1ad1012');

  // Apakah ada decoration yang punya widget GhostWidget?
  const decos = v.state.facet(CV.EditorView.decorations);
  out.jumlahDeco = decos.length;

  // Cek AI panel: apakah listener ai-chunk dipasang?
  out.aiListenerBound = window.__ZEPHYR_AI__ ? 'ada store' : 'tidak';

  // Cek aiChat command tersedia
  out.aiChatAda = typeof window.__ZEPHYR_AI__.store.getState().send === 'function';

  // Cek setting provider baseUrl
  const st = window.__ZEPHYR__.getState();
  const p = st.settings.models.providers || {};
  out.customBase = p.custom ? p.custom.baseUrl : null;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
