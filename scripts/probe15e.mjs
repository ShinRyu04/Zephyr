// probe15e.mjs — ukur cols/rows + apakah cmd butuh \r\n, dan berapa byte
// yang benar-benar masuk buffer untuk kiriman besar.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] ?? '9223');
const out = await cdp.json(
  `
  for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
  for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
  await window.__ZEPHYR_SET_PAUSED__(false);
  TS().setDock('terminal');
  TS().setVisible(true);
  await wait(400);

  const id = await TS().addPane('cmd');
  await wait(2500);
  const size = PTY.size(id);

  // (a) cmd + \\r\\n
  await PTY.write(id, 'echo AA\\r\\n');
  await wait(1200);
  const aAda = /AA/.test(PTY.read(id, 60));

  // (b) kirim 10.000 karakter tanpa Enter, ukur berapa yang masuk buffer
  await PTY.write(id, 'rem ' + 'Z'.repeat(10000));
  await wait(2000);
  const layar = PTY.read(id, 800);
  const jumlahZ = (layar.match(/Z/g) || []).length;

  // (c) exit dengan \\r\\n
  await PTY.write(id, '\\r\\n');
  await wait(800);
  await PTY.write(id, 'exit 3\\r\\n');
  await wait(2500);
  const listAkhir = await PTY.list();
  const p = B.panes().find((x) => x.id === id);

  return JSON.stringify({
    id, size, aAda, jumlahZ, panjangLayar: layar.length,
    listAkhir, status: p ? p.status : null, exitCode: p ? p.exitCode : null,
  });
`,
  120000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
