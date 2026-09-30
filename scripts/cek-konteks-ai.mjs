/**
 * Buktikan blok konteks AI benar-benar terkirim: panggil konteksAgent()
 * di app hidup dan tampilkan isinya.
 *
 * Runtime.evaluate dengan awaitPromise sering gagal di WebView2 ("Promise was
 * collected"), jadi promise disimpan di window lalu di-polling - pola yang sama
 * dipakai verify05/verify06.
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');

await cdp.eval(`
  window.__KONTEKS_AI__ = null;
  window.__KONTEKS_ERR__ = null;
  import('/src/lib/aiStore.ts')
    .then((m) => m.konteksAgent())
    .then((t) => { window.__KONTEKS_AI__ = t; })
    .catch((e) => { window.__KONTEKS_ERR__ = String(e && e.message || e); });
  'started'
`);

let teks = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const v = await cdp.eval(`window.__KONTEKS_AI__`);
  if (typeof v === 'string') { teks = v; break; }
}
const err = await cdp.eval(`window.__KONTEKS_ERR__`);

if (err) console.log('ERROR dari app:', err);
if (!teks) { console.log('konteks tidak terisi (null)'); }
else {
  console.log('panjang:', teks.length);
  console.log('--- ISI KONTEKS AI ---');
  console.log(teks);
}
await cdp.close();
