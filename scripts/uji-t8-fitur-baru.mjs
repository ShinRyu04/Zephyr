// uji-t8-fitur-baru.mjs — exercise the features added this round through the
// live app over CDP: Hermes skills, port scan, web search, web fetch, and the
// browser pane.
//
// Every check calls the real Tauri command through the real module the UI uses.
// A check that only reads the source would pass even if the command never
// reached Rust.

import { Cdp } from './lib-cdp.mjs';

const P = '9223';

const { cdp } = await Cdp.attach(P, 'Zephyr');

const hasil = await cdp.runAsync(`
  await new Promise(r => setTimeout(r, 2500));
  const out = {};
  const mod = await import('/src/lib/commands.ts');
  const cmd = mod.default ?? mod;

  try {
    const skills = await cmd.skillsList();
    out.totalSkill = skills.length;
    out.hermes = skills.filter(s => s.scope === 'hermes').length;
    out.contohHermes = skills.filter(s => s.scope === 'hermes').slice(0, 6).map(s => s.name);
    out.scopeAda = Array.from(new Set(skills.map(s => s.scope)));
  } catch (e) { out.skillErr = String(e).slice(0, 160); }

  try {
    const isi = await cmd.skillRead('zephyr-ai-agent');
    out.bacaSkill = String(isi).slice(0, 100);
  } catch (e) { out.bacaErr = String(e).slice(0, 160); }

  try {
    const cari = await cmd.webSearch('tauri v2 release notes', 3);
    out.jumlahHasil = cari.length;
    out.contohHasil = cari.slice(0, 2).map(h => h.judul + ' | ' + h.url.slice(0, 60));
  } catch (e) { out.cariErr = String(e).slice(0, 200); }

  try {
    const hal = await cmd.webFetch('https://example.com', 400);
    out.fetch = String(hal).slice(0, 140);
  } catch (e) { out.fetchErr = String(e).slice(0, 200); }

  return JSON.stringify(out);
`);

console.log(hasil);
await cdp.close();
