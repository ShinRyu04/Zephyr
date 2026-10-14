/**
 * _probe-eval.mjs - periksa MENTAH jalur browser_pane_eval: apakah webview pane
 * benar-benar bisa di-eval dari halaman utama, dan apa pesan error aslinya.
 *
 *   node scripts/_probe-eval.mjs 9223 http://localhost:5173
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const URL_UJI = process.argv[3] ?? 'http://localhost:5173';
const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const info = await cdp.json(`return JSON.stringify({
  tauri: typeof window.__TAURI__,
  kunciTauri: window.__TAURI__ ? Object.keys(window.__TAURI__) : null,
  core: window.__TAURI__ && window.__TAURI__.core ? Object.keys(window.__TAURI__.core) : null,
  bridge: typeof window.__ZEPHYR_TOOLS__,
})`);
console.log('info bridge:', info);

const buka = await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser_open', { url: ${JSON.stringify(URL_UJI)} }))`);
console.log('browser_open ->', buka);
await new Promise((s) => setTimeout(s, 4000));

/* Daftar pane + id-nya. */
const panes = await cdp.json(`return JSON.stringify((() => {
  const t = window.__ZEPHYR_TERMINAL__ ? window.__ZEPHYR_TERMINAL__.getState() : null;
  if (!t) return 'bridge terminal tidak ada';
  const keluar = [];
  for (const tab of t.terminalTabs) for (const p of tab.panes) keluar.push({ id: p.id, kind: p.kind, url: p.url, visible: p.visible });
  return keluar;
})())`);
console.log('pane:', panes);

const paneId = (() => {
  try {
    const arr = JSON.parse(panes);
    if (!Array.isArray(arr)) return null;
    const cocok = arr.find((p) => String(p.url ?? '').includes('localhost:5173')) ?? arr.find((p) => p.kind === 'browser');
    return cocok ? cocok.id : null;
  } catch { return null; }
})();
console.log('paneId dipakai:', paneId);

if (paneId) {
  const hasil = await cdp.json(`return JSON.stringify(await (async () => {
    const keluar = {};
    try {
      keluar.eval_title = await window.__TAURI__.core.invoke('browser_pane_eval', { paneId: ${JSON.stringify(paneId)}, js: 'document.title' });
    } catch (e) { keluar.eval_title_err = String(e && e.message || e); }
    try {
      keluar.eval_teks = await window.__TAURI__.core.invoke('browser_pane_eval', { paneId: ${JSON.stringify(paneId)}, js: 'document.body ? document.body.innerText.slice(0,200) : "(no body)"' });
    } catch (e) { keluar.eval_teks_err = String(e && e.message || e); }
    try {
      keluar.info = await window.__TAURI__.core.invoke('browser_pane_info', { paneId: ${JSON.stringify(paneId)} });
    } catch (e) { keluar.info_err = String(e && e.message || e); }
    try {
      keluar.info_lain = await window.__TAURI__.core.invoke('browser_pane_info', { paneId: 'salah-id' });
    } catch (e) { keluar.info_lain_err = String(e && e.message || e); }
    keluar.baca_tool = await window.__ZEPHYR_TOOLS__.jalankan('browser_read', {});
    return keluar;
  })())`);
  console.log('hasil eval:', hasil);
}

await cdp.close();
