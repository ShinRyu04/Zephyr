// stress-releas.mjs — ukur RAM build RELEASE dengan beban nyata (panel + pane terminal).
// Release tidak punya dev bridge, jadi semua aksi lewat CDP Input (keyboard asli).
import { Cdp } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';
import { execSync } from 'node:child_process';

const { cdp } = await Cdp.attach('9223');

const evalJs = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const res = r?.result?.result ?? r?.result ?? r;
  return res?.value !== undefined ? res.value : res?.description;
};

const key = async (k, code, vk, mods = 0) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await new Promise(r => setTimeout(r, 700));
};

const ram = (label) => {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-bersih.ps1', { cwd: 'D:/Zephyr', encoding: 'utf8' });
  const app = out.match(/ZEPHYR SENDIRI.*?:\s*([\d.,]+)\s*MB\s*\((\d+) proc\)/);
  const sh = out.match(/shell anak PTY.*?:\s*([\d.,]+)\s*MB\s*\((\d+) proc\)/);
  console.log(`   ${label.padEnd(20)} Zephyr=${app ? app[1] : '?'} MB (${app ? app[2] : '?'}p)   shell=${sh ? sh[1] : '?'} MB (${sh ? sh[2] : '?'}p)`);
};

console.log('judul:', await evalJs('document.title'));
ram('idle');

console.log('-> Ctrl+J (panel bawah)');
await key('j', 'KeyJ', 74, 2);
await new Promise(r => setTimeout(r, 2500));
ram('panel terbuka');

console.log('-> Ctrl+Shift+T x3 (pane terminal)');
for (let i = 0; i < 3; i++) await key('T', 'KeyT', 84, 2 | 8);
await new Promise(r => setTimeout(r, 9000));
console.log('   xterm:', await evalJs('document.querySelectorAll(".xterm").length'));
ram('3 pane');

console.log('-> 15 perintah echo (isi buffer)');
await cdp.send('Runtime.evaluate', { expression: `(()=>{const t=document.querySelector('.xterm-helper-textarea'); if(t){t.focus();return 'ok'} return 'no'})()`, returnByValue: true });
for (let i = 0; i < 15; i++) {
  await cdp.send('Input.insertText', { text: `echo STRESS-${i}-${'y'.repeat(60)}\n` });
  await new Promise(r => setTimeout(r, 380));
}
await new Promise(r => setTimeout(r, 6000));
ram('setelah 15 perintah');

console.log('-> settle 20 detik');
await new Promise(r => setTimeout(r, 20000));
ram('settle');

console.log('selesai');
process.exit(0);
