// Diagnosa F03-V3: undo SESUDAH saveTab (bukan hanya sekali).
import { Cdp, sleep } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const p = 'D:/Zephyr/testfiles/sample.tsx';

await cdp.eval(`window.__ZEPHYR__.getState().openPath(${JSON.stringify(p)})`);
await sleep(900);

const marker = `CEK_UNDO2_${Date.now()}`;
await cdp.eval(`(() => {
  const v = window.__ZEPHYR_CM__();
  v.dispatch({ changes: { from: 0, insert: ${JSON.stringify(`// ${marker}\n`)} } });
  return 'ok';
})()`);
await sleep(700);

await cdp.runAsync(`
  const t = s.tabs.find(x => x.name === 'sample.tsx');
  window.__ZEPHYR_FLUSH__(t.id);
  await s.saveTab(t.id);
  return '1';
`);

const hasil = JSON.parse(
  await cdp.eval(`(() => {
    const v = window.__ZEPHYR_CM__();
    const awal = v.state.doc.toString();
    const langkah = [];
    for (let i = 0; i < 3; i++) {
      window.__ZEPHYR_CMD__('undo');
      const d = v.state.doc.toString();
      langkah.push({ i, masihAda: d.includes(${JSON.stringify(marker)}), kepala: d.slice(0, 26) });
    }
    return JSON.stringify({ adaAwal: awal.includes(${JSON.stringify(marker)}), langkah });
  })()`),
);

console.log(JSON.stringify(hasil, null, 2));
await cdp.close();
