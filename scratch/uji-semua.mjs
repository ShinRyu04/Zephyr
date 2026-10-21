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

/* The bridge is the app's own store, so these reads are the real ones. */
hasil.store = await j(`
  const s = window.__ZEPHYR__.getState();
  return { workspace: s.workspace, settingsLoaded: s.settingsLoaded, conversation: s.settings.conversation };
`);

/* ── ask_user: ON parks the loop, answer releases it; OFF refuses ────────── */
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

hasil.tanyaMati = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, questioningIde: false } });
  await new Promise(r=>setTimeout(r,250));
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const hasil = await jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a'] });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: String(hasil).slice(0, 90) };
`);

/* ── todo_write: ON writes, OFF refuses ─────────────────────────────────── */
hasil.todoHidup = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, todoListIde: true } });
  await new Promise(r=>setTimeout(r,250));
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const hasil = await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: String(hasil).slice(0, 80) };
`);

hasil.todoMati = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, todoListIde: false } });
  await new Promise(r=>setTimeout(r,250));
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const hasil = await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: String(hasil).slice(0, 90) };
`);

/* ── Auto Fix: ON runs the real fixer, OFF does nothing ─────────────────── */
hasil.autoFixHidup = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,250));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['D:\\\\Zephyr\\\\scratch\\\\proyek-uji\\\\src\\\\a.js']);
  store.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 110), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, galat: r?.galat ?? null };
`, 180000);

hasil.autoFixMati = await j(`
  const store = window.__ZEPHYR__;
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: false } });
  await new Promise(r=>setTimeout(r,250));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['D:\\\\Zephyr\\\\scratch\\\\proyek-uji\\\\src\\\\a.js']);
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: r };
`);

/* ── Review scope and terminal preference, through the bridge ───────────── */
hasil.review = await j(`
  const store = window.__ZEPHYR__;
  const r = await import('/src/lib/reviewUbah.ts');
  const conv = store.getState().settings.conversation;
  const baca = async (scope) => {
    store.getState().applySettings({ conversation: { ...conv, reviewScope: scope } });
    await new Promise(x=>setTimeout(x,80));
    return { cakupan: r.cakupanReview(), simpan: r.simpanCheckpoint() };
  };
  const none = await baca('none');
  const latest = await baca('latest');
  const all = await baca('all');
  const buang = r.checkpointYangDibuang('latest', ['m1','m2','m3'], 'm3');
  store.getState().applySettings({ conversation: { ...conv } });
  return { none, latest, all, buang };
`);

hasil.terminal = await j(`
  const store = window.__ZEPHYR__;
  const t = await import('/src/lib/terminalAgent.ts');
  const conv = store.getState().settings.conversation;
  store.getState().applySettings({ conversation: { ...conv, terminalEnv: 'system', terminalAutoOpen: 'background' } });
  await new Promise(x=>setTimeout(x,80));
  const sistem = { dev: t.keputusanTerminal('npm run dev'), build: t.keputusanTerminal('npm run build') };
  store.getState().applySettings({ conversation: { ...conv, terminalEnv: 'efficient', terminalAutoOpen: 'never' } });
  await new Promise(x=>setTimeout(x,80));
  const efisien = t.keputusanTerminal('npm run dev');
  store.getState().applySettings({ conversation: { ...conv } });
  return { sistem, efisien };
`);

/* ── Notification sound: on/choice/off ──────────────────────────────────── */
hasil.notif = await j(`
  const store = window.__ZEPHYR__;
  const n = await import('/src/lib/notifikasiAi.ts');
  const conv = store.getState().settings.conversation;

  const jalan = async (patch) => {
    store.getState().applySettings({ conversation: { ...conv, ...patch } });
    await new Promise(x=>setTimeout(x,120));
    const sebelum = n.riwayatBunyiNotif().length;
    n.catatMulaiRun('uji-' + Math.random(), Date.now() - 60000);
    n.catatSelesaiRun('uji-x', 'Uji', 'selesai', 'selesai');
    await new Promise(x=>setTimeout(x,250));
    return n.riwayatBunyiNotif().length > sebelum ? n.riwayatBunyiNotif().at(-1) : null;
  };

  const chime = await jalan({ notifSound: true, notifVolume: 40, soundCompleted: 'chime' });
  const none = await jalan({ notifSound: true, soundCompleted: 'none' });
  const mati = await jalan({ notifSound: false });
  store.getState().applySettings({ conversation: { ...conv } });
  return { chime, none, mati };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
