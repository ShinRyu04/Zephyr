import { cdp } from './cdp2.mjs';

const c = await cdp(9223, 'localhost:5173');

const j = async (body, ms = 120000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

const hasil = {};

/* ── ask_user through the bridge (the store is `.store`, not the hook) ──── */
hasil.tanyaHidup = await j(`
  const store = window.__ZEPHYR__;
  const ai = window.__ZEPHYR_AI__.store;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, questioningIde: true } });
  await new Promise(r=>setTimeout(r,250));

  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana yang dimaksud?', pilihan: ['a.ts','b.ts'] });

  let kartu = null;
  for (let i = 0; i < 80 && !kartu; i++) {
    await new Promise(r=>setTimeout(r,50));
    kartu = ai.getState().agentTanya;
  }
  ai.getState().jawabTanya('b.ts');
  const jawab = await janji;
  store.getState().applySettings({ conversation: { ...conv } });
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, pilihan: kartu?.pilihan ?? null, hasil: String(jawab).slice(0,60) };
`);

/* ── Auto Fix Lints in the REAL workspace (D:\ZephyrDesktop) ────────────── */
hasil.autoFixWorkspace = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  const akar = store.getState().workspace;
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,250));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', [akar + '\\\\main.js']);
  store.getState().applySettings({ conversation: { ...conv } });
  return { akar, alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 130), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, galat: r?.galat ?? null };
`);

/* ── The switch really gates it ─────────────────────────────────────────── */
hasil.autoFixMati = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: false } });
  await new Promise(r=>setTimeout(r,250));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', [store.getState().workspace + '\\\\main.js']);
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: r };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
