import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();

  // paksa scroll supaya viewportChanged + plugin rebuild
  v.scrollDOM.scrollTop = 300;
  await wait(600);
  v.scrollDOM.scrollTop = 0;
  await wait(600);
  out.zigSetelahScroll = document.querySelectorAll('.cm-zig').length;

  // cek semua kelas dekorasi yang ada di DOM
  const kelas = new Set();
  document.querySelectorAll('.cm-line').forEach(l => {
    l.classList.forEach(c => { if (c.startsWith('cm-')) kelas.add(c); });
  });
  out.kelasBaris = [...kelas].slice(0, 20);
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
