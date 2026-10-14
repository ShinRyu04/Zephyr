// Probe: apakah openPath menambah tab atau menimpa tab yang sedang aktif?
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const R = [];

const baca = () =>
  cdp.json(`return JSON.stringify(await (async () => {
    const s = window.__ZEPHYR__.getState();
    return {
      n: s.tabs.length,
      names: s.tabs.map((t) => t.name),
      pin: s.tabs.map((t) => t.pinned ?? t.isPreview ?? t.preview ?? null),
      domTab: document.querySelectorAll('.tabbar .tab').length,
    };
  })())`);

const open = async (file) => {
  await cdp.json(`return JSON.stringify(await (async () => {
    const s = window.__ZEPHYR__.getState();
    const ws = typeof s.workspace === 'string' ? s.workspace : (s.workspace?.path ?? s.workspace?.root ?? '');
    await s.openPath(String(ws).replace(/\\\\/g, '/') + '/${file}');
    return { ws };
  })())`);
  await new Promise((r) => setTimeout(r, 600));
  const st = await baca();
  R.push(`${file.padEnd(18)} -> ${st.n} tab [dom=${st.domTab}]: ${st.names.join(', ')}  pin=${JSON.stringify(st.pin)}`);
};

for (const f of ['sample.tsx', 'sample.py', 'sample.json', 'sample-bom.txt', 'sample-ansi.txt']) {
  await open(f);
}

// berkas yang SAMA dua kali: tab kembar atau ditimpa?
await open('sample.tsx');
await open('sample.tsx');

console.log(R.join('\n'));
await cdp.close();
process.exit(0);
