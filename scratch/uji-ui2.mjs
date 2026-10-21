import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');

/*
 * Import through the SAME URLs the app already loaded (including the HMR `?t=`
 * query). A bare `/src/lib/store.ts` is a DIFFERENT module instance in Vite, so
 * a probe that uses it reads a second, empty store — which is exactly why an
 * earlier attempt reported settings that the app never had.
 */
const urls = JSON.parse(
  await c.eval(`JSON.stringify((()=>{
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const cari = (b) => res.find(n => n.includes(b)) ?? null;
    return { store: cari('/src/lib/store.ts'), ai: cari('/src/lib/aiStore.ts'), tools: cari('/src/lib/agentTools.ts') };
  })())`),
);

const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

const hasil = { urls };

const setSaklar = async (id, nyala) => {
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

const setPilih = async (id, nilai) => {
  await c.eval(`(()=>{
    const s = document.querySelector('[data-testid="${id}"]');
    if (!s) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(s, ${JSON.stringify(nilai)});
    s.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
};

/* ── Questioning: switch through the UI, then call the real tool ─────────── */
await setSaklar('agx-conv-tanya-ide', true);
hasil.tanyaHidup = await j(`
  const { jalankanAgentTool } = await import(${JSON.stringify(urls.tools)});
  const ai = await import(${JSON.stringify(urls.ai)});
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x','y'] });
  await new Promise(r=>setTimeout(r,150));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('y');
  const hasil = await janji;
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, hasil: String(hasil).slice(0,60) };
`);

await setSaklar('agx-conv-tanya-ide', false);
hasil.tanyaMati = await j(`
  const { jalankanAgentTool } = await import(${JSON.stringify(urls.tools)});
  return { hasil: String(await jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x'] })).slice(0,90) };
`);

/* ── To-Do List ─────────────────────────────────────────────────────────── */
await setSaklar('agx-conv-todo-ide', false);
hasil.todoMati = await j(`
  const { jalankanAgentTool } = await import(${JSON.stringify(urls.tools)});
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0,90) };
`);

await setSaklar('agx-conv-todo-ide', true);
hasil.todoHidup = await j(`
  const { jalankanAgentTool } = await import(${JSON.stringify(urls.tools)});
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0,90) };
`);

/* ── Terminal preference ────────────────────────────────────────────────── */
await setPilih('agx-conv-terminal-env', 'system');
await setPilih('agx-conv-terminal-open', 'background');
hasil.terminalSistem = await j(`
  const store = await import(${JSON.stringify(urls.store)});
  const conv = store.useStore.getState().settings.conversation;
  const t = await import('/src/lib/terminalAgent.ts');
  return { setelanDariStore: { env: conv.terminalEnv, open: conv.terminalAutoOpen }, dev: t.keputusanTerminal('npm run dev'), build: t.keputusanTerminal('npm run build') };
`);
await setPilih('agx-conv-terminal-env', 'efficient');
await setPilih('agx-conv-terminal-open', 'never');

/* ── Review scope ───────────────────────────────────────────────────────── */
await setPilih('agx-conv-review-scope', 'none');
hasil.reviewNone = await j(`
  const store = await import(${JSON.stringify(urls.store)});
  const r = await import('/src/lib/reviewUbah.ts');
  return { setelan: store.useStore.getState().settings.conversation.reviewScope, simpan: r.simpanCheckpoint() };
`);
await setPilih('agx-conv-review-scope', 'latest');
hasil.reviewLatest = await j(`
  const store = await import(${JSON.stringify(urls.store)});
  const r = await import('/src/lib/reviewUbah.ts');
  return { setelan: store.useStore.getState().settings.conversation.reviewScope, simpan: r.simpanCheckpoint(), buang: r.checkpointYangDibuang(r.cakupanReview(), ['m1','m2','m3'], 'm3') };
`);
await setPilih('agx-conv-review-scope', 'all');

/* ── Notification sound + volume + per-outcome choice ───────────────────── */
await setSaklar('agx-conv-notif-sound', true);
await setPilih('agx-conv-sound-completed', 'chime');
await c.eval(`(()=>{
  const s = document.querySelector('[data-testid="agx-conv-notif-volume"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '35');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 400));

hasil.notifHidup = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-hidup', Date.now() - 60000);
  n.catatSelesaiRun('uji-hidup', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,250));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setPilih('agx-conv-sound-completed', 'none');
hasil.notifNone = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-none', Date.now() - 60000);
  n.catatSelesaiRun('uji-none', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,200));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setSaklar('agx-conv-notif-sound', false);
hasil.notifMati = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  const sebelum = n.riwayatBunyiNotif().length;
  n.catatMulaiRun('uji-mati', Date.now() - 60000);
  n.catatSelesaiRun('uji-mati', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,150));
  return { sebelum, sesudah: n.riwayatBunyiNotif().length };
`);

/* ── Auto Fix Lints through the switch ──────────────────────────────────── */
await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixHidup = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0,90), diminta: r?.diminta ?? 0, galat: r?.galat ?? null };
`);
await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  return { hasil: await m.autoFixGiliran('', ['src/lib/autoFix.ts']) };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
