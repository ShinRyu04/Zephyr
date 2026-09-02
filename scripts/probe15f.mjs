// probe15f.mjs — fokus: exit code pane cmd.
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
  await PTY.write(id, 'exit 3\\r\\n');
  const jejak = [];
  for (let i = 0; i < 12; i++) {
    await wait(700);
    const l = await PTY.list();
    const p = B.panes().find((x) => x.id === id);
    jejak.push({ i, alive: l.length ? l[0].alive : null, status: p ? p.status : null,
                 code: p ? p.exitCode : null });
    if (p && p.status === 'exited') break;
  }
  return JSON.stringify({ id, jejak, layar: PTY.read(id, 40).replace(/\\n/g, '|').slice(-140) });
`,
  120000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
