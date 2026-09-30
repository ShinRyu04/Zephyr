import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};

  // buka dropdown sesi
  const t = q('[data-testid="ai-chat-name"]');
  if (t) { t.click(); await wait(900); }
  const b = q('[data-testid="ai-sesi-baru"]');
  out.ada = !!b;
  if (b) {
    const cs = getComputedStyle(b);
    out.color = cs.color;
    out.background = cs.backgroundColor;
    out.fontSize = cs.fontSize;
    out.padding = cs.padding;
    out.teks = b.textContent.trim();
    // apakah ada span anak dg warna lain?
    out.anak = [...b.children].map((c) => ({
      tag: c.tagName,
      cls: c.className,
      color: getComputedStyle(c).color,
      teks: c.textContent.slice(0, 12),
    }));
  }
  out.varFg0 = getComputedStyle(document.documentElement).getPropertyValue('--fg0').trim();
  out.varFg1 = getComputedStyle(document.documentElement).getPropertyValue('--fg1').trim();
  out.varText = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  return out;
`, 90000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
