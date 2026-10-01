import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(`return JSON.stringify(await (async () => {
  // Panggil command Rust langsung lewat invoke internal Tauri.
  const w = window;
  const hasil = {};
  // Cari jalur invoke yang tersedia di WebView2 Tauri v2.
  hasil.adaTauri = typeof w.__TAURI__;
  hasil.adaTauriInternals = typeof w.__TAURI_INTERNALS__;
  if (w.__TAURI_INTERNALS__?.invoke) {
    try {
      hasil.invoke = await w.__TAURI_INTERNALS__.invoke('cli_agents_detect');
    } catch (e) { hasil.invokeError = String(e).slice(0, 300); }
  }
  return hasil;
})())`);
console.log(JSON.stringify(r, null, 1).slice(0, 1800));
await cdp.close();
