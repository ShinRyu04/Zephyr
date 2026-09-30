import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.scrollDOM.scrollTop = v.lineBlockAt(v.state.doc.line(700).from).top;
  await wait(2000);

  // ambil 3 kurung dengan kelas berbeda + struktur DOM-nya
  out.contoh = [];
  for (const cls of ['cm-zbr-0','cm-zbr-1','cm-zbr-4']) {
    const el = q('.' + cls);
    if (!el) continue;
    out.contoh.push({
      cls,
      computed: getComputedStyle(el).color,
      sendiri: el.style.color || '(kosong)',
      punyaAnak: el.children.length,
      anakWarna: el.children[0] ? getComputedStyle(el.children[0]).color : null,
      parent: el.parentElement ? el.parentElement.className : null,
    });
  }
  // cek indent guide: ada .cm-zig, warnanya?
  const zig = q('.cm-zig');
  if (zig) {
    const cs = getComputedStyle(zig);
    out.zig = { bg: cs.backgroundImage.slice(0, 70), size: cs.backgroundSize, style: zig.getAttribute('style') };
  }
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
