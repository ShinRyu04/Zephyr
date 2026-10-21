import { writeFileSync } from 'fs';
import { cdp } from './cdp2.mjs';

/*
 * Side-by-side: every number measured from the reference vs the same element in
 * Zephyr. A rebuild that claims "the same" has to survive this table.
 */
const TRAE = {
  menubar: [0, 0, 1536, 56],
  left: [0, 56, 300, 856],
  sashKiri: [297, 56, 4, 856],
  chat: [301, 56, 520, 848],
  right: [825, 56, 703, 848],
  tabBar: [826, 57, 701, 48],
  newTask: [12, 56, 276, 34],
  footer: [0, 856, 300, 48],
  chatHeader: [302, 57, 518, 48],
};

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ag = list.find((x) => x.url.includes('#agents'));
const a = await cdp(9223, '#agents');

const hasil = await a.eval(`JSON.stringify((()=>{
  const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
  const q=(s)=>document.querySelector(s);
  return {
    menubar: r(q('.ag-menubar')),
    left: r(q('.ag-left')),
    sashKiri: r(q('.ag-sash-kiri')),
    chat: r(q('.ag-center')),
    right: r(q('.ag-right')),
    tabBar: r(q('.ag-tabs')),
    newTask: r(q('.ag-sesi-baru')),
    footer: r(q('.ag-sesi-footer')),
    chatHeader: r(q('.ag-center .ai-head')),
    sesiRow: r(q('.ag-sesi-row')),
    grupHead: r(q('.ag-sesi-grup-head')),
    hariJudul: r(q('.ag-sesi-hari-judul')),
    tab0: r(q('.ag-tab')),
    radiusChat: getComputedStyle(q('.ag-center')).borderRadius,
    radiusTab: getComputedStyle(q('.ag-tab')).borderRadius,
    radiusRow: getComputedStyle(q('.ag-sesi-row')).borderRadius,
    radiusComposer: getComputedStyle(q('.ag-center .ai-input-row')).borderRadius,
    bgFrame: getComputedStyle(q('.ag-root')).backgroundColor,
    bgPanel: getComputedStyle(q('.ag-center')).backgroundColor,
  };
})())`);

const o = JSON.parse(hasil);
writeFileSync('D:\\Zephyr\\scratch\\banding.txt', JSON.stringify(o, null, 1), 'utf8');

const baris = [];
const cmp = (nama, kunci) => {
  const t = TRAE[kunci];
  const z = o[kunci];
  if (!z) {
    baris.push(`${nama.padEnd(14)} TRAE ${t.join(',').padEnd(22)} Zephyr (tidak ada)`);
    return;
  }
  const sama = t.every((v, i) => Math.abs(v - z[i]) <= 1);
  baris.push(`${nama.padEnd(14)} TRAE ${t.join(',').padEnd(22)} Zephyr ${z.join(',').padEnd(22)} ${sama ? 'SAMA' : 'BEDA'}`);
};
cmp('menubar', 'menubar');
cmp('kolom kiri', 'left');
cmp('sash kiri', 'sashKiri');
cmp('chat card', 'chat');
cmp('panel kanan', 'right');
cmp('tab bar', 'tabBar');
cmp('New task', 'newTask');
cmp('footer', 'footer');
cmp('header chat', 'chatHeader');

baris.push('');
baris.push('radius chat    : ' + o.radiusChat + '  (TRAE 16px)');
baris.push('radius tab     : ' + o.radiusTab + '  (TRAE 8px)');
baris.push('radius sesi row: ' + o.radiusRow + '  (TRAE 6px)');
baris.push('radius composer: ' + o.radiusComposer + '  (TRAE 16px)');
baris.push('baris sesi     : ' + (o.sesiRow ? o.sesiRow[3] : '-') + 'px tinggi  (TRAE 32px)');
baris.push('grup head      : ' + (o.grupHead ? o.grupHead[3] : '-') + 'px tinggi  (TRAE 32px)');
baris.push('judul hari     : ' + (o.hariJudul ? o.hariJudul[3] : '-') + 'px tinggi  (TRAE 32px)');

console.log(baris.join('\n'));
a.close();
process.exit(0);
