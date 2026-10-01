import { Cdp, sleep } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223');

await cdp.eval(`(() => {
  window.__ujiHasil = 'jalan';
  (async () => {
    const hasil = {};
    try {
      const evi = window.__TAURI_EVENT_PLUGIN_INTERNALS__;
      hasil.adaEvtInternals = !!evi;
      hasil.kunci = evi ? Object.keys(evi) : null;
      hasil.tipe = evi ? Object.getOwnPropertyNames(Object.getPrototypeOf(evi)).slice(0, 20) : null;
      // Coba baca daftar listener yang terdaftar.
      hasil.listeners = evi && evi.listeners ? Object.keys(evi.listeners) : null;
    } catch (e) { hasil.err = String(e).slice(0, 300); }
    window.__ujiHasil = JSON.stringify(hasil, null, 1);
  })();
  return 'mulai';
})()`);
await sleep(1200);
console.log(await cdp.eval('window.__ujiHasil'));
process.exit(0);
