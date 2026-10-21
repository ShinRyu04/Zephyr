import { Cdp, sleep } from '../scripts/lib-cdp.mjs';

const PORT = 9223;
const daftar = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');

const semua = await daftar();
console.log('== targets ==');
for (const t of semua) console.log(t.title, '|', t.url);

for (const t of semua.filter((x) => (x.url ?? '').includes('#panel='))) {
  const c = await Cdp.connect(t.webSocketDebuggerUrl);
  const ada = await c.eval(`typeof window.__ZEPHYR_SET__`);
  let info = { url: t.url, bridge: ada };
  if (ada !== 'undefined') {
    await c.eval(`(() => { window.__PROBE_SECTION__ = 'models'; return 1; })()`);
    info = await c.json(`
      SET.ui.getState().setSection('models');
      await wait(900);
      return JSON.stringify({
        url: ${JSON.stringify(t.url)},
        section: SET.ui.getState().section,
        adaProv: !!q('[data-testid="prov-key-gemini"]'),
        adaNav: !!q('[data-testid="set-nav-models"]'),
        provCards: qa('[data-provider]').length,
        setBody: q('.set-body')?.children.length ?? -1,
        judul: q('.set-h2')?.textContent ?? '',
        teks: (q('.set-body')?.innerText ?? '').slice(0, 160),
      });
    `).catch((e) => ({ err: String(e.message) }));
  }
  console.log('== panel ==', JSON.stringify(info));
  c.close();
}
await sleep(10);
