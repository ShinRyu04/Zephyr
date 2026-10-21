import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom&s=conversations');

/* Click the "Conversations" row in the left menu, then measure. */
await c.eval(`(()=>{
  const it = [...document.querySelectorAll('*')].find(e => e.children.length===0 && /^Conversations$/i.test((e.textContent||'').trim()));
  it?.click();
  return !!it;
})()`);
await new Promise((r) => setTimeout(r, 1500));

const hasil = JSON.parse(
  await c.eval(`JSON.stringify((()=>{
    const ada = (id) => !!document.querySelector('[data-testid="'+id+'"]');
    const wajib = ['agx-conv-todo-ide','agx-conv-todo-solo','agx-conv-lint-ide','agx-conv-lint-solo','agx-conv-tanya-ide','agx-conv-tanya-solo','agx-conv-review-jump','agx-conv-notif-banner','agx-conv-notif-sound','agx-conv-notif-volume','agx-conv-review-scope','agx-conv-terminal-env','agx-conv-terminal-open','agx-conv-sound-completed','agx-conv-sound-waiting','agx-conv-sound-stopped'];
    const vol = document.querySelector('[data-testid="agx-conv-notif-volume"]');
    const r = vol?.getBoundingClientRect();
    return {
      saklar: document.querySelectorAll('.conv-saklar').length,
      pilih: document.querySelectorAll('.conv-pilih').length,
      bagian: document.querySelectorAll('.conv-set').length,
      hilang: wajib.filter(id => !ada(id)),
      volumeDiKiri: !!(vol && vol.closest('.conv-set-teks')),
      volumeX: r ? Math.round(r.x) : 0,
      volumeNilai: vol?.value ?? null,
    };
  })())`),
);
console.log(JSON.stringify(hasil, null, 1));

/* Toggle every switch and change every select, to prove they persist. */
const saklar = ['agx-conv-todo-ide','agx-conv-todo-solo','agx-conv-lint-ide','agx-conv-lint-solo','agx-conv-tanya-ide','agx-conv-tanya-solo','agx-conv-review-jump','agx-conv-notif-banner','agx-conv-notif-sound'];
let okSaklar = 0;
const gagalSaklar = [];
for (const id of saklar) {
  const sebelum = await c.eval(`document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked')`);
  await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
  await new Promise((r) => setTimeout(r, 120));
  const sesudah = await c.eval(`document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked')`);
  if (sebelum !== sesudah && sesudah !== null) okSaklar++;
  else gagalSaklar.push(id);
}
console.log(`saklar: ${okSaklar}/${saklar.length}${gagalSaklar.length ? ' GAGAL=' + gagalSaklar.join(',') : ''}`);

const pilih = ['agx-conv-review-scope','agx-conv-terminal-env','agx-conv-terminal-open','agx-conv-sound-completed','agx-conv-sound-waiting','agx-conv-sound-stopped'];
let okPilih = 0;
for (const id of pilih) {
  const r = JSON.parse(await c.eval(`JSON.stringify((()=>{
    const s = document.querySelector('[data-testid="${id}"]');
    if (!s) return {ada:false};
    const o = [...s.options].map(x=>x.value);
    const asli = s.value;
    const baru = o.find(v => v !== asli) ?? asli;
    s.value = baru;
    s.dispatchEvent(new Event('change', {bubbles:true}));
    return {ada:true, asli, baru};
  })())`));
  await new Promise((r) => setTimeout(r, 120));
  const sesudah = await c.eval(`document.querySelector('[data-testid="${id}"]')?.value`);
  if (r.ada && sesudah === r.baru && r.asli !== r.baru) okPilih++;
}
console.log(`pilih: ${okPilih}/${pilih.length}`);

/* Read what landed in settings.json through the live store. */
const simpan = await c.eval(`(async()=>{
  const m = await import('/src/lib/store.ts');
  return JSON.stringify(m.useStore.getState().settings.conversation);
})()`);
console.log('tersimpan: ' + simpan);

c.close();
process.exit(0);

