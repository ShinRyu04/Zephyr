import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr', 'localhost']);
const s = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const steps = (A.agentSteps || []).filter((x) => x.name);
  const arsip = steps.filter((x) => /hasil lengkap .* disimpan di|terpotong: .* di TENGAH/.test(String(x.result || '')));
  const pola = {};
  for (const x of steps) {
    const k = x.name + ' ' + String(x.args || '').slice(0, 60).replace(/\\s+/g, ' ');
    pola[k] = (pola[k] || 0) + 1;
  }
  const ulang = Object.entries(pola).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    n: steps.length,
    arsipN: arsip.length,
    arsipContoh: arsip.slice(0, 4).map((x) => x.name + ' :: ' + String(x.result || '').replace(/\\s+/g, ' ').slice(0, 300)),
    ulang,
    todos: (A.agentTodos || []).map((t) => t.status + ' ' + String(t.content || '').slice(0, 50)),
  };
})())`);
console.log('langkah=' + s.n + ' hasil-terarsip/terpotong=' + s.arsipN);
for (const c of s.arsipContoh) console.log('  * ' + c);
console.log('--- panggilan berulang ---');
for (const [k, v] of s.ulang) console.log('  ' + v + 'x  ' + k);
console.log('--- todo ---');
for (const t of s.todos) console.log('  ' + t);
await cdp.close();
