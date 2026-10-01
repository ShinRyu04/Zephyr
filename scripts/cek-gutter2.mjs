import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const BS = String.fromCharCode(92);
  window.__ZEPHYR__.getState().openWorkspace('D:' + BS + 'Zephyr');
  await wait(3500);
  out.ws = window.__ZEPHYR__.getState().workspace;

  // buka file yang panjang
  await window.__ZEPHYR__CMD__ ? null : null;
  try {
    window.__ZEPHYR_CMD__('file.open');
  } catch (e) { out.errCmd = String(e).slice(0, 80); }

  // pakai store langsung
  const st = window.__ZEPHYR__.getState();
  out.adaOpenPath = typeof st.openPath;
  out.adaOpenFile = typeof st.openFile;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
