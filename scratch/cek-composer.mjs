import { Cdp, sleep } from '../scripts/lib-cdp.mjs';
const PORT = '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !(t.url ?? '').includes('#'));
const { cdp } = await Cdp.attach(PORT, page.title);
await cdp.eval(`window.__ZEPHYR__.getState().bukaViewAi('ai-chat'); 'ok'`);
await sleep(600);
const out = await cdp.eval(`JSON.stringify((() => {
  const box = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { cls: el.className.toString().slice(0,60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      bg: s.backgroundColor, radius: s.borderRadius, p: s.padding, m: s.margin, border: s.borderTopWidth + ' ' + s.borderTopColor, font: s.fontSize };
  };
  const row = document.querySelector('.ai-input-row');
  const panel = document.querySelector('.ai-panel');
  const tb = row?.querySelector('.ai-input-toolbar');
  return {
    win: { w: innerWidth, h: innerHeight },
    panel: box(panel),
    row: box(row),
    branch: box(row?.querySelector('.ai-branch-chip')),
    field: box(row?.querySelector('.ai-input')),
    toolbar: box(tb),
    kids: [...(tb?.children ?? [])].map(box),
    sendWrap: box(row?.querySelector('.ai-send-wrap')),
    round: [...(row?.querySelectorAll('.ai-round-btn') ?? [])].map((b) => ({ ...box(b), tag: b.getAttribute('data-testid'), stop: b.className.includes('is-stop') })),
  };
})())`);
console.log(out);
