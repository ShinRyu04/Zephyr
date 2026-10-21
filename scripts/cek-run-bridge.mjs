import { Cdp } from './lib-cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('TIDAK BERLAKU: tidak ada halaman app.');
  process.exit(2);
}
const { cdp } = await Cdp.attach('9223', page.title);

const ev = (expr) => cdp.eval(expr);
const js = (body) => cdp.json(body);

console.log('BRIDGE:', await ev(`typeof window.__ZEPHYR_RUN__`));

console.log(
  'TOOLS:',
  await js(`return JSON.stringify(await window.__ZEPHYR_RUN__.tools(['g++','gcc','java','javac','go','rustc','python','node','ruby','lua','perl','dart','swift','kotlinc','scala','bash']))`),
);

console.log(
  'RESEP:',
  await ev(`JSON.stringify({
    cpp: !!window.__ZEPHYR_RUN__.resep('D:/Testing/menghitung jumlah.cpp'),
    json: !!window.__ZEPHYR_RUN__.resep('D:/x/a.json'),
    py: !!window.__ZEPHYR_RUN__.resep('D:/x/a.py'),
  })`),
);

console.log('RENCANA:', await ev(`JSON.stringify(window.__ZEPHYR_RUN__.rencana('D:/Testing/nilai.cpp'), null, 1)`));

cdp.close();
