import { cdp } from './cdp2.mjs';
import { execFileSync } from 'child_process';

const c = await cdp(9223, '#panel=agent-custom');

/* Move the volume slider the way a reader would. */
await c.eval(`(()=>{
  const s = document.querySelector('[data-testid="agx-conv-notif-volume"]');
  if (!s) return 'no slider';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '65');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return s.value;
})()`);
await new Promise((r) => setTimeout(r, 1200));

/* Toggle the Sound switch so a full conversation patch is written too. */
await c.eval(`document.querySelector('[data-testid="agx-conv-notif-sound"]')?.click()`);
await new Promise((r) => setTimeout(r, 1500));

console.log('nilai slider sesudah: ' + (await c.eval(`document.querySelector('[data-testid="agx-conv-notif-volume"]')?.value`)));
c.close();

/* Read the file from disk — the only view that cannot be faked by a store. */
const j = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command',
  `Get-Content "$env:APPDATA\\Zephyr\\settings.json" -Raw`], { encoding: 'utf8' }));
console.log('disk notifVolume: ' + JSON.stringify(j.conversation?.notifVolume));
console.log('disk notifSound : ' + JSON.stringify(j.conversation?.notifSound));
process.exit(0);
