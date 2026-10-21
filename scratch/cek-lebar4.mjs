import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');

/* Click, wait for the commit, THEN read — all inside one evaluation. */
console.log(
  await a.eval(`(async () => {
    const btn = document.querySelector('[data-testid="ag-toggle-right"]');
    btn.click();
    await new Promise(r=>setTimeout(r,600));
    const c = document.querySelector('.ag-center');
    const s = getComputedStyle(c);
    const hasil = {
      kelas: c.className,
      inline: c.getAttribute('style'),
      flexGrow: s.flexGrow, flexBasis: s.flexBasis, width: s.width,
      box: Math.round(c.getBoundingClientRect().width),
      indukW: Math.round(c.parentElement.getBoundingClientRect().width),
    };
    btn.click();
    await new Promise(r=>setTimeout(r,400));
    return JSON.stringify(hasil);
  })()`),
);
a.close();
process.exit(0);
