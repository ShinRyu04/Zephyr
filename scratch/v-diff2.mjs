import * as Cdp from '../scripts/lib-cdp.mjs';

const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);

const hasil = [];
const cek = (id, ok, info) => {
  hasil.push(ok);
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${info}`);
};

/* Kosongkan filter dulu, lalu ukur batas barisnya. */
await cdp.eval(
  `(() => {
     const f = document.querySelector('[data-testid="ag-diff-filter"]');
     const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
     set.call(f, '');
     f.dispatchEvent(new Event('input', { bubbles: true }));
     return 'ok';
   })()`,
  15000,
);
await new Promise((x) => setTimeout(x, 2500));

const awal = await cdp.eval(
  `[...document.querySelectorAll('.ag-diff-row')].length + '|' + (document.querySelector('[data-testid="ag-diff-more"]')?.textContent ?? '-')`,
  30000,
);
cek('D1', awal.startsWith('400|') && awal.includes('more files'), `baris|lebih = ${awal}`);

await cdp.eval(
  `(() => {
     const f = document.querySelector('[data-testid="ag-diff-filter"]');
     const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
     set.call(f, 'AgentsBrowser');
     f.dispatchEvent(new Event('input', { bubbles: true }));
     return 'ok';
   })()`,
  15000,
);
await new Promise((x) => setTimeout(x, 1200));
const sesudah = await cdp.eval(
  `[...document.querySelectorAll('.ag-diff-row')].length + '|' + (document.querySelector('.ag-diff-row')?.getAttribute('title') ?? '')`,
  20000,
);
cek('D2', sesudah.startsWith('1|') && sesudah.includes('AgentsBrowser'), `filter -> ${sesudah}`);

await cdp.eval(`(() => { document.querySelector('[data-testid="ag-diff-toggle-diff"]').click(); return 1; })()`, 15000);
await new Promise((x) => setTimeout(x, 3000));
const patch = await cdp.eval(`(document.querySelector('.ag-diff-patch')?.textContent ?? '').slice(0, 200)`, 30000);
cek('D3', /diff --git|@@|---/m.test(patch), `patch: ${JSON.stringify(patch.slice(0, 110))}`);

const tombol = await cdp.eval(
  `['ag-diff-discard','ag-diff-commit','ag-diff-message'].map(k => !!document.querySelector('[data-testid="'+k+'"]')).join(',')`,
  15000,
);
cek('D4', tombol === 'true,true,true', `discard/commit/pesan = ${tombol}`);

console.log(`\n== ${hasil.filter(Boolean).length}/${hasil.length} lulus ==`);
cdp.close();
