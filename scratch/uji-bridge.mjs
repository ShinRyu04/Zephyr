import { cdp } from './cdp2.mjs';

/*
 * Use `window.__ZEPHYR__` and `window.__ZEPHYR_AI__`.
 *
 * These are installed by `devBridge.ts` FROM the app's own module instances, so
 * they are the same objects the UI renders from. Importing `/src/lib/store.ts`
 * by path is what produced every wrong reading earlier: Vite hands the probe a
 * second instance with `settingsLoaded: false` and an empty workspace.
 */
const c = await cdp(9223, 'localhost:5173');

const j = async (body, ms = 90000) => {
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

hasil.jembatan = await j(`
  const s = window.__ZEPHYR__.getState();
  return {
    adaBridge: true,
    workspace: s.workspace,
    settingsLoaded: s.settingsLoaded,
    autoFixIde: s.settings.conversation?.autoFixIde ?? null,
    questioningIde: s.settings.conversation?.questioningIde ?? null,
    todoListIde: s.settings.conversation?.todoListIde ?? null,
  };
`);

/* ── Set the switches through the ONE store, then call the real tool ────── */
hasil.tanyaHidup = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, questioningIde: true } });
  await new Promise(r=>setTimeout(r,200));

  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });

  let kartu = null;
  for (let i = 0; i < 60 && !kartu; i++) {
    await new Promise(r=>setTimeout(r,50));
    kartu = window.__ZEPHYR_AI__.getState().agentTanya;
  }
  window.__ZEPHYR_AI__.getState().jawabTanya('b');
  const jawab = await janji;
  store.getState().applySettings({ conversation: { ...conv } });
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, pilihan: kartu?.pilihan ?? null, hasil: String(jawab).slice(0,60) };
`);

hasil.tanyaMati = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, questioningIde: false } });
  await new Promise(r=>setTimeout(r,200));
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const hasil = await jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a'] });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: String(hasil).slice(0, 90) };
`);

hasil.todoHidup = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, todoListIde: true } });
  await new Promise(r=>setTimeout(r,200));
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const hasil = await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: String(hasil).slice(0, 80) };
`);

/* ── Auto Fix Lints, with the workspace the editor really has ──────────── */
hasil.autoFixRust = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,200));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  store.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 130), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, sisa: (r?.sisa ?? []).length, galat: r?.galat ?? null };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
