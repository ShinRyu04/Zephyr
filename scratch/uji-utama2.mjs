import { cdp } from './cdp2.mjs';

/*
 * Back to the MAIN window root.
 *
 * The panel window and the main window are separate WebViews, and a settings
 * panel has no workspace — so Auto Fix Lints correctly reports "no project" there.
 * The feature runs from the agent loop in the main window, so the probe has to go
 * back to it: clear the hash, reload, and let boot pick the editor root.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const t = list.find((x) => x.type === 'page');
const c0 = await cdp(9223, t.url.includes('#') ? t.url.split('#')[0] : t.url);
await c0.eval(`history.replaceState(null, '', location.pathname); location.reload();`);
c0.close();
await new Promise((r) => setTimeout(r, 9000));

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
hasil.root = await c.eval(`document.querySelector('#root')?.firstElementChild?.className ?? '(kosong)'`);

hasil.workspace = await j(`
  const store = await import('/src/lib/store.ts');
  const s = store.useStore.getState();
  return { workspace: s.workspace, settingsLoaded: s.settingsLoaded, autoFixIde: s.settings.conversation?.autoFixIde ?? null };
`);

/* ── Auto Fix Lints against a real workspace ────────────────────────────── */
hasil.autoFixRust = await j(`
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,150));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 130), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, sisa: (r?.sisa ?? []).length, galat: r?.galat ?? null };
`);

/* ── ask_user: poll for the card, answer, read the tool result ──────────── */
hasil.tanya = await j(`
  const store = await import('/src/lib/store.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, questioningIde: true } });
  await new Promise(r=>setTimeout(r,150));

  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });

  let kartu = null;
  for (let i = 0; i < 60 && !kartu; i++) {
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
