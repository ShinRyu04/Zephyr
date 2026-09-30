import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.dispatch({ selection: { anchor: v.state.doc.line(700).from } });
  await wait(1500);

  // cek dekorasi di plugin: apakah ada kelas zbr-3 / zbr-4?
  let semua = new Set();
  for (const p of v.plugins) {
    const d = p.decorations;
    if (!d || typeof d.between !== 'function') continue;
    try {
      d.between(0, v.state.doc.length, (f, t, val) => {
        const c = val && val.spec && val.spec.class;
        if (c && String(c).includes('zbr')) semua.add(String(c));
      });
    } catch (e) {}
  }
  out.kelasDiPlugin = [...semua];
  out.jumlahPlugin = v.plugins.length;

  // cek DOM
  const dom = new Set();
  document.querySelectorAll('[class*="cm-zbr-"]').forEach(e => {
    e.className.split(' ').filter(c => c.startsWith('cm-zbr-')).forEach(c => dom.add(c));
  });
  out.kelasDiDom = [...dom];
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
