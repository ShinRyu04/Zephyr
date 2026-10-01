import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const tab = st.tabs.find(t => t.id === st.activeTabId);
  out.aktif = tab ? tab.path : null;
  out.jumlahTab = st.tabs.length;
  out.tabs = st.tabs.slice(0, 6).map(t => t.path.split(String.fromCharCode(92)).pop());

  // editor mana yang terlihat?
  const els = [...document.querySelectorAll('.cm-editor')];
  out.jumlahEditor = els.length;
  out.editor = els.map((el, i) => {
    const r2 = el.getBoundingClientRect();
    return { i, h: Math.round(r2.height), w: Math.round(r2.width), tampil: r2.height > 0 && r2.width > 0 };
  });
  out.zigDiEditorTampil = els.filter(e => e.getBoundingClientRect().height > 0)
    .reduce((n, e) => n + e.querySelectorAll('.cm-zig').length, 0);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
