import { cdp } from './cdp2.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.type === 'page');
const c0 = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);
await c0.eval(`location.hash = '#panel=agent-custom&s=conversations'; location.reload();`);
c0.close();
await new Promise((r) => setTimeout(r, 8000));

const c = await cdp(9223, '#panel=agent-custom');

/*
 * Every probe is bounded. A tool that awaits a UI answer can park forever if the
 * answer never arrives — which is correct behaviour for the agent and fatal for a
 * harness. The timeout turns "it hung" into a readable result instead of a dead
 * shell command.
 */
const j = async (body, ms = 8000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

const setSaklar = async (id, nyala) => {
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 700));
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
  await new Promise((r) => setTimeout(r, 700));
};

const hasil = {};
hasil.kontrol = await c.eval(
  `document.querySelectorAll('.conv-saklar').length + ' saklar / ' + document.querySelectorAll('.conv-pilih').length + ' pilih / ' + document.querySelectorAll('.conv-set').length + ' bagian'`,
);

/* ── Auto Fix Lints ─────────────────────────────────────────────────────── */
await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixRust = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 120), berubah: (r?.berubah ?? []).length, galat: r?.galat ?? null };
`, 60000);

await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  return { hasil: r };
`);

/* ── Questioning: the tool parks and an answer releases it ─────────────── */
await setSaklar('agx-conv-tanya-ide', true);
hasil.tanyaHidup = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });
  await new Promise(r=>setTimeout(r,250));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('b');
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, hasil: String(await janji).slice(0, 50) };
`, 12000);

await setSaklar('agx-conv-tanya-ide', false);
hasil.tanyaMati = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a'] })).slice(0, 90) };
`);

/* ── To-Do List ─────────────────────────────────────────────────────────── */
await setSaklar('agx-conv-todo-ide', true);
hasil.todoHidup = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0, 80) };
`);
await setSaklar('agx-conv-todo-ide', false);
hasil.todoMati = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0, 90) };
`);

/* ── Terminal + Review scope ────────────────────────────────────────────── */
await setPilih('agx-conv-terminal-env', 'system');
await setPilih('agx-conv-terminal-open', 'background');
hasil.terminal = await j(`
  const t = await import('/src/lib/terminalAgent.ts');
  return { dev: t.keputusanTerminal('npm run dev'), build: t.keputusanTerminal('npm run build') };
`);
await setPilih('agx-conv-terminal-env', 'efficient');
await setPilih('agx-conv-terminal-open', 'never');

await setPilih('agx-conv-review-scope', 'none');
hasil.reviewNone = await j(`
  const r = await import('/src/lib/reviewUbah.ts');
  return { cakupan: r.cakupanReview(), simpan: r.simpanCheckpoint() };
`);
await setPilih('agx-conv-review-scope', 'latest');
hasil.reviewLatest = await j(`
  const r = await import('/src/lib/reviewUbah.ts');
  return { cakupan: r.cakupanReview(), simpan: r.simpanCheckpoint(), buang: r.checkpointYangDibuang(r.cakupanReview(), ['m1','m2','m3'], 'm3') };
`);
await setPilih('agx-conv-review-scope', 'all');

/* ── Notification ───────────────────────────────────────────────────────── */
await setSaklar('agx-conv-notif-sound', true);
await setPilih('agx-conv-sound-completed', 'chime');
hasil.notifChime = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-chime', Date.now() - 60000);
  n.catatSelesaiRun('uji-chime', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,300));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setPilih('agx-conv-sound-completed', 'none');
hasil.notifNone = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-none', Date.now() - 60000);
  n.catatSelesaiRun('uji-none', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,250));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setSaklar('agx-conv-notif-sound', false);
hasil.notifMati = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  const sebelum = n.riwayatBunyiNotif().length;
  n.catatMulaiRun('uji-mati', Date.now() - 60000);
  n.catatSelesaiRun('uji-mati', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,250));
  return { sebelum, sesudah: n.riwayatBunyiNotif().length };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
