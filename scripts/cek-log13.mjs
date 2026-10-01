// cek-log13.mjs — capture the component's own console output.
//
// The component now logs when it configures the language compartment. Listening
// on Runtime.consoleAPICalled shows whether that code path runs at all, which
// decides between "the effect never fires" and "the dispatch does nothing".

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const logs = [];

cdp.ws.on('message', (raw) => {
  try {
    const m = JSON.parse(String(raw));
    if (m.method === 'Runtime.consoleAPICalled') {
      const teks = (m.params.args ?? [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ');
      if (teks.includes('LANG-UJI')) logs.push(teks);
    }
  } catch {
    /* bukan JSON yang kita urus */
  }
});

await cdp.send('Runtime.enable', {});

const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const dir = 'C:/Users/home/AppData/Local/Temp/zephyr-cek-cm';

  St.getState().setSettingsOpen(false);
  await tunggu(600);
  St.getState().tabs.slice().forEach(t => St.getState().forceCloseTab(t.id));
  await tunggu(700);
  await St.getState().openPath(dir + '/contoh.ts');
  await tunggu(3200);

  const cm = document.querySelector('.cm-content');
  const sp = cm ? [...cm.querySelectorAll('span')].filter(s => !/cm-zbr/.test(s.className)) : [];
  return JSON.stringify({ spanSintaks: sp.length, baris: document.querySelectorAll('.cm-line').length });
`,
  120000,
);

console.log('DOM:', r);
console.log('LOG:', JSON.stringify(logs.slice(0, 6)));
await cdp.close();
