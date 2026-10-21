import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');

const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

/* Drive the CONTROLS the way a reader does — no store calls from the probe. */
const setSaklar = async (id, nyala) => {
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 200));
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
  await new Promise((r) => setTimeout(r, 250));
};

const hasil = {};

/* ── Terminal: set through the dropdown, read through the policy module ──── */
await setPilih('agx-conv-terminal-env', 'system');
await setPilih('agx-conv-terminal-open', 'background');
hasil.terminalSistem = await j(`
  const t = await import('/src/lib/terminalAgent.ts');
  return { dev: t.keputusanTerminal('npm run dev'), build: t.keputusanTerminal('npm run build') };
`);

await setPilih('agx-conv-terminal-env', 'efficient');
await setPilih('agx-conv-terminal-open', 'never');
hasil.terminalEfisien = await j(`
  const t = await import('/src/lib/terminalAgent.ts');
  return { dev: t.keputusanTerminal('npm run dev') };
`);

/* ── Review scope: set through the dropdown, read through the module ─────── */
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

/* ── Questioning: set through the switch, read through the tool itself ───── */
await setSaklar('agx-conv-tanya-ide', true);
hasil.tanyaHidup = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x','y'] });
  await new Promise(r=>setTimeout(r,120));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('y');
  const hasil = await janji;
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, hasil: String(hasil).slice(0,50) };
`);

await setSaklar('agx-conv-tanya-ide', false);
hasil.tanyaMati = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('ask_user', { pertanyaan: 'Pilih?', pilihan: ['x'] })).slice(0,80) };
`);

/* ── To-Do List: set through the switch, read through todo_write ─────────── */
await setSaklar('agx-conv-todo-ide', false);
hasil.todoMati = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0,90) };
`);

await setSaklar('agx-conv-todo-ide', true);
hasil.todoHidup = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0,90) };
`);

/* ── Auto Fix Lints: set through the switch, run through the real command ── */
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

/* ── Notification: banner/sound/volume through the controls ─────────────── */
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
  await new Promise(r=>setTimeout(r,200));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setPilih('agx-conv-sound-completed', 'none');
hasil.notifNone = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-none', Date.now() - 60000);
  n.catatSelesaiRun('uji-none', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,150));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setSaklar('agx-conv-notif-sound', false);
hasil.notifMati = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  const sebelum = n.riwayatBunyiNotif().length;
  n.catatMulaiRun('uji-mati', Date.now() - 60000);
  n.catatSelesaiRun('uji-mati', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,120));
  return { sebelum, sesudah: n.riwayatBunyiNotif().length };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
