import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  const doc = v.state.doc;
  out.dari = JSON.stringify(doc.line(1).text.slice(0, 40));
  out.baris10 = JSON.stringify(doc.line(10).text.slice(0, 40));
  out.baris37 = JSON.stringify(doc.line(37).text.slice(0, 40));

  // hitung spasi awal baris 10 dan 37
  const sp = (s) => s.length - s.trimStart().length;
  out.sp10 = sp(doc.line(10).text);
  out.sp37 = sp(doc.line(37).text);

  // apakah memakai tab?
  out.char10 = doc.line(10).text.charCodeAt(0);
  out.char37 = doc.line(37).text.charCodeAt(0);

  // visibleRanges from = 0 artinya baris 1 tidak terlihat? cek editor terlihat
  const el = q('.cm-content');
  out.contentRect = el ? Math.round(el.getBoundingClientRect().top) + ',' + Math.round(el.getBoundingClientRect().height) : null;
  out.scrollTop = v.scrollDOM.scrollTop;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
