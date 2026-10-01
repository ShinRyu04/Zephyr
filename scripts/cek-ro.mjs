import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const tab = st.tabs.find(t => t.id === st.activeTabId);
  out.tabPath = tab ? tab.path : null;
  out.tabReadOnly = tab ? tab.readOnly : null;
  out.tabKeys = tab ? Object.keys(tab).join(',') : null;
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  out.editable = v.contentDOM.getAttribute('contenteditable');
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
