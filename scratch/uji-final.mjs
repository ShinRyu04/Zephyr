import { cdp } from './cdp2.mjs';
import { execFileSync } from 'child_process';

const bacaDisk = () => {
  const raw = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', 'Get-Content "$env:APPDATA\\Zephyr\\settings.json" -Raw'],
    { encoding: 'utf8' },
  );
  return JSON.parse(raw).conversation ?? {};
};

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.type === 'page');
const c0 = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);
await c0.eval(`location.hash = '#panel=agent-custom&s=conversations'; location.reload();`);
c0.close();
await new Promise((r) => setTimeout(r, 8000));

const c = await cdp(9223, '#panel=agent-custom');
const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
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

const hasil = {};
hasil.kontrol = await c.eval(
  `document.querySelectorAll('.conv-saklar').length + ' saklar / ' + document.querySelectorAll('.conv-pilih').length + ' pilih / ' + document.querySelectorAll('.conv-set').length + ' bagian'`,
);

/* ── Auto Fix Lints: nested Cargo.toml is now found, and it really runs ──── */
await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixRust = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 120), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, galat: r?.galat ?? null };
`);

hasil.autoFixTs = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 120), diminta: r?.diminta ?? 0, galat: r?.galat ?? null };
`);

await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  return { hasil: await m.autoFixGiliran('', ['src-tauri/src/lint_fix.rs']) };
`);

/* ── Questioning: ON through the UI, then the tool really parks ──────────── */
await setSaklar('agx-conv-tanya-ide', true);
hasil.tanyaHidup = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });
  await new Promise(r=>setTimeout(r,200));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('b');
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, hasil: String(await janji).slice(0, 50) };
`);

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

/* ── Notification sound: on / per-outcome choice / off ──────────────────── */
await setSaklar('agx-conv-notif-sound', true);
await c.eval(`(()=>{
  const s = document.querySelector('[data-testid="agx-conv-sound-completed"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(s, 'chime');
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 700));

hasil.notifChime = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-chime', Date.now() - 60000);
  n.catatSelesaiRun('uji-chime', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,250));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await c.eval(`(()=>{
  const s = document.querySelector('[data-testid="agx-conv-sound-completed"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(s, 'none');
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 700));
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
  await new Promise(r=>setTimeout(r,200));
  return { sebelum, sesudah: n.riwayatBunyiNotif().length };
`);

hasil.disk = bacaDisk();
c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
