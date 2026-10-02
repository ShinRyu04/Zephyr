/**
 * cek-stack.mjs - lihat keadaan DOM panel AI saat ini.
 *
 *   node scripts/cek-stack.mjs [port]
 *
 * Alat bantu. Menjawab: apakah panel AI terbuka, apakah tumpukan statusnya
 * dirender, dan kelas apa saja yang benar-benar ada. Dipakai karena menebak
 * nama kelas/selector dari kode sumber sudah beberapa kali keliru.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

async function lihat(nama, expr) {
  const hasil = await cdp.eval('JSON.stringify(' + expr + ')');
  console.log(nama + ':', hasil);
}

await lihat(
  'elemen',
  "(() => ({ panel: !!document.querySelector('.ai-panel'), chat: !!document.querySelector('.ai-chat'), stack: !!document.querySelector('.ai-work-stack'), agent: !!document.querySelector('.ai-agent'), todo: !!document.querySelector('.todo-dock'), aiApaSaja: [...document.querySelectorAll('[class^=ai-], [class*= ai-]')].map(e => String(e.className).split(' ')[0]).slice(0, 18) }))()",
);

await lihat(
  'storePanel',
  "(() => { const s = document.querySelector('.ai-chat'); if (!s) return null; const c = getComputedStyle(s); return { overflowY: c.overflowY, tinggi: Math.round(s.getBoundingClientRect().height) }; })()",
);

await cdp.close();
process.exit(0);
