import { Cdp } from './lib-cdp.mjs';
import fs from 'fs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const s = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return {
    busy: A.agentBusy,
    todos: (A.agentTodos || []).map((t) => ({ st: t.status, tx: String(t.content ?? t.text ?? '').slice(0, 70) })),
    steps: (A.agentSteps || []).map((x) => ({
      k: x.kind, n: x.name, ok: x.ok, at: x.at,
      a: String(x.args || '').replace(/\\s+/g, ' ').slice(0, 160),
      r: String(x.result || '').replace(/\\s+/g, ' ').slice(0, 220),
    })),
  };
})())`);
fs.writeFileSync('scripts/_jejak-berat.json', JSON.stringify(s, null, 1));
console.log('busy=' + s.busy + ' langkah=' + s.steps.length + ' todos=' + s.todos.length);
for (const t of s.todos) console.log('  ' + t.st + ' ' + t.tx);
const t0 = s.steps[0] && s.steps[0].at ? s.steps[0].at : 0;
for (const x of s.steps.slice(-30)) {
  const d = x.at && t0 ? Math.round((x.at - t0) / 1000) + 's' : '';
  console.log(`  ${d} [${x.k}${x.n ? '/' + x.n : ''}${x.ok === false ? ' !' : ''}] ${x.n ? x.a : x.r.slice(0, 80)}`);
}
await cdp.close();
