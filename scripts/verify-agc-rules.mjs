/*
 * Bukti: halaman Rules & Memories berbentuk referensi.
 *
 *   R1  pane merender dengan judul "Rules & Memories"
 *   R2  ada blok Import Settings dengan AGENTS.md dan CLAUDE.md
 *   R3  toggle AGENTS.md benar-benar menulis ke setelan
 *   R4  Rules punya tab Global | Project
 *   R5  empty state tampil saat belum ada rules, lengkap dengan tombol Create
 *   R6  Memory punya badge Beta dan tab Global | Project
 *   R7  toggle Memory benar-benar menulis ke setelan
 *   R8  kartu User Memory menyebut path berkasnya
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

await cdp.eval(
  `(() => {
  const lama = document.getElementById('uji-agc-rules');
  if (lama) lama.remove();
  const host = document.createElement('div');
  host.id = 'uji-agc-rules';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:24px';
  document.body.appendChild(host);
  return 'ok';
})()`,
);

const mount = await cdp.json(
  `return JSON.stringify(await (async () => {
  try {
    const ReactMod = await import('/node_modules/.vite/deps/react.js');
    const React = ReactMod.default ?? ReactMod;
    const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
    const Dom = DomMod.default ?? DomMod;
    const createRoot = Dom.createRoot ?? DomMod.createRoot;
    if (typeof createRoot !== 'function') return { ok: false, galat: 'createRoot tidak ada' };
    const mod = await import('/src/components/settings/AgcRulesMemories.tsx');
    const host = document.getElementById('uji-agc-rules');
    const root = createRoot(host);
    root.render(React.createElement(mod.default));
    window.__UJI_RULES_ROOT__ = root;
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})())`,
  120000,
);
const mt = typeof mount === 'string' ? JSON.parse(mount) : mount;
console.log('mount:', JSON.stringify(mt));
await new Promise((r) => setTimeout(r, 1400));

const h = await cdp.json(
  `return JSON.stringify((() => {
  const pane = document.querySelector('#uji-agc-rules [data-testid="agx-rules"]');
  const out = { adaPane: !!pane };
  if (!pane) return out;
  out.judul = pane.querySelector('.agc-pane-title')?.textContent?.trim() ?? null;
  out.seksi = [...pane.querySelectorAll('.agx-seksi')].map((x) => x.textContent.trim());
  out.adaAgentsMd = !!pane.querySelector('[data-testid="agx-ctx-AGENTS.md"]');
  out.adaClaudeMd = !!pane.querySelector('[data-testid="agx-ctx-CLAUDE.md"]');
  out.adaTabRules = !!pane.querySelector('[data-testid="agx-rules-global"]') && !!pane.querySelector('[data-testid="agx-rules-proyek"]');
  out.adaKosong = !!pane.querySelector('[data-testid="agx-rules-kosong"]');
  out.adaCreate = !!pane.querySelector('[data-testid="agx-rules-create"]');
  out.adaTabMem = !!pane.querySelector('[data-testid="agx-mem-global"]') && !!pane.querySelector('[data-testid="agx-mem-proyek"]');
  out.adaToggleMem = !!pane.querySelector('[data-testid="agx-mem-toggle"]');
  out.adaUserMemory = !!pane.querySelector('[data-testid="agx-user-memory"]');
  out.path = pane.querySelector('.agx-mem-path')?.textContent ?? null;
  out.adaBeta = !!pane.querySelector('.agx-beta');
  return out;
})())`,
  60000,
);
const d = typeof h === 'string' ? JSON.parse(h) : h;

/* R3: tick AGENTS.md and read the setting back. */
const sebelumCtx = await cdp.json(
  `return JSON.stringify({ nilai: window.__ZEPHYR__.getState().settings.agents?.bacaAgentsMd ?? null })`,
  60000,
);
d.sebelumCtx = typeof sebelumCtx === 'string' ? JSON.parse(sebelumCtx) : sebelumCtx;

await cdp.eval(
  `(() => {
  const cb = document.querySelector('#uji-agc-rules [data-testid="agx-ctx-AGENTS.md"] input');
  if (cb) cb.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 900));

const sesudahCtx = await cdp.json(
  `return JSON.stringify({ nilai: window.__ZEPHYR__.getState().settings.agents?.bacaAgentsMd ?? null })`,
  60000,
);
d.sesudahCtx = typeof sesudahCtx === 'string' ? JSON.parse(sesudahCtx) : sesudahCtx;

/* R7: toggle memory and read it back. */
const sebelumMem = await cdp.json(
  `return JSON.stringify({ nilai: window.__ZEPHYR__.getState().settings.agents?.memoriAktif ?? null })`,
  60000,
);
d.sebelumMem = typeof sebelumMem === 'string' ? JSON.parse(sebelumMem) : sebelumMem;

await cdp.eval(
  `(() => {
  const cb = document.querySelector('#uji-agc-rules [data-testid="agx-mem-toggle"] input');
  if (cb) cb.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 900));

const sesudahMem = await cdp.json(
  `return JSON.stringify({ nilai: window.__ZEPHYR__.getState().settings.agents?.memoriAktif ?? null })`,
  60000,
);
d.sesudahMem = typeof sesudahMem === 'string' ? JSON.parse(sesudahMem) : sesudahMem;

/* Put the settings back. */
const restoreCtx = JSON.stringify(d.sebelumCtx?.nilai ?? null);
const restoreMem = JSON.stringify(d.sebelumMem?.nilai ?? null);
await cdp.eval(
  `(() => {
  const S = window.__ZEPHYR__.getState();
  const a = S.settings.agents ?? {};
  void S.applySettings({ agents: { ...a, bacaAgentsMd: ${restoreCtx}, memoriAktif: ${restoreMem} } });
  return 'ok';
})()`,
);

/* Clean up the mount. */
await cdp.eval(
  `(() => {
  try { window.__UJI_RULES_ROOT__?.unmount(); } catch (e) {}
  const host = document.getElementById('uji-agc-rules');
  if (host) host.remove();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — halaman Rules & Memories:');
cek('R1 pane merender dengan judul', mt.ok === true && /Rules & Memories/.test(d.judul ?? ''), d.judul ?? mt.galat ?? '');
cek('R2 ada AGENTS.md dan CLAUDE.md', d.adaAgentsMd === true && d.adaClaudeMd === true, '');
cek(
  'R3 toggle AGENTS.md menulis ke setelan',
  d.sesudahCtx?.nilai !== d.sebelumCtx?.nilai && d.sesudahCtx?.nilai !== null,
  `${d.sebelumCtx?.nilai} -> ${d.sesudahCtx?.nilai}`,
);
cek('R4 Rules punya tab Global | Project', d.adaTabRules === true, '');
cek('R5 empty state + tombol Create', d.adaKosong === true && d.adaCreate === true, '');
cek('R6 Memory punya badge Beta + tab', d.adaBeta === true && d.adaTabMem === true, '');
cek(
  'R7 toggle Memory menulis ke setelan',
  d.sesudahMem?.nilai !== d.sebelumMem?.nilai,
  `${d.sebelumMem?.nilai} -> ${d.sesudahMem?.nilai}`,
);
cek(
  'R8 kartu User Memory menyebut path',
  d.adaUserMemory === true && /user_profile\.md/.test(d.path ?? ''),
  d.path ?? '',
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
