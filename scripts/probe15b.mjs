// probe15b.mjs — apakah event pty-output benar-benar sampai ke frontend?
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] ?? '9223');
const out = await cdp.json(
  `
  const { listen } = await import('/node_modules/.vite/deps/@tauri-apps_api_event.js')
    .catch(() => import('@tauri-apps/api/event'));
  window.__RAW = [];
  const un = await listen('pty-output', (e) => {
    window.__RAW.push({ id: e.payload.id, n: (e.payload.data || '').length });
  });
  const ids = PTY.ids();
  const id = ids[0];
  if (!id) return JSON.stringify({ err: 'tidak ada pane' });
  await PTY.write(id, 'echo ZEPHYRPROBE\\r');
  await wait(2500);
  un();
  const layar = PTY.read(id, 60);
  return JSON.stringify({
    id, event: window.__RAW.slice(0, 6), totalEvent: window.__RAW.length,
    panjangLayar: layar.length, adaEcho: /ZEPHYRPROBE/.test(layar),
    cuplikan: layar.replace(/\\n/g, '|').slice(-140),
  });
`,
  60000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
