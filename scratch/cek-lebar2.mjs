import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');
const j = async (body) => JSON.parse(await a.eval(`(async () => JSON.stringify(await (async () => { ${body} })()))()`));

/* Click the real toggle, then measure in the SAME evaluation. */
console.log(
  JSON.stringify(
    await j(`
      const btn = document.querySelector('[data-testid="ag-toggle-right"]');
      btn.click();
      await new Promise(r=>setTimeout(r,500));
      const c = document.querySelector('.ag-center');
      const b = c.getBoundingClientRect();
      const out = {
        kelas: c.className,
        box: [Math.round(b.x), Math.round(b.width)],
        kananAda: !!document.querySelector('.ag-right'),
        panelsW: Math.round(document.querySelector('.ag-panels').getBoundingClientRect().width),
      };
      btn.click();
      await new Promise(r=>setTimeout(r,400));
      return out;
    `),
    null,
    1,
  ),
);
a.close();
process.exit(0);
