/**
 * Buka Settings -> Theme dan baca SEMUA teks di kartu tema "Senja".
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');

await cdp.runAsync(`
  const b = [...document.querySelectorAll('button')].find(x => /settings/i.test((x.getAttribute('aria-label')||'')+(x.getAttribute('title')||'')));
  if (b) b.click();
  return !!b;
`);
await new Promise((r) => setTimeout(r, 1800));

const nav = await cdp.runAsync(`
  const btn = [...document.querySelectorAll('button')].find(x => /^(theme|appearance)$/i.test((x.textContent||'').trim()));
  if (btn) btn.click();
  return btn ? btn.textContent.trim() : 'TIDAK KETEMU';
`);
await new Promise((r) => setTimeout(r, 1800));

const out = await cdp.runAsync(`
  const out = { navKlik: ${JSON.stringify(nav)} };
  const hal = document.querySelector('[class*="settings"]') || document.body;
  out.barisHalaman = (hal.innerText || '').split('\\n').map(x => x.trim()).filter(Boolean).slice(0, 120);
  const daun = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /senja/i.test(e.textContent||''));
  out.elemenSenja = daun.map(e => {
    const kartu = e.closest('button, [role="button"], li');
    return {
      teks: (e.textContent||'').trim(),
      kelas: String(e.className || '').slice(0, 60),
      title: e.getAttribute('title'),
      aria: e.getAttribute('aria-label'),
      kartuTeks: kartu ? (kartu.innerText||'').replace(/\\n/g,' | ').trim().slice(0, 220) : null,
      kartuTitle: kartu ? kartu.getAttribute('title') : null,
    };
  });
  return out;
`);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
