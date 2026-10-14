/**
 * cek-browser-steps.mjs — tampilkan HANYA langkah browser dari run terakhir
 * (args + hasil) supaya kelihatan kapan pane baru dibuat dan kenapa.
 *   node cek-browser-steps.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';
const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
const out = await cdp.json(`return JSON.stringify((() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  const steps = (s.agentSteps || []).filter((x) => x.name);
  return steps.map((x, i) => ({
    i: i + 1, name: x.name, ok: x.ok !== false,
    args: String(x.args || '').replace(/\\s+/g, ' ').slice(0, 160),
    res: String(x.result || '').replace(/\\s+/g, ' ').slice(0, 220),
  })).filter((x) => /browser|web/i.test(x.name) || /pane|reused|not active/i.test(x.res));
})())`);
for (const s of out) console.log(`[${s.i}] ${s.name} ${s.ok ? '' : 'GAGAL'}\n    args: ${s.args}\n    res : ${s.res}`);
await cdp.close();