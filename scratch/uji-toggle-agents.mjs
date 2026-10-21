import { cdp } from './cdp2.mjs';

const a = await cdp(9223, '#agents');

const j = async (body, ms = 15000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try { return JSON.stringify(await Promise.race([(async () => { ${body} })(), batas])); }
    catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await a.eval(src));
};

const r = (sel) =>
  a.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]})()`);

const hasil = {};

/* ── Toggle the left column off and on ─────────────────────────────────── */
await a.eval(`document.querySelector('[data-testid="ag-toggle-left"]')?.click()`);
await new Promise((x) => setTimeout(x, 400));
hasil.kiriTutup = await j(`
  return {
    kiriAda: !!document.querySelector('.ag-left'),
    sashAda: !!document.querySelector('[data-testid="ag-sash-left"]'),
    chat: (()=>{const e=document.querySelector('.ag-center');if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.width)]})(),
  };
`);
await a.eval(`document.querySelector('[data-testid="ag-toggle-left"]')?.click()`);
await new Promise((x) => setTimeout(x, 400));
hasil.kiriBuka = await j(`
  const e = document.querySelector('.ag-center');
  return { kiriAda: !!document.querySelector('.ag-left'), chatX: e ? Math.round(e.getBoundingClientRect().x) : null };
`);

/* ── Toggle the right panel off: the chat must grow ────────────────────── */
await a.eval(`document.querySelector('[data-testid="ag-toggle-right"]')?.click()`);
await new Promise((x) => setTimeout(x, 400));
hasil.kananTutup = await j(`
  const c = document.querySelector('.ag-center');
  const k = document.querySelector('.ag-right');
  return {
    kananAda: !!k,
    chat: c ? [Math.round(c.getBoundingClientRect().x), Math.round(c.getBoundingClientRect().width)] : null,
    sashChatAda: !!document.querySelector('[data-testid="ag-sash-chat"]'),
  };
`);
await a.eval(`document.querySelector('[data-testid="ag-toggle-right"]')?.click()`);
await new Promise((x) => setTimeout(x, 400));
hasil.kananBuka = await j(`
  const k = document.querySelector('.ag-right');
  return { kananAda: !!k, kanan: k ? [Math.round(k.getBoundingClientRect().x), Math.round(k.getBoundingClientRect().width)] : null };
`);

/* ── Maximise: chat disappears, right panel takes the window ───────────── */
await a.eval(`document.querySelector('[data-testid="ag-maximize"]')?.click()`);
await new Promise((x) => setTimeout(x, 500));
hasil.maks = await j(`
  const c = document.querySelector('.ag-center');
  const k = document.querySelector('.ag-right');
  return {
    chatAda: !!c,
    kanan: k ? [Math.round(k.getBoundingClientRect().x), Math.round(k.getBoundingClientRect().width)] : null,
    total: innerWidth,
  };
`);
await a.eval(`document.querySelector('[data-testid="ag-maximize"]')?.click()`);
await new Promise((x) => setTimeout(x, 500));
hasil.pulih = await j(`
  const c = document.querySelector('.ag-center');
  const k = document.querySelector('.ag-right');
  return {
    chatAda: !!c,
    chat: c ? [Math.round(c.getBoundingClientRect().x), Math.round(c.getBoundingClientRect().width)] : null,
    kanan: k ? [Math.round(k.getBoundingClientRect().x), Math.round(k.getBoundingClientRect().width)] : null,
  };
`);

a.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
