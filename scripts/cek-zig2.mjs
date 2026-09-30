import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  out.editorSettings = {
    indentGuides: st.settings.editor.indentGuides,
    bracketPairColorization: st.settings.editor.bracketPairColorization,
    colorDecorators: st.settings.editor.colorDecorators,
    unicodeHighlight: st.settings.editor.unicodeHighlight,
    ghostText: st.settings.editor.ghostText,
    minimap: st.settings.editor.minimap,
  };
  // cek :root apakah --zig-step terdefinisi
  const zig = document.querySelector('[style*="--zig-n"]');
  out.contohZigStyle = zig ? zig.getAttribute('style') : null;

  // cek apakah plugin indent benar-benar dipanggil: hitung elemen dengan --zig-step inline
  out.elemenZigN = document.querySelectorAll('[style*="--zig-n"]').length;

  // apa yang dipakai baris indent? cek .cm-line ke-37
  const lines = document.querySelectorAll('.cm-line');
  out.jumlahBaris = lines.length;
  if (lines[36]) {
    const cs = getComputedStyle(lines[36]);
    out.baris37 = {
      cls: lines[36].className,
      bg: cs.backgroundImage.slice(0, 50),
      size: cs.backgroundSize,
    };
  }
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
