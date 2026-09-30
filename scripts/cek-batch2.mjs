import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  out.viteErr = !!q('#vite-error-overlay');

  // 1.3 chevron animasi
  const ch = q('.tree-chevron');
  if (ch) {
    out.chevronTrans = getComputedStyle(ch).transitionDuration;
  }
  const row = q('.tree-row');
  if (row) out.rowAnim = getComputedStyle(row).animationName;

  // 1.4/1.5 indent + bracket + minimap aktif?
  await wait(400);
  out.zigAda = qa('.cm-zig').length;
  out.bracketSpan = qa('.cm-zbr').length;
  out.minimapAda = !!q('[data-testid="minimap"]');

  // cek settings lowRam
  const st2 = window.__ZEPHYR__.getState().settings;
  out.lowRam = st2.general.lowRam;
  out.minimapSet = st2.editor.minimap;
  out.bracketSet = st2.editor.bracketPairColorization;
  out.indentSet = st2.editor.indentGuides;
  out.ghostSet = st2.editor.ghostText;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
