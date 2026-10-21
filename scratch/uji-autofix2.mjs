import { cdp } from './cdp2.mjs';

/*
 * Set the hash and RELOAD.
 *
 * `panelDariHash` is read once, at boot (`main.tsx`), so changing the hash on a
 * live page does not switch roots — the window keeps rendering the editor root
 * and the panel's testids never appear. An earlier probe measured exactly that
 * and concluded "0 controls", which was the probe's fault, not the page's.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => x.type === 'page');
const c0 = await cdp(9223, utama.url.includes('#') ? utama.url.split('#')[0] : utama.url);
await c0.eval(`location.hash = '#panel=agent-custom&s=conversations'; location.reload();`);
c0.close();
await new Promise((r) => setTimeout(r, 7000));

const c = await cdp(9223, '#panel=agent-custom');

const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

const setSaklar = async (id, nyala) => {
  const ada = await c.eval(`!!document.querySelector('[data-testid="${id}"]')`);
  if (!ada) return 'tidak ada';
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 350));
  }
  return await c.eval(`document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked')`);
};

const hasil = {};
hasil.root = await c.eval(`document.querySelector('#root')?.firstElementChild?.className ?? '(kosong)'`);
hasil.adaKontrol = await c.eval(
  `document.querySelectorAll('.conv-saklar').length + '/' + document.querySelectorAll('.conv-pilih').length`,
);

/* Auto Fix Lints: switch ON through the UI, then run against a real file. */
hasil.saklarLintOn = await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixHidup = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 110), diminta: r?.diminta ?? 0, berubah: r?.berubah ?? [], galat: r?.galat ?? null };
`);

hasil.saklarLintOff = await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  return { hasil: await m.autoFixGiliran('', ['src/lib/autoFix.ts']) };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
