// cek-hijau.mjs — daftar semua elemen di app hidup yang warnanya kehijauan.
// Ambang: kanal hijau jelas dominan (g - r > 25 dan g - b > 15).
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
await sleep(300);

const expr = `(() => {
  const hijau = [];
  const semua = document.querySelectorAll('*');
  const rgb = (s) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
  const cek = (el, prop) => {
    const c = rgb(getComputedStyle(el)[prop]);
    if (!c) return;
    const [r, g, b] = c;
    if (g > 60 && g - r > 25 && g - b > 15) {
      hijau.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        testid: el.getAttribute('data-testid') || '',
        prop,
        warna: getComputedStyle(el)[prop],
        teks: (el.textContent || '').trim().slice(0, 40),
      });
    }
  };
  for (const el of semua) {
    const cs = getComputedStyle(el);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') cek(el, 'backgroundColor');
    cek(el, 'color');
    if (cs.borderColor && cs.borderTopWidth !== '0px') cek(el, 'borderColor');
  }
  return JSON.stringify({ jumlah: hijau.length, hijau: hijau.slice(0, 40) }, null, 1);
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r?.result?.result?.value ?? JSON.stringify(r).slice(0, 400));
process.exit(0);
