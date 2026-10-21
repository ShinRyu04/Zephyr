import { cdp } from './cdp2.mjs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const utama = list.find((x) => !x.url.includes('#'));
const c = await cdp(9223, utama.url);

console.log(
  await c.eval(`JSON.stringify({
    href: location.href,
    hash: location.hash,
    root: document.querySelector('#root')?.firstElementChild?.className,
    judul: document.title,
    agMenubar: !!document.querySelector('.ag-menubar'),
    editorArea: !!document.querySelector('.editor-area'),
    activitybar: !!document.querySelector('.activitybar'),
  })`),
);
c.close();
process.exit(0);
