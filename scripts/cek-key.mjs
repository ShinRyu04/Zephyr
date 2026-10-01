import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
const r = await cdp.json(`return JSON.stringify(await (async () => {
  const X = window.__ZEPHYR_AI__;
  const hasil = {};
  // Cek kondisi awal
  hasil.adaKeyAwal = X.store.getState().hasKey('gemini');
  // Set key
  await X.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
  await new Promise(r => setTimeout(r, 800));
  // Cek lagi
  hasil.adaKeySetelah = X.store.getState().hasKey('gemini');
  // Cek langsung ke Rust
  try {
    hasil.keysRust = await window.__TAURI_INTERNALS__.invoke('get_public_models');
  } catch (e) { hasil.keysRustError = String(e).slice(0, 120); }
  return hasil;
})())`, 60000);
console.log(JSON.stringify(r, null, 1).slice(0, 1200));
await cdp.close();
