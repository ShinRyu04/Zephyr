import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');

/*
 * Runtime.evaluate has no top-level await, so every probe is wrapped in an async
 * IIFE that returns JSON. `awaitPromise` on the CDP side then resolves it.
 */
const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  const v = await c.eval(src);
  return JSON.parse(v);
};

const hasil = {};

/* ── ask_user: the loop really parks and the answer comes back ───────────── */
hasil.tanya = await j(`
  const ai = await import('/src/lib/aiStore.ts');
  const janji = ai.useAi.getState().agentAjukanTanya('Mana yang dimaksud?', ['a.ts','b.ts']);
  await new Promise(r=>setTimeout(r,60));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('b.ts');
  const jawaban = await janji;
  return { kartuTampil: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, pilihan: kartu?.pilihan ?? null, jawaban, kartuHilang: ai.useAi.getState().agentTanya === null };
`);

/* ── ask_user as the MODEL sees it: switch off => refusal, on => parks ───── */
hasil.toolAsk = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const store = await import('/src/lib/store.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const conv = store.useStore.getState().settings.conversation;

  store.useStore.getState().applySettings({ conversation: { ...conv, questioningIde: false } });
  await new Promise(r=>setTimeout(r,30));
  const mati = await jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x'] });

  store.useStore.getState().applySettings({ conversation: { ...conv, questioningIde: true } });
  await new Promise(r=>setTimeout(r,30));
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x','y'] });
  await new Promise(r=>setTimeout(r,80));
  const adaKartu = !!ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('y');
  const hidup = await janji;

  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { mati: String(mati).slice(0,80), adaKartu, hidup: String(hidup).slice(0,60) };
`);

/* ── Auto Fix Lints: real Rust call, real report ─────────────────────────── */
hasil.autoFix = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,30));
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: false } });
  await new Promise(r=>setTimeout(r,30));
  const mati = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return {
    alat: r?.alat ?? null,
    pesan: (r?.pesan ?? '').slice(0,90),
    diminta: r?.diminta ?? 0,
    berubah: r?.berubah ?? [],
    galat: r?.galat ?? null,
    saatMati: mati,
  };
`);

/* ── Review scope: none => no checkpoint, latest => older ones retired ───── */
hasil.review = await j(`
  const r = await import('/src/lib/reviewUbah.ts');
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, reviewScope: 'none' } });
  await new Promise(r=>setTimeout(r,20));
  const none = r.simpanCheckpoint();
  store.useStore.getState().applySettings({ conversation: { ...conv, reviewScope: 'latest' } });
  await new Promise(r=>setTimeout(r,20));
  const latest = r.simpanCheckpoint();
  const buang = r.checkpointYangDibuang(r.cakupanReview(), ['m1','m2','m3'], 'm3');
  store.useStore.getState().applySettings({ conversation: { ...conv, reviewScope: 'all' } });
  await new Promise(r=>setTimeout(r,20));
  const all = r.simpanCheckpoint();
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { none, latest, buang, all };
`);

/* ── Terminal preference: the setting reaches the decision ───────────────── */
hasil.terminal = await j(`
  const t = await import('/src/lib/terminalAgent.ts');
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, terminalEnv: 'system', terminalAutoOpen: 'background' } });
  await new Promise(r=>setTimeout(r,20));
  const latar = t.keputusanTerminal('npm run dev');
  const bukan = t.keputusanTerminal('npm run build');
  store.useStore.getState().applySettings({ conversation: { ...conv, terminalEnv: 'efficient', terminalAutoOpen: 'never' } });
  await new Promise(r=>setTimeout(r,20));
  const efisien = t.keputusanTerminal('npm run dev');
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { latar, bukan, efisien };
`);

/* ── Notification: banner/sound gates come from the settings ─────────────── */
hasil.notif = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  const sebelum = n.riwayatBunyiNotif().length;

  store.useStore.getState().applySettings({ conversation: { ...conv, notifSound: false, notifBanner: false } });
  await new Promise(r=>setTimeout(r,20));
  n.catatMulaiRun('uji-a', Date.now() - 60000);
  n.catatSelesaiRun('uji-a', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,80));
  const tanpaBunyi = n.riwayatBunyiNotif().length;

  store.useStore.getState().applySettings({ conversation: { ...conv, notifSound: true, notifVolume: 40, soundCompleted: 'chime' } });
  await new Promise(r=>setTimeout(r,20));
  n.catatMulaiRun('uji-b', Date.now() - 60000);
  n.catatSelesaiRun('uji-b', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,120));
  const denganBunyi = n.riwayatBunyiNotif().at(-1);

  store.useStore.getState().applySettings({ conversation: { ...conv, notifSound: true, soundCompleted: 'none' } });
  await new Promise(r=>setTimeout(r,20));
  n.catatMulaiRun('uji-c', Date.now() - 60000);
  n.catatSelesaiRun('uji-c', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,80));
  const pilihanNone = n.riwayatBunyiNotif().at(-1);

  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { sebelum, tanpaBunyi, denganBunyi, pilihanNone };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
