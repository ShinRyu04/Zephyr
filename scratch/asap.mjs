import { cdp } from './cdp2.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.type === 'page');
const c0 = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);
await c0.eval(`location.hash = '#panel=agent-custom&s=conversations'; location.reload();`);
c0.close();
await new Promise((r) => setTimeout(r, 9000));

const c = await cdp(9223, '#panel=agent-custom');
const out = JSON.parse(
  await c.eval(`JSON.stringify((()=>{
    const ada = (id) => !!document.querySelector('[data-testid="'+id+'"]');
    const wajib = ['agx-conv-todo-ide','agx-conv-todo-solo','agx-conv-lint-ide','agx-conv-lint-solo','agx-conv-tanya-ide','agx-conv-tanya-solo','agx-conv-review-jump','agx-conv-notif-banner','agx-conv-notif-sound','agx-conv-notif-volume','agx-conv-review-scope','agx-conv-terminal-env','agx-conv-terminal-open','agx-conv-sound-completed','agx-conv-sound-waiting','agx-conv-sound-stopped'];
    const vol = document.querySelector('[data-testid="agx-conv-notif-volume"]');
    const pane = document.querySelector('.agc-pane');
    const kol = document.querySelector('.conv-setelan');
    const g = (e) => { const r = e?.getBoundingClientRect(); return r ? { x: Math.round(r.x), w: Math.round(r.width), kanan: Math.round(innerWidth - r.right) } : null; };
    return {
      bagian: document.querySelectorAll('.conv-set').length,
      saklar: document.querySelectorAll('.conv-saklar').length,
      pilih: document.querySelectorAll('.conv-pilih').length,
      hilang: wajib.filter((id) => !ada(id)),
      volumeDiKiri: !!(vol && vol.closest('.conv-set-teks')),
      pane: g(pane),
      kolom: g(kol),
    };
  })())`),
);

console.log(JSON.stringify(out, null, 1));
c.close();
process.exit(0);
