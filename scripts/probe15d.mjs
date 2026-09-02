// probe15d.mjs — kenapa pane cmd tidak exit? Lihat pty-exit + status Rust.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] ?? '9223');
const out = await cdp.json(
  `
  // Bersihkan total dulu.
  for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
  for (const p of await PTY.list()) { try { await D.kill(p.id); } catch (e) {} }
  await window.__ZEPHYR_SET_PAUSED__(false);
  TS().setDock('terminal');
  TS().setVisible(true);
  await wait(400);

  const id = await TS().addPane('cmd');
  await wait(2500);
  const awal = PTY.read(id, 40);
  const listAwal = await PTY.list();

  await PTY.write(id, 'exit 3\\r');
  await wait(3000);

  const listAkhir = await PTY.list();
  const p = B.panes().find((x) => x.id === id);
  return JSON.stringify({
    id,
    awalCuplikan: awal.replace(/\\n/g, '|').slice(0, 120),
    listAwal, listAkhir,
    status: p ? p.status : null, exitCode: p ? p.exitCode : null,
    layar: PTY.read(id, 40).replace(/\\n/g, '|').slice(-160),
  });
`,
  90000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
