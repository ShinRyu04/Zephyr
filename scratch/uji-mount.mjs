import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
try {
  const r = await cdp.eval(
    `(() => {
    const lama = document.getElementById('uji-x');
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = 'uji-x';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#111)';
    document.body.appendChild(host);
    return 'ok';
  })()`,
  );
  console.log('mount-host OK:', r);
} catch (e) {
  console.log('mount-host GAGAL:', String(e).slice(0, 200));
}
process.exit(0);
