import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  // cek beberapa baris berbeda: scroll ke area fungsi bersarang
  const hasil = [];
  for (const ln of [60, 200, 700, 1000]) {
    if (ln > v.state.doc.lines) continue;
    v.dispatch({ selection: { anchor: v.state.doc.line(ln).from } });
    await wait(900);
    const z = qa('.cm-zbr');
    const kelas = [...new Set(z.map(e => e.className.split(' ').filter(c => c.startsWith('cm-zbr-')).join('')))];
    hasil.push({ ln, jumlah: z.length, kelas });
  }
  out.perBaris = hasil;
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
