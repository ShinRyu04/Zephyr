import { cdp } from './cdp2.mjs';

/*
 * The MAIN window, not the settings panel.
 *
 * Auto Fix Lints reads `useStore.getState().workspace`, and a settings panel is
 * its own WebView with no workspace — so running it there correctly reports "no
 * project". The feature is triggered by the agent loop, which lives in the main
 * window, so that is where it has to be proved.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.type === 'page' && !x.url.includes('panel='));
console.log('target: ' + utama.url);

const c = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);

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

hasil.workspace = await j(`
  const store = await import('/src/lib/store.ts');
  const s = store.useStore.getState();
  return { workspace: s.workspace, settingsLoaded: s.settingsLoaded, autoFixIde: s.settings.conversation?.autoFixIde ?? null };
`);

/* ── Auto Fix Lints, with a real workspace ──────────────────────────────── */
hasil.autoFixRust = await j(`
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,120));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 130), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, sisa: (r?.sisa ?? []).length, galat: r?.galat ?? null };
`);

hasil.autoFixTs = await j(`
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,120));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 130), diminta: r?.diminta ?? 0, galat: r?.galat ?? null };
`);

/* ── ask_user: poll for the card, answer, then read the tool result ─────── */
hasil.tanya = await j(`
  const store = await import('/src/lib/store.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, questioningIde: true } });
  await new Promise(r=>setTimeout(r,120));

  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });

  let kartu = null;
  for (let i = 0; i < 40 && !kartu; i++) {
    await new Promise(r=>setTimeout(r,50));
    kartu = ai.useAi.getState().agentTanya;
  }
  ai.useAi.getState().jawabTanya('b');
  const hasil = await janji;
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, pilihan: kartu?.pilihan ?? null, hasil: String(hasil).slice(0, 60), kartuHilang: ai.useAi.getState().agentTanya === null };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
