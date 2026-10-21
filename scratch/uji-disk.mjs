import { cdp } from './cdp2.mjs';
import { execFileSync } from 'child_process';

/*
 * Ground truth is the FILE, not a store read.
 *
 * A probe that imports `/src/lib/store.ts` gets a second module instance in Vite
 * (the panel loaded it with an HMR `?t=` query), so `getState()` there is an
 * empty store that has never been bootstrapped — `settingsLoaded: false`. Every
 * "the switch did nothing" conclusion drawn from that read was the probe's bug.
 * `settings.json` on disk is written by the ONE instance the UI actually uses.
 */
const bacaDisk = () => {
  const raw = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', 'Get-Content "$env:APPDATA\\Zephyr\\settings.json" -Raw'],
    { encoding: 'utf8' },
  );
  return JSON.parse(raw).conversation ?? {};
};

const c = await cdp(9223, '#panel=agent-custom');
const klik = async (id) => {
  const s = await c.eval(`document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked')`);
  await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
  await new Promise((r) => setTimeout(r, 900));
  const t = await c.eval(`document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked')`);
  return `${s} -> ${t}`;
};

console.log('disk sebelum: autoFixIde=' + bacaDisk().autoFixIde);
console.log('klik lint-ide: ' + (await klik('agx-conv-lint-ide')));
console.log('disk sesudah: autoFixIde=' + bacaDisk().autoFixIde);

console.log('disk sebelum: todoListIde=' + bacaDisk().todoListIde);
console.log('klik todo-ide: ' + (await klik('agx-conv-todo-ide')));
console.log('disk sesudah: todoListIde=' + bacaDisk().todoListIde);

console.log('disk sebelum: questioningIde=' + bacaDisk().questioningIde);
console.log('klik tanya-ide: ' + (await klik('agx-conv-tanya-ide')));
console.log('disk sesudah: questioningIde=' + bacaDisk().questioningIde);

c.close();
process.exit(0);
