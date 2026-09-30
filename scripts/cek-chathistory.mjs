/**
 * Cek panel AI (menu kiri): judul sesi, tombol, placeholder — semua harus English.
 * Juga baca localStorage untuk melihat judul lama yang tersimpan.
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const out = await cdp.runAsync(`
  const out = {};
  const ls = localStorage.getItem('zephyr.ai.sessions.v1');
  if (ls) {
    try {
      const p = JSON.parse(ls);
      out.judulTersimpan = (p.sessions || []).map(s => s.title);
      out.jumlahSesi = (p.sessions || []).length;
    } catch (e) { out.err = String(e); }
  } else out.judulTersimpan = null;

  out.judulTampil = [...document.querySelectorAll('.ai-side-title')].map(e => e.textContent.trim());
  const jp = document.querySelector('.side-title');
  out.judulPanel = jp ? jp.textContent.trim() : null;
  out.tombolHeader = [...document.querySelectorAll('.ai-side-head-row button')]
    .map(b => (b.getAttribute('title') || b.getAttribute('aria-label') || '').trim()).filter(Boolean);
  const inp = document.querySelector('input[placeholder]');
  out.placeholder = inp ? inp.getAttribute('placeholder') : null;
  out.uiLang = S ? S().uiLang : '(?)';
  return out;
`);
console.log(JSON.stringify(out, null, 1));
await cdp.close();
